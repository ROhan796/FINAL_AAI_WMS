from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from app.storage.cache import cache_store
from app.utils.id_utils import parse_device_id
from app.storage.history import device_history_buffer
from app.utils.whi_status import get_whi_status

router = APIRouter()

@router.get("/washrooms/{device_id}")
async def get_washroom_detail(device_id: str) -> Dict[str, Any]:
    """
    Get full detail for a single washroom.
    Example: /api/washrooms/T1-L1-PPD-001
    """
    # Validate device ID format
    parsed = parse_device_id(device_id)
    if not parsed:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid device ID format: {device_id}. Expected: Tn-Lm-PPX-NNN"
        )

    # Get telemetry from cache
    telemetry = cache_store.get_telemetry(device_id)
    if not telemetry:
        raise HTTPException(status_code=404, detail=f"No data found for device {device_id}")

    # Get WHI history with timestamps (up to 100 readings)
    trend = device_history_buffer.get_history_with_timestamps(device_id)

    # Get status
    whi = telemetry.whi_score if hasattr(telemetry, 'whi_score') else 0
    status = get_whi_status(whi)

    return {
        "device_id": device_id,
        "terminal": parsed["terminal"],
        "level": parsed["level"],
        "type": parsed["type"],
        "whi": whi,
        "status": status,
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
        "trend": trend,
        "timestamp": telemetry.recorded_at.isoformat() if hasattr(telemetry, 'recorded_at') and telemetry.recorded_at else "",
    }
