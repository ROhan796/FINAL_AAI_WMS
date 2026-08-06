from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from app.storage.cache import cache_store
from app.config.constants import TERMINALS, LEVELS, UNIT_TYPES
from app.config.settings import settings
from app.utils.whi_status import get_whi_status

router = APIRouter()

@router.get("/levels/{terminal}/{level}")
async def get_level(terminal: str, level: str) -> Dict[str, Any]:
    """
    Get analytics for a specific level — only authorized devices.
    Example: /api/levels/T1/L3
    Returns washrooms (PPM, PPF) for this level.
    """
    if terminal not in TERMINALS:
        raise HTTPException(status_code=404, detail=f"Terminal {terminal} not found")

    level_upper = level.upper()
    valid_levels = [f"L{i}" for i in LEVELS]
    if level_upper not in valid_levels:
        raise HTTPException(status_code=404, detail=f"Level {level} not found")

    authorized = set(settings.device_id_list)
    washrooms = []
    for device_id, telemetry in cache_store.telemetry_snapshots.items():
        if device_id in authorized and device_id.startswith(f"{terminal}-{level_upper}-"):
            whi = telemetry.whi_score if hasattr(telemetry, 'whi_score') else 0
            parsed_parts = device_id.split("-")
            unit_type = parsed_parts[2] if len(parsed_parts) > 2 else "PPM"
            washrooms.append({
                "device_id": device_id,
                "type": unit_type,
                "whi": whi,
                "status": get_whi_status(whi),
                "sensors": {
                    "nh3": telemetry.ammonia_ppm if hasattr(telemetry, 'ammonia_ppm') else 0,
                    "h2s": telemetry.co2_ppm if hasattr(telemetry, 'co2_ppm') else 0,
                    "temperature": telemetry.temperature_celsius if hasattr(telemetry, 'temperature_celsius') else 0,
                    "humidity": telemetry.humidity_pct if hasattr(telemetry, 'humidity_pct') else 0,
                    "occupancy_inside": telemetry.occupancy_count if hasattr(telemetry, 'occupancy_count') else 0,
                    "throughput": telemetry.throughput if hasattr(telemetry, 'throughput') else 0,
                },
                "penalties": {
                    "nh3": telemetry.penalty_nh3 if hasattr(telemetry, 'penalty_nh3') else 0,
                    "h2s": telemetry.penalty_h2s if hasattr(telemetry, 'penalty_h2s') else 0,
                    "humidity": telemetry.penalty_humidity if hasattr(telemetry, 'penalty_humidity') else 0,
                    "temperature": telemetry.penalty_temperature if hasattr(telemetry, 'penalty_temperature') else 0,
                },
            })

    avg_whi = sum(w["whi"] for w in washrooms) / len(washrooms) if washrooms else 0

    return {
        "terminal": terminal,
        "level": level_upper,
        "avg_whi": round(avg_whi, 1),
        "washrooms": washrooms,
    }
