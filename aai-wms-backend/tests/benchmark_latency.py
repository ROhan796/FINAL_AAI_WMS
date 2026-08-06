import asyncio
import time
import sys
from pathlib import Path

# Add project root to python path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.services.audit import audit_batcher
from app.db.redis import get_redis

async def run_benchmark():
    print("Initializing Redis connection...")
    redis = await get_redis()
    
    # Pre-clear buffer
    await redis.delete("state:audit_buffer")
    await redis.delete("state:audit_buffer:temp")
    
    topic = "washroom/T1/L2_WashroomA/telemetry"
    payload = b'{"device_id": "device_washroom_a", "timestamp": "2026-06-30T07:53:52.258446+00:00", "avg_nh3_ppm": 5.0, "peak_nh3_ppm": 10.0, "avg_temperature_c": 23.5, "avg_humidity_percent": 58.0, "throughput": 4, "occupancy_inside": 2, "abandon_rate_percent": 0.0, "raw_whi": 15.0}'
    
    print("\n--- Running Latency Benchmark ---")
    print("Pushing 10,000 raw messages to the Redis audit buffer...")
    
    start_time = time.perf_counter()
    
    latencies = []
    
    for _ in range(10000):
        t0 = time.perf_counter()
        await audit_batcher.push_raw(topic, payload, redis)
        t1 = time.perf_counter()
        latencies.append((t1 - t0) * 1000)  # convert to milliseconds
        
    end_time = time.perf_counter()
    total_time = end_time - start_time
    avg_latency = sum(latencies) / len(latencies)
    max_latency = max(latencies)
    p95_latency = sorted(latencies)[int(len(latencies) * 0.95)]
    p99_latency = sorted(latencies)[int(len(latencies) * 0.99)]
    
    print(f"\n--- Benchmark Results ---")
    print(f"Total time for 10,000 pushes: {total_time:.4f} seconds")
    print(f"Throughput: {10000 / total_time:.2f} msg/sec")
    print(f"Average latency per push: {avg_latency:.4f} ms")
    print(f"95th percentile latency: {p95_latency:.4f} ms")
    print(f"99th percentile latency: {p99_latency:.4f} ms")
    print(f"Maximum latency: {max_latency:.4f} ms")
    
    # Wait a bit to let any pending background flushes finish
    print("Waiting 2 seconds for background flushes to complete...")
    await asyncio.sleep(2)
    
    # Clean up Redis keys
    await redis.delete("state:audit_buffer")
    await redis.delete("state:audit_buffer:temp")

if __name__ == "__main__":
    asyncio.run(run_benchmark())
