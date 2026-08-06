import unittest
import asyncio
import time
import json
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from app.services.batcher import TelemetryBatcher
from app.models.schemas import TelemetryPayload
from app.db.postgres import db_manager

class MockRedis:
    def __init__(self):
        self.sets = {}
        self.kvs = {}

    async def sadd(self, key: str, member: str):
        if key not in self.sets:
            self.sets[key] = set()
        self.sets[key].add(member)
        return 1

    async def srem(self, key: str, member: str):
        if key in self.sets and member in self.sets[key]:
            self.sets[key].remove(member)
            return 1
        return 0

    async def smembers(self, key: str):
        return set(self.sets.get(key, set()))

    async def scard(self, key: str):
        if key not in self.sets:
            return 0
        return len(self.sets[key])

    async def get(self, key: str):
        return self.kvs.get(key)

    async def set(self, key: str, value: str):
        self.kvs[key] = value
        return True

    # List methods needed for buffer
    async def rpush(self, key: str, value: str):
        if key not in self.sets:
            self.sets[key] = []
        self.sets[key].append(value)
        return len(self.sets[key])

    async def lpush(self, key: str, value: str):
        if key not in self.sets:
            self.sets[key] = []
        self.sets[key].insert(0, value)
        return len(self.sets[key])

    async def rpop(self, key: str):
        if key in self.sets and len(self.sets[key]) > 0:
            return self.sets[key].pop()
        return None

    async def llen(self, key: str):
        if key not in self.sets:
            return 0
        # If it's a list
        if isinstance(self.sets[key], list):
            return len(self.sets[key])
        return 0

    async def lrange(self, key: str, start: int, stop: int):
        if key not in self.sets:
            return []
        lst = self.sets[key]
        if stop == -1:
            return lst[start:]
        return lst[start:stop+1]

    async def delete(self, key: str):
        if key in self.sets:
            del self.sets[key]
        if key in self.kvs:
            del self.kvs[key]
        return 1

    async def rename(self, src: str, dst: str):
        if src not in self.sets and src not in self.kvs:
            raise Exception("no such key")
        if src in self.sets:
            self.sets[dst] = self.sets[src]
            del self.sets[src]
        if src in self.kvs:
            self.kvs[dst] = self.kvs[src]
            del self.kvs[src]
        return True

    def register_script(self, script_code):
        async def script_runner(keys=None, args=None):
            if keys:
                buffer_key = keys[0]
                active_set_key = keys[1]
                is_empty = buffer_key not in self.sets or len(self.sets[buffer_key]) == 0
                if is_empty:
                    if active_set_key in self.sets and buffer_key in self.sets[active_set_key]:
                        self.sets[active_set_key].remove(buffer_key)
            return True
        return script_runner

class AsyncContextManagerMock:
    def __init__(self, mock_conn):
        self.mock_conn = mock_conn

    async def __aenter__(self):
        return self.mock_conn

    async def __aexit__(self, exc_type, exc, tb):
        pass

class TestTelemetryBatcher(unittest.TestCase):
    def setUp(self):
        self.batcher = TelemetryBatcher()
        self.redis = MockRedis()
        
        # Mock database connection
        self.mock_conn = AsyncMock()
        self.mock_conn.executemany = AsyncMock()
        self.mock_conn.transaction = MagicMock()
        self.mock_conn.transaction.return_value.__aenter__ = AsyncMock()
        self.mock_conn.transaction.return_value.__aexit__ = AsyncMock(return_value=False)
        
        self.mock_pool = MagicMock()
        self.mock_pool.acquire.return_value = AsyncContextManagerMock(self.mock_conn)
        
        self.original_pool = db_manager.pool
        db_manager.pool = self.mock_pool

    def tearDown(self):
        db_manager.pool = self.original_pool

    def run_async(self, coro):
        return asyncio.run(coro)

    def create_payload(self, device_id="pico-device1", washroom_id="L2_M01", whi=45.0):
        return TelemetryPayload(
            device_id=device_id,
            timestamp=datetime.now(timezone.utc),
            avg_nh3_ppm=1.2,
            peak_nh3_ppm=2.5,
            avg_temperature_c=22.4,
            avg_humidity_percent=55.0,
            throughput=10,
            occupancy_inside=2,
            abandon_rate_percent=0.0,
            raw_whi=whi,
            terminal="T1",
            washroom_id=washroom_id,
            msg_type="telemetry"
        )

    def test_push_payload_adds_to_redis_buffer(self):
        payload = self.create_payload()
        self.run_async(self.batcher.push_payload("T1", "L2_M01", payload, self.redis))

        buffer_key = "state:floor:T1:L2:telemetry_buffer"
        
        # Verify it's in the list
        llen = self.run_async(self.redis.llen(buffer_key))
        self.assertEqual(llen, 1)

        # Verify buffer key registered in active buffers set
        active = self.run_async(self.redis.smembers("state:active_telemetry_buffers"))
        self.assertIn(buffer_key, active)

    def test_size_limit_triggers_immediate_flush(self):
        buffer_key = "state:floor:T1:L2:telemetry_buffer"
        
        # Pre-fill list with 99 items
        for i in range(99):
            payload = self.create_payload(device_id=f"pico-device-{i}")
            self.run_async(self.redis.rpush(buffer_key, payload.model_dump_json()))
        
        # Ensure active_buffers includes the key
        self.run_async(self.redis.sadd("state:active_telemetry_buffers", buffer_key))

        # Push the 100th item, which should trigger immediate flush
        payload = self.create_payload(device_id="pico-device-100")
        self.run_async(self.batcher.push_payload("T1", "L2_M01", payload, self.redis))

        # Verify the database mock was called with bulk insert
        self.mock_conn.executemany.assert_called_once()
        self.assertEqual(len(self.mock_conn.executemany.call_args[0][1]), 100)

        # Verify Redis buffer is now empty/cleared
        llen = self.run_async(self.redis.llen(buffer_key))
        self.assertEqual(llen, 0)

        # Verify buffer key removed from active buffers set
        active = self.run_async(self.redis.smembers("state:active_telemetry_buffers"))
        self.assertNotIn(buffer_key, active)

    def test_database_write_failure_restores_buffer(self):
        payload = self.create_payload()
        self.run_async(self.batcher.push_payload("T1", "L2_M01", payload, self.redis))
        
        buffer_key = "state:floor:T1:L2:telemetry_buffer"

        # Make DB insert fail
        self.mock_conn.executemany.side_effect = Exception("DB Connection Error")

        # Attempt to flush, expecting exception
        with self.assertRaises(Exception):
            self.run_async(self.batcher.flush_buffer(buffer_key, self.redis))

        # Verify data is restored back to the buffer to prevent data loss
        llen = self.run_async(self.redis.llen(buffer_key))
        self.assertEqual(llen, 1)

    def test_time_based_flush_condition(self):
        # Push 1 item to L2 buffer
        payload = self.create_payload()
        self.run_async(self.batcher.push_payload("T1", "L2_M01", payload, self.redis))
        buffer_key = "state:floor:T1:L2:telemetry_buffer"

        # Setup last flush time to be 6 seconds ago
        last_flush_key = "state:floor:T1:L2:last_flush_time"
        six_seconds_ago = time.time() - 6.0
        self.run_async(self.redis.set(last_flush_key, str(six_seconds_ago)))

        # Check conditions by running a single cycle manually of monitor_and_flush:
        # Instead of launching the loop, we call flush checks directly using test context
        active_buffers = self.run_async(self.redis.smembers("state:active_telemetry_buffers"))
        self.assertEqual(len(active_buffers), 1)

        for bk in list(active_buffers):
            length = self.run_async(self.redis.llen(bk))
            self.assertEqual(length, 1)
            
            last_time_str = self.run_async(self.redis.get(last_flush_key))
            time_since_last = time.time() - float(last_time_str)
            self.assertTrue(time_since_last >= 5.0)

            # Trigger flush due to timeout
            self.run_async(self.batcher.flush_buffer(bk, self.redis))

        # Verify bulk insert executed
        self.mock_conn.executemany.assert_called_once()
        
        # Verify keys are cleared
        llen = self.run_async(self.redis.llen(buffer_key))
        self.assertEqual(llen, 0)

if __name__ == "__main__":
    unittest.main()
