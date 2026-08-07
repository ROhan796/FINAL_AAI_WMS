from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.router import router as api_router
from app.api.ws import router as ws_router
from app.api.sse import router as sse_router
from app.acquisition.scheduler import polling_scheduler
from app.config.settings import settings
from loguru import logger
import app.logging.logger  # registers and sets up loguru

app = FastAPI(
    title="AAI Smart Washroom Data Analysis (DA) Engine",
    version="2.0.0",
    description="Independent Python analytics service processing live airport washroom telemetry with real-time WebSocket push."
)

# Allow CORS for Next.js portal integration
cors_origins = settings.CORS_ORIGINS.split(",") if settings.CORS_ORIGINS else ["http://localhost:3000"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix="/api")
app.include_router(ws_router)
app.include_router(sse_router)

@app.on_event("startup")
async def startup_event():
    logger.info("Starting up Data Analysis Engine...")
    polling_scheduler.start()

    from app.storage.cache import cache_store

    # Connect to Redis for persistent cache
    await cache_store.connect_redis(settings.redis_url)

    # Try to restore cache from Redis (survives restarts)
    restored = await cache_store.restore_from_redis()
    if restored:
        logger.info("Cache restored from Redis — skipping seed")
    else:
        existing = await cache_store.get_all_telemetry()
        if len(existing) == 0:
            logger.info("Cache is empty — seeding 54 devices with mock telemetry...")
            _seed_initial_data()
            logger.info("Initial seed complete.")

    # Start telemetry bridge to WMS Backend PostgreSQL
    from app.services.telemetry_bridge import telemetry_bridge
    await telemetry_bridge.connect()
    if telemetry_bridge.pool:
        await telemetry_bridge.start_sync(cache_store)
        logger.info("Telemetry bridge to WMS Backend started")
    else:
        logger.warning("Telemetry bridge could not connect to WMS Backend DB")

    # Start periodic Redis persistence (every 60 seconds)
    import asyncio
    async def _redis_persist_loop():
        while True:
            await asyncio.sleep(60)
            await cache_store.persist_to_redis(ttl=settings.REDIS_CACHE_TTL)
    asyncio.create_task(_redis_persist_loop())
    logger.info("Redis persistence loop started (60s interval)")


def _seed_initial_data():
    import random, os
    from datetime import datetime, timezone, timedelta
    from dotenv import load_dotenv
    from app.models.telemetry import NormalizedTelemetry
    from app.analytics.airport.aggregator import airport_aggregator
    from app.analytics.incidents.detector import incident_detector
    from app.storage.cache import cache_store
    from app.config.settings import settings

    load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

    random.seed(42)
    now = datetime.now(timezone.utc)

    DEVICES = settings.device_id_list
    if not DEVICES:
        logger.warning("No authorized devices in NSCBI_DEVICE_IDS — skipping seed.")
        return

    telemetry_list = []
    for did in DEVICES:
        parts = did.split("-")
        tid = parts[0] if len(parts) > 0 else "T1"
        fl = parts[1] if len(parts) > 1 else "L1"
        nh3 = round(random.uniform(0.5, 35.0), 2)
        occ = random.randint(0, 4)
        whi = round(max(0, 100 - (nh3 / 50 * 100) - (occ * 5)), 1)

        t = NormalizedTelemetry(
            device_id=did, terminal_id=tid, floor_level=fl,
            temperature_celsius=round(random.uniform(22.0, 29.0), 1),
            humidity_pct=round(random.uniform(40.0, 75.0), 1),
            ammonia_ppm=nh3, co2_ppm=round(random.uniform(400, 800), 1),
            occupancy_count=occ,
            soap_pct=round(random.uniform(70, 100), 1),
            paper_pct=round(random.uniform(70, 100), 1),
            sanitizer_pct=round(random.uniform(70, 100), 1),
            cleanliness_score=round(random.uniform(60, 95), 1),
            whi_score=whi,
            battery_pct=round(random.uniform(60, 100), 1),
            signal_rssi=round(random.uniform(-70, -45), 1),
            recorded_at=now - timedelta(seconds=random.randint(0, 120)),
            penalty_nh3=0, penalty_h2s=0, penalty_humidity=0, penalty_temperature=0,
            peak_nh3_ppm=round(nh3 * 1.2, 2),
            throughput=round(occ * 4.5, 1),
        )
        telemetry_list.append(t)
        cache_store.telemetry_snapshots[did] = t

        for _ in range(9):
            hist = NormalizedTelemetry(
                device_id=did, terminal_id=tid, floor_level=fl,
                temperature_celsius=round(random.uniform(22.0, 29.0), 1),
                humidity_pct=round(random.uniform(40.0, 75.0), 1),
                ammonia_ppm=round(random.uniform(0.5, 35.0), 2),
                co2_ppm=round(random.uniform(400, 800), 1),
                occupancy_count=random.randint(0, 4),
                soap_pct=round(random.uniform(70, 100), 1),
                paper_pct=round(random.uniform(70, 100), 1),
                sanitizer_pct=round(random.uniform(70, 100), 1),
                cleanliness_score=round(random.uniform(60, 95), 1),
                whi_score=round(random.uniform(40, 95), 1),
                battery_pct=round(random.uniform(60, 100), 1),
                signal_rssi=round(random.uniform(-70, -45), 1),
                recorded_at=now - timedelta(hours=random.randint(1, 168)),
                penalty_nh3=0, penalty_h2s=0, penalty_humidity=0, penalty_temperature=0,
                peak_nh3_ppm=round(random.uniform(1, 40), 2),
                throughput=round(random.uniform(0, 20), 1),
            )
            cache_store.telemetry_snapshots[did] = hist

    all_telemetry = list(cache_store.telemetry_snapshots.values())
    all_incidents = []
    for t in all_telemetry:
        detected = incident_detector.detect_breaches(t)
        for d in detected:
            d["device_id"] = t.device_id
        all_incidents.extend(detected)
    cache_store.active_incidents = all_incidents

    summary = airport_aggregator.aggregate(all_telemetry, all_incidents)
    cache_store.airport_summary = summary
    logger.info(f"Seeded {len(DEVICES)} devices, {len(all_incidents)} incidents, avg WHI={summary.avg_whi:.1f}")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down Data Analysis Engine...")
    from app.storage.cache import cache_store
    # Final persist to Redis before shutdown
    await cache_store.persist_to_redis(ttl=300)
    await cache_store.disconnect_redis()
    from app.services.telemetry_bridge import telemetry_bridge
    await telemetry_bridge.disconnect()
    polling_scheduler.stop()

@app.get("/health")
def health_check():
    from app.realtime.hub import realtime_hub
    return {
        "status": "healthy",
        "service": "da-engine",
        "version": "2.0.0",
        "websocket": {
            "connected_clients": realtime_hub.connection_count,
            "total_broadcasts": realtime_hub.total_broadcasts,
        },
    }
