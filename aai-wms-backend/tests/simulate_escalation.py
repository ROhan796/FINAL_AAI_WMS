import asyncio
import sys
from datetime import datetime, timezone
from app.services.incident import IncidentEngine
from app.models.schemas import TelemetryPayload
from app.models.domain import IncidentState, FloorState

# Self-contained MockRedis to avoid global package imports
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

async def simulate():
    print("--- Starting Floor Escalation Simulation ---")
    redis = MockRedis()
    engine = IncidentEngine(redis)

    # Helper function to create payload
    def make_payload(washroom_id: str, raw_whi: float) -> TelemetryPayload:
        return TelemetryPayload(
            device_id="dev_dummy",
            timestamp=datetime.now(timezone.utc),
            avg_nh3_ppm=2.0,
            peak_nh3_ppm=3.0,
            avg_temperature_c=25.0,
            avg_humidity_percent=50.0,
            throughput=5,
            occupancy_inside=1,
            abandon_rate_percent=0.0,
            raw_whi=raw_whi,
            terminal="T1",
            washroom_id=washroom_id,
            msg_type="telemetry"
        )

    # We will simulate two washrooms on floor L2: L2_WashroomA and L2_WashroomB

    print("\n[Step 1] Sending critical readings for L2_WashroomA (WHI = 15.0)")
    # Since debounce threshold is 3, we send 3 critical readings
    for i in range(1, 4):
        payload = make_payload("L2_WashroomA", 15.0)
        await engine.process_reading(payload)
        
        state = await redis.get("state:washroom:L2_WashroomA")
        debounce = await redis.get("debounce:L2_WashroomA")
        floor_status = await redis.get("state:floor:T1:L2:status")
        print(f"  Reading {i}: Washroom State = {state}, Debounce Count = {debounce}, Floor Status = {floor_status}")

    print("\n[Step 2] Sending critical readings for L2_WashroomB (WHI = 15.0)")
    # We send 3 critical readings for the second washroom on the same floor
    for i in range(1, 4):
        payload = make_payload("L2_WashroomB", 15.0)
        await engine.process_reading(payload)
        
        state = await redis.get("state:washroom:L2_WashroomB")
        debounce = await redis.get("debounce:L2_WashroomB")
        floor_status = await redis.get("state:floor:T1:L2:status")
        print(f"  Reading {i}: Washroom State = {state}, Debounce Count = {debounce}, Floor Status = {floor_status}")

    print("\n[Step 3] Sending normal reading to recover L2_WashroomA (WHI = 80.0)")
    # Send a normal reading to clear the incident for Washroom A
    payload = make_payload("L2_WashroomA", 80.0)
    await engine.process_reading(payload)

    state_a = await redis.get("state:washroom:L2_WashroomA")
    floor_status = await redis.get("state:floor:T1:L2:status")
    print(f"  Result: Washroom A State = {state_a}, Floor Status = {floor_status}")

if __name__ == "__main__":
    asyncio.run(simulate())
