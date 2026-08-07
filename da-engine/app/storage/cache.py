import asyncio
import json
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from loguru import logger
from app.models.telemetry import NormalizedTelemetry
from app.models.airport import AirportSummary

class ThreadSafeCacheStore:
    def __init__(self):
        self.lock = asyncio.Lock()

        # Maps device_id -> NormalizedTelemetry
        self.telemetry_snapshots: Dict[str, NormalizedTelemetry] = {}

        # List of active detected incidents
        self.active_incidents: List[Dict[str, Any]] = []

        # Cache for aggregated summaries
        self.airport_summary: Optional[AirportSummary] = None

        self.last_updated: datetime = datetime.now(timezone.utc)

        # Redis connection (optional, for persistence across restarts)
        self._redis = None
        self._redis_available = False

    async def connect_redis(self, redis_url: str):
        """Connect to Redis for persistent cache."""
        try:
            import redis.asyncio as aioredis
            self._redis = aioredis.from_url(redis_url, decode_responses=True)
            await self._redis.ping()
            self._redis_available = True
            logger.info(f"CacheStore: Connected to Redis at {redis_url}")
        except Exception as e:
            logger.warning(f"CacheStore: Redis not available ({e}), using in-memory only")
            self._redis = None
            self._redis_available = False

    async def disconnect_redis(self):
        """Disconnect from Redis."""
        if self._redis:
            await self._redis.close()
            self._redis = None
            self._redis_available = False

    async def update_telemetry(self, device_id: str, telemetry: NormalizedTelemetry):
        async with self.lock:
            self.telemetry_snapshots[device_id] = telemetry
            self.last_updated = datetime.now(timezone.utc)

    async def set_active_incidents(self, incidents: List[Dict[str, Any]]):
        async with self.lock:
            self.active_incidents = incidents
            self.last_updated = datetime.now(timezone.utc)

    async def get_all_telemetry(self) -> List[NormalizedTelemetry]:
        async with self.lock:
            return list(self.telemetry_snapshots.values())

    async def get_telemetry(self, device_id: str) -> Optional[NormalizedTelemetry]:
        async with self.lock:
            return self.telemetry_snapshots.get(device_id)

    async def set_airport_summary(self, summary: AirportSummary):
        async with self.lock:
            self.airport_summary = summary
            self.last_updated = datetime.now(timezone.utc)

    async def get_airport_summary(self) -> Optional[AirportSummary]:
        async with self.lock:
            return self.airport_summary

    async def persist_to_redis(self, ttl: int = 300):
        """Persist current cache state to Redis for crash recovery."""
        if not self._redis_available or not self._redis:
            return

        try:
            pipe = self._redis.pipeline()

            # Persist telemetry snapshots
            async with self.lock:
                for device_id, telemetry in self.telemetry_snapshots.items():
                    key = f"da:telemetry:{device_id}"
                    data = {
                        "device_id": telemetry.device_id,
                        "terminal_id": getattr(telemetry, 'terminal_id', ''),
                        "floor_level": getattr(telemetry, 'floor_level', ''),
                        "whi_score": getattr(telemetry, 'whi_score', 0.0),
                        "ammonia_ppm": getattr(telemetry, 'ammonia_ppm', 0.0),
                        "occupancy_count": getattr(telemetry, 'occupancy_count', 0),
                        "soap_pct": getattr(telemetry, 'soap_pct', 0.0),
                        "paper_pct": getattr(telemetry, 'paper_pct', 0.0),
                        "sanitizer_pct": getattr(telemetry, 'sanitizer_pct', 0.0),
                        "temperature_celsius": getattr(telemetry, 'temperature_celsius', 0.0),
                        "humidity_pct": getattr(telemetry, 'humidity_pct', 0.0),
                        "battery_pct": getattr(telemetry, 'battery_pct', 0.0),
                        "last_updated": self.last_updated.isoformat(),
                    }
                    pipe.set(key, json.dumps(data), ex=ttl)

                # Persist active incidents
                if self.active_incidents:
                    pipe.set("da:active_incidents", json.dumps(self.active_incidents), ex=ttl)

                # Persist airport summary
                if self.airport_summary:
                    summary_data = {
                        "avg_whi": getattr(self.airport_summary, 'avg_whi', 0.0),
                        "total_washrooms": getattr(self.airport_summary, 'total_washrooms', 0),
                        "critical_count": getattr(self.airport_summary, 'critical_count', 0),
                    }
                    pipe.set("da:airport_summary", json.dumps(summary_data), ex=ttl)

            await pipe.execute()
            logger.debug("CacheStore: Persisted state to Redis")
        except Exception as e:
            logger.error(f"CacheStore: Redis persist failed: {e}")

    async def restore_from_redis(self) -> bool:
        """Restore cache state from Redis after restart."""
        if not self._redis_available or not self._redis:
            return False

        try:
            # Restore telemetry
            keys = []
            async for key in self._redis.scan_iter("da:telemetry:*"):
                keys.append(key)

            restored_count = 0
            for key in keys:
                data = await self._redis.get(key)
                if data:
                    parsed = json.loads(data)
                    device_id = parsed.get("device_id", "")
                    if device_id:
                        # Create a minimal NormalizedTelemetry from Redis data
                        telemetry = NormalizedTelemetry(
                            device_id=device_id,
                            terminal_id=parsed.get("terminal_id", ""),
                            floor_level=parsed.get("floor_level", ""),
                            whi_score=parsed.get("whi_score", 0.0),
                            ammonia_ppm=parsed.get("ammonia_ppm", 0.0),
                            occupancy_count=parsed.get("occupancy_count", 0),
                            soap_pct=parsed.get("soap_pct", 0.0),
                            paper_pct=parsed.get("paper_pct", 0.0),
                            sanitizer_pct=parsed.get("sanitizer_pct", 0.0),
                            temperature_celsius=parsed.get("temperature_celsius", 0.0),
                            humidity_pct=parsed.get("humidity_pct", 0.0),
                            battery_pct=parsed.get("battery_pct", 100.0),
                            signal_rssi=-55.0,
                            recorded_at=datetime.now(timezone.utc),
                            penalty_nh3=0, penalty_h2s=0, penalty_humidity=0, penalty_temperature=0,
                            peak_nh3_ppm=parsed.get("ammonia_ppm", 0.0),
                            throughput=0.0,
                            co2_ppm=500.0,
                        )
                        self.telemetry_snapshots[device_id] = telemetry
                        restored_count += 1

            if restored_count > 0:
                logger.info(f"CacheStore: Restored {restored_count} telemetry records from Redis")
                return True
            return False
        except Exception as e:
            logger.error(f"CacheStore: Redis restore failed: {e}")
            return False

cache_store = ThreadSafeCacheStore()
