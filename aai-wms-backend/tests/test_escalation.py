import unittest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone
from app.services.escalation import EscalationEngine
from app.models.domain import IncidentState, FloorState
from app.db.postgres import db_manager
from app.services.incident import IncidentEngine

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

    async def scard(self, key: str):
        if key not in self.sets:
            return 0
        return len(self.sets[key])

    async def get(self, key: str):
        return self.kvs.get(key)

    async def set(self, key: str, value: str):
        self.kvs[key] = value
        return True

    async def incr(self, key: str):
        val = self.kvs.get(key, 0)
        if isinstance(val, str):
            val = int(val)
        val += 1
        self.kvs[key] = val
        return val

    async def expire(self, key: str, ttl: int):
        return True

    async def delete(self, key: str):
        if key in self.sets:
            del self.sets[key]
        if key in self.kvs:
            del self.kvs[key]
        return 1

class TestFloorEscalation(unittest.TestCase):
    def setUp(self):
        self.engine = EscalationEngine()
        self.redis = MockRedis()

    def run_async(self, coro):
        return asyncio.run(coro)

    def test_single_active_incident_no_escalation(self):
        # 1. First active incident in Washroom A on floor L2
        self.run_async(
            self.engine.evaluate_floor_state(
                terminal="T1",
                washroom_id="L2_WashroomA",
                new_state=IncidentState.ACTIVE_INCIDENT.value,
                redis=self.redis
            )
        )
        
        # Verify active count in set is 1
        count = self.run_async(self.redis.scard("state:floor:T1:L2:incidents"))
        self.assertEqual(count, 1)
        
        # Verify floor status is still NOT FLOOR_CRITICAL (remains None or NORMAL)
        status = self.run_async(self.redis.get("state:floor:T1:L2:status"))
        self.assertNotEqual(status, FloorState.FLOOR_CRITICAL.value)

    def test_two_active_incidents_escalates_to_critical(self):
        # 1. First active incident in Washroom A on floor L2
        self.run_async(
            self.engine.evaluate_floor_state(
                terminal="T1",
                washroom_id="L2_WashroomA",
                new_state=IncidentState.ACTIVE_INCIDENT.value,
                redis=self.redis
            )
        )
        
        # 2. Second active incident in Washroom B on floor L2
        self.run_async(
            self.engine.evaluate_floor_state(
                terminal="T1",
                washroom_id="L2_WashroomB",
                new_state=IncidentState.ACTIVE_INCIDENT.value,
                redis=self.redis
            )
        )
        
        # Verify active count in set is 2
        count = self.run_async(self.redis.scard("state:floor:T1:L2:incidents"))
        self.assertEqual(count, 2)
        
        # Verify floor status is now FLOOR_CRITICAL
        status = self.run_async(self.redis.get("state:floor:T1:L2:status"))
        self.assertEqual(status, FloorState.FLOOR_CRITICAL.value)

    def test_incident_recovery_deescalates_status(self):
        # 1. Trigger two active incidents to cause FLOOR_CRITICAL
        self.run_async(
            self.engine.evaluate_floor_state(
                terminal="T1",
                washroom_id="L2_WashroomA",
                new_state=IncidentState.ACTIVE_INCIDENT.value,
                redis=self.redis
            )
        )
        self.run_async(
            self.engine.evaluate_floor_state(
                terminal="T1",
                washroom_id="L2_WashroomB",
                new_state=IncidentState.ACTIVE_INCIDENT.value,
                redis=self.redis
            )
        )
        
        status = self.run_async(self.redis.get("state:floor:T1:L2:status"))
        self.assertEqual(status, FloorState.FLOOR_CRITICAL.value)
        
        # 2. One incident recovers (state becomes NORMAL)
        self.run_async(
            self.engine.evaluate_floor_state(
                terminal="T1",
                washroom_id="L2_WashroomA",
                new_state=IncidentState.NORMAL.value,
                redis=self.redis
            )
        )
        
        # Verify active count is 1
        count = self.run_async(self.redis.scard("state:floor:T1:L2:incidents"))
        self.assertEqual(count, 1)
        
        # Verify floor status recovers to NORMAL
        status = self.run_async(self.redis.get("state:floor:T1:L2:status"))
        self.assertEqual(status, FloorState.NORMAL.value)

    def test_dash_separator_floor_parsing(self):
        # Verify L3-WashroomC is parsed as L3 floor
        self.run_async(
            self.engine.evaluate_floor_state(
                terminal="T1",
                washroom_id="L3-WashroomC",
                new_state=IncidentState.ACTIVE_INCIDENT.value,
                redis=self.redis
            )
        )
        
        # Active incident should be stored in L3 key
        count = self.run_async(self.redis.scard("state:floor:T1:L3:incidents"))
        self.assertEqual(count, 1)

    def test_no_separator_defaults_to_unknown_floor(self):
        # Verify WashroomA (no sep) is parsed as unknown_floor
        self.run_async(
            self.engine.evaluate_floor_state(
                terminal="T1",
                washroom_id="WashroomA",
                new_state=IncidentState.ACTIVE_INCIDENT.value,
                redis=self.redis
            )
        )
        
        count = self.run_async(self.redis.scard("state:floor:T1:unknown_floor:incidents"))
        self.assertEqual(count, 1)

class TestTimescaleDBPersistence(unittest.TestCase):
    def setUp(self):
        self.redis = MockRedis()
        self.incident_engine = IncidentEngine(self.redis)
        self.escalation_engine = EscalationEngine()
        
        # Mock database connection / pool / execute
        self.mock_pool = MagicMock()
        self.original_pool = db_manager.pool
        db_manager.pool = self.mock_pool
        
        self.mock_execute = AsyncMock()
        db_manager.execute = self.mock_execute

    def tearDown(self):
        db_manager.pool = self.original_pool
        from app.db.postgres import PostgresManager
        db_manager.execute = PostgresManager.execute.__get__(db_manager, PostgresManager)

    def run_async(self, coro):
        return asyncio.run(coro)

    def test_incident_state_change_persists_to_db(self):
        # We simulate first incident state transition from NORMAL to ACTIVE_INCIDENT
        # Setup Redis to have NORMAL
        self.run_async(self.redis.set("state:washroom:L2_WashroomA", IncidentState.NORMAL.value))
        
        # Debounce is 0. Trigger transition.
        # Send a critical payload
        from app.models.schemas import TelemetryPayload
        payload = TelemetryPayload(
            device_id="pico-dummy",
            timestamp=datetime(2026, 6, 23, 12, 0, 0, tzinfo=timezone.utc),
            avg_nh3_ppm=2.0,
            peak_nh3_ppm=3.0,
            avg_temperature_c=25.0,
            avg_humidity_percent=50.0,
            throughput=5,
            occupancy_inside=1,
            abandon_rate_percent=0.0,
            raw_whi=15.0, # critical
            terminal="T1",
            washroom_id="L2_WashroomA",
            msg_type="telemetry"
        )
        
        # Since debounce is 3, we send 3 critical readings to trigger transition
        for _ in range(3):
            self.run_async(self.incident_engine.process_reading(payload))
        self.run_async(self.incident_engine.process_reading(payload))
        self.run_async(self.incident_engine.process_reading(payload))
            
        # Verify db_manager.execute was called to log the transition to ACTIVE_INCIDENT
        self.assertTrue(self.mock_execute.called)
        
        # Let's inspect calls
        calls = self.mock_execute.call_args_list
        found_incident_event = False
        for call in calls:
            query = call[0][0]
            if "INSERT INTO incident_events" in query:
                found_incident_event = True
                args = call[0][1:]
                self.assertEqual(args[0], datetime(2026, 6, 23, 12, 0, 0, tzinfo=timezone.utc)) # event_time
                self.assertEqual(args[1], "L2_WashroomA") # washroom_id
                self.assertEqual(args[2], "T1") # terminal
                self.assertEqual(args[3], IncidentState.NORMAL.value) # old_state
                self.assertEqual(args[4], IncidentState.ACTIVE_INCIDENT.value) # new_state
                self.assertEqual(args[5], 15.0) # whi
        
        self.assertTrue(found_incident_event)

    def test_floor_escalation_persists_to_db(self):
        # We manually call evaluate_floor_state to trigger floor status escalation
        self.run_async(self.redis.set("state:floor:T1:L2:status", FloorState.NORMAL.value))
        
        # Add two active washrooms on floor L2
        self.run_async(self.redis.sadd("state:floor:T1:L2:incidents", "L2_WashroomA"))
        
        # Evaluate floor state with a new active incident
        # This will make active count 2, triggering escalation to FLOOR_CRITICAL
        self.run_async(
            self.escalation_engine.evaluate_floor_state(
                terminal="T1",
                washroom_id="L2_WashroomB",
                new_state=IncidentState.ACTIVE_INCIDENT.value,
                redis=self.redis,
                timestamp=datetime(2026, 6, 23, 12, 0, 0, tzinfo=timezone.utc)
            )
        )
        
        # Verify db_manager.execute was called to log the transition to FLOOR_CRITICAL
        self.assertTrue(self.mock_execute.called)
        calls = self.mock_execute.call_args_list
        found_floor_event = False
        for call in calls:
            query = call[0][0]
            if "INSERT INTO floor_escalation_events" in query:
                found_floor_event = True
                args = call[0][1:]
                self.assertEqual(args[0], datetime(2026, 6, 23, 12, 0, 0, tzinfo=timezone.utc)) # event_time
                self.assertEqual(args[1], "L2") # floor
                self.assertEqual(args[2], "T1") # terminal
                self.assertEqual(args[3], FloorState.NORMAL.value) # old_status
                self.assertEqual(args[4], FloorState.FLOOR_CRITICAL.value) # new_status
                self.assertEqual(args[5], 2) # active count
                
        self.assertTrue(found_floor_event)

if __name__ == "__main__":
    unittest.main()
