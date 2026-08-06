from fastapi import APIRouter
from typing import List
from pydantic import BaseModel
from app.storage.cache import cache_store
from app.models.telemetry import NormalizedTelemetry
from app.analytics.airport.aggregator import airport_aggregator
from app.analytics.incidents.detector import incident_detector

router = APIRouter()

class SeedRecord(BaseModel):
    device_id: str
    terminal_id: str
    floor_level: str
    temperature_celsius: float
    humidity_pct: float
    ammonia_ppm: float = 0.0
    co2_ppm: float = 0.0
    occupancy_count: int = 0
    soap_pct: float = 100.0
    paper_pct: float = 100.0
    sanitizer_pct: float = 100.0
    cleanliness_score: float = 100.0
    whi_score: float = 0.0
    battery_pct: float = 100.0
    signal_rssi: float = -55.0
    penalty_nh3: float = 0.0
    penalty_h2s: float = 0.0
    penalty_humidity: float = 0.0
    penalty_temperature: float = 0.0
    peak_nh3_ppm: float = 0.0
    throughput: float = 0.0

@router.post("/seed")
async def seed_telemetry(records: List[SeedRecord]):
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)

    for rec in records:
        telemetry = NormalizedTelemetry(
            device_id=rec.device_id,
            terminal_id=rec.terminal_id,
            floor_level=rec.floor_level,
            temperature_celsius=rec.temperature_celsius,
            humidity_pct=rec.humidity_pct,
            ammonia_ppm=rec.ammonia_ppm,
            co2_ppm=rec.co2_ppm,
            occupancy_count=rec.occupancy_count,
            soap_pct=rec.soap_pct,
            paper_pct=rec.paper_pct,
            sanitizer_pct=rec.sanitizer_pct,
            cleanliness_score=rec.cleanliness_score,
            whi_score=rec.whi_score,
            battery_pct=rec.battery_pct,
            signal_rssi=rec.signal_rssi,
            recorded_at=now,
            penalty_nh3=rec.penalty_nh3,
            penalty_h2s=rec.penalty_h2s,
            penalty_humidity=rec.penalty_humidity,
            penalty_temperature=rec.penalty_temperature,
            peak_nh3_ppm=rec.peak_nh3_ppm,
            throughput=rec.throughput,
        )
        cache_store.update_telemetry(rec.device_id, telemetry)

    all_telemetry = cache_store.get_all_telemetry()
    all_incidents = []
    for t in all_telemetry:
        detected = incident_detector.detect_breaches(t)
        for d in detected:
            d["device_id"] = t.device_id
        all_incidents.extend(detected)
    cache_store.set_active_incidents(all_incidents)

    summary = airport_aggregator.aggregate(all_telemetry, all_incidents)
    cache_store.set_airport_summary(summary)

    return {
        "status": "ok",
        "devices_seeded": len(records),
        "airport_whi": summary.avg_whi,
        "active_incidents": len(all_incidents),
    }
