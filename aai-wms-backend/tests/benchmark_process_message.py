import asyncio
import time
import sys
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

# Add project root to python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.mqtt import MQTTSubscriber
from app.services.audit import audit_batcher
from app.db.redis import get_redis

# Simple mock MQTT message class
class MockMQTTMessage:
    def __init__(self, topic: str, payload: bytes):
        self.topic = topic
        self.payload = payload

async def run_benchmark():
    print("Initializing Redis connection...")
    redis = await get_redis()
    
    # Clean Redis buffer
    await redis.delete("state:audit_buffer")
    await redis.delete("state:audit_buffer:temp")

    # Mock RateLimiter to return True (so it doesn't get rate limited)
    mock_rate_limiter = AsyncMock()
    mock_rate_limiter.is_allowed.return_value = True

    # Mock queue_router.route_message to do nothing (so we don't fill queues)
    from app.services.queue import queue_router
    original_route_message = queue_router.route_message
    queue_router.route_message = AsyncMock()

    # Create subscriber instance
    subscriber = MQTTSubscriber()

    topic = "washroom/T1/L2_WashroomA/telemetry"
    payload = b'{"device_id": "device_washroom_a", "timestamp": "2026-06-30T07:53:52.258446+00:00", "avg_nh3_ppm": 5.0, "peak_nh3_ppm": 10.0, "avg_temperature_c": 23.5, "avg_humidity_percent": 58.0, "throughput": 4, "occupancy_inside": 2, "abandon_rate_percent": 0.0, "raw_whi": 15.0}'
    message = MockMQTTMessage(topic, payload)

    num_messages = 5000

    print(f"\n--- Running process_message Latency Comparison ({num_messages} runs) ---")

    # 1. Measure WITH the audit tap
    print("Testing WITH audit tap enabled...")
    start_with = time.perf_counter()
    for _ in range(num_messages):
        await subscriber.process_message(message, mock_rate_limiter)
    end_with = time.perf_counter()
    time_with = end_with - start_with
    avg_with = (time_with / num_messages) * 1000  # in ms

    # Clean Redis buffer again
    await redis.delete("state:audit_buffer")

    # 2. Measure WITHOUT the audit tap (monkey patch push_raw to no-op)
    original_push_raw = audit_batcher.push_raw
    async def no_op_push_raw(*args, **kwargs):
        pass
    audit_batcher.push_raw = no_op_push_raw

    print("Testing WITHOUT audit tap (no-op)...")
    start_without = time.perf_counter()
    for _ in range(num_messages):
        await subscriber.process_message(message, mock_rate_limiter)
    end_without = time.perf_counter()
    time_without = end_without - start_without
    avg_without = (time_without / num_messages) * 1000  # in ms

    # Restore original push_raw and route_message
    audit_batcher.push_raw = original_push_raw
    queue_router.route_message = original_route_message

    print("\n--- Latency Comparison Results ---")
    print(f"Total time (With Tap):    {time_with:.4f} seconds")
    print(f"Total time (Without Tap): {time_without:.4f} seconds")
    print(f"Average latency per process_message (With Tap):    {avg_with:.6f} ms")
    print(f"Average latency per process_message (Without Tap): {avg_without:.6f} ms")
    print(f"Added Latency Overhead:                            {avg_with - avg_without:.6f} ms")
    print(f"Overhead Percentage:                               {((avg_with - avg_without) / avg_without) * 100:.2f}%")

    # Clean up Redis keys
    await redis.delete("state:audit_buffer")

if __name__ == "__main__":
    asyncio.run(run_benchmark())
