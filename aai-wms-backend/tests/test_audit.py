import unittest
import asyncio
import time
import json
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime, timezone

from app.services.audit import AuditBatcher
from app.db.postgres import db_manager

class MockRedis:
    def __init__(self):
        self.sets = {}
        self.kvs = {}

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

class AsyncContextManagerMock:
    def __init__(self, mock_conn):
        self.mock_conn = mock_conn

    async def __aenter__(self):
        return self.mock_conn

    async def __aexit__(self, exc_type, exc, tb):
        pass

class TestAuditBatcher(unittest.TestCase):
    def setUp(self):
        self.batcher = AuditBatcher()
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
        async def runner():
            res = await coro
            if hasattr(self, 'batcher') and getattr(self.batcher, '_flush_tasks', None):
                await asyncio.gather(*self.batcher._flush_tasks, return_exceptions=True)
            await asyncio.sleep(0.01)
            return res
        return asyncio.run(runner())

    def test_push_raw_adds_to_redis_buffer(self):
        topic = "washroom/T1/L2_M01/telemetry"
        payload = b'{"avg_nh3_ppm": 1.2, "raw_whi": 45.0}'
        self.run_async(self.batcher.push_raw(topic, payload, self.redis))

        buffer_key = "state:audit_buffer"
        
        # Verify it's in the list
        llen = self.run_async(self.redis.llen(buffer_key))
        self.assertEqual(llen, 1)

        # Verify the record structure
        items = self.run_async(self.redis.lrange(buffer_key, 0, -1))
        record = json.loads(items[0])
        self.assertEqual(record["topic"], topic)
        self.assertEqual(record["raw_payload"], payload.decode('utf-8'))
        self.assertIn("received_at", record)

    def test_size_limit_triggers_immediate_flush(self):
        buffer_key = "state:audit_buffer"
        
        # Pre-fill list with 99 items
        for i in range(99):
            record = {
                "received_at": datetime.now(timezone.utc).isoformat(),
                "topic": "topic",
                "raw_payload": f"payload_{i}"
            }
            self.run_async(self.redis.rpush(buffer_key, json.dumps(record)))
        
        # Push the 100th item, which should trigger immediate flush
        topic = "washroom/T1/L2_M01/telemetry"
        payload = b'payload_100'
        self.run_async(self.batcher.push_raw(topic, payload, self.redis))

        # Verify the database mock was called with bulk insert
        self.mock_conn.executemany.assert_called_once()
        self.assertEqual(len(self.mock_conn.executemany.call_args[0][1]), 100)

        # Verify Redis buffer is now empty/cleared
        llen = self.run_async(self.redis.llen(buffer_key))
        self.assertEqual(llen, 0)

    def test_database_write_failure_restores_buffer(self):
        topic = "washroom/T1/L2_M01/telemetry"
        payload = b'payload_fail'
        self.run_async(self.batcher.push_raw(topic, payload, self.redis))
        
        buffer_key = "state:audit_buffer"

        # Make DB insert fail
        self.mock_conn.executemany.side_effect = Exception("DB Connection Error")

        # Attempt to flush, expecting exception
        with self.assertRaises(Exception):
            self.run_async(self.batcher.flush_buffer(self.redis))

        # Verify data is restored back to the buffer to prevent data loss
        llen = self.run_async(self.redis.llen(buffer_key))
        self.assertEqual(llen, 1)

    def test_time_based_flush_condition(self):
        # Push 1 item to audit buffer
        topic = "washroom/T1/L2_M01/telemetry"
        payload = b'payload_time'
        self.run_async(self.batcher.push_raw(topic, payload, self.redis))
        buffer_key = "state:audit_buffer"

        # Setup last flush time to be 6 seconds ago
        last_flush_key = "state:audit_last_flush_time"
        six_seconds_ago = time.time() - 6.0
        self.run_async(self.redis.set(last_flush_key, str(six_seconds_ago)))

        # Check conditions manually
        length = self.run_async(self.redis.llen(buffer_key))
        self.assertEqual(length, 1)
        
        last_time_str = self.run_async(self.redis.get(last_flush_key))
        time_since_last = time.time() - float(last_time_str)
        self.assertTrue(time_since_last >= 5.0)

        # Trigger flush due to timeout
        self.run_async(self.batcher.flush_buffer(self.redis))

        # Verify bulk insert executed
        self.mock_conn.executemany.assert_called_once()
        
        # Verify keys are cleared
        llen = self.run_async(self.redis.llen(buffer_key))
        self.assertEqual(llen, 0)

if __name__ == "__main__":
    unittest.main()
