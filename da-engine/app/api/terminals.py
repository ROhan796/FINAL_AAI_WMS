from fastapi import APIRouter, HTTPException
from typing import List, Dict, Any
from app.storage.cache import cache_store
from app.config.constants import TERMINALS, LEVELS, UNIT_TYPES
from app.config.settings import settings
from app.utils.whi_status import get_whi_status

router = APIRouter()

@router.get("/terminals")
async def get_terminals() -> List[Dict[str, Any]]:
    """Get summary for all 3 terminals — only authorized devices."""
    authorized = set(settings.device_id_list)
    terminals = []

    for terminal_id in TERMINALS:
        devices = []
        for device_id, telemetry in cache_store.telemetry_snapshots.items():
            if device_id in authorized and device_id.startswith(f"{terminal_id}-"):
                whi = telemetry.whi_score if hasattr(telemetry, 'whi_score') else 0
                parsed_parts = device_id.split("-")
                level = parsed_parts[1] if len(parsed_parts) > 1 else "L1"
                unit_type = parsed_parts[2] if len(parsed_parts) > 2 else "PPM"
                devices.append({
                    "device_id": device_id,
                    "level": level,
                    "type": unit_type,
                    "whi": whi,
                })

        # Calculate terminal average WHI
        if devices:
            avg_whi = sum(d["whi"] for d in devices) / len(devices)
            critical_count = sum(1 for d in devices if d["whi"] < 60)
        else:
            avg_whi = 0
            critical_count = 0

        terminals.append({
            "terminal_id": terminal_id,
            "avg_whi": round(avg_whi, 1),
            "total_devices": len(devices),
            "critical_count": critical_count,
            "levels": [
                {
                    "level": f"L{level_num}",
                    "avg_whi": calculate_level_whi(terminal_id, f"L{level_num}"),
                }
                for level_num in LEVELS
            ],
        })

    return terminals

@router.get("/terminals/{terminal_id}")
async def get_terminal(terminal_id: str) -> Dict[str, Any]:
    """Get detailed info for a single terminal (T1, T2, or T3) — only authorized devices."""
    if terminal_id not in TERMINALS:
        raise HTTPException(status_code=404, detail=f"Terminal {terminal_id} not found")

    authorized = set(settings.device_id_list)
    washrooms = []
    for device_id, telemetry in cache_store.telemetry_snapshots.items():
        if device_id in authorized and device_id.startswith(f"{terminal_id}-"):
            whi = telemetry.whi_score if hasattr(telemetry, 'whi_score') else 0
            parsed_parts = device_id.split("-")
            level = parsed_parts[1] if len(parsed_parts) > 1 else "L1"
            unit_type = parsed_parts[2] if len(parsed_parts) > 2 else "PPM"
            washrooms.append({
                "device_id": device_id,
                "level": level,
                "type": unit_type,
                "whi": whi,
                "status": get_whi_status(whi),
                "sensors": {
                    "nh3": telemetry.ammonia_ppm if hasattr(telemetry, 'ammonia_ppm') else 0,
                    "h2s": telemetry.co2_ppm if hasattr(telemetry, 'co2_ppm') else 0,
                    "temperature": telemetry.temperature_celsius if hasattr(telemetry, 'temperature_celsius') else 0,
                    "humidity": telemetry.humidity_pct if hasattr(telemetry, 'humidity_pct') else 0,
                    "occupancy_inside": telemetry.occupancy_count if hasattr(telemetry, 'occupancy_count') else 0,
                },
            })

    # Calculate averages
    avg_whi = sum(w["whi"] for w in washrooms) / len(washrooms) if washrooms else 0
    critical_count = sum(1 for w in washrooms if w["whi"] < 60)

    # Group by level
    levels_data = []
    for level_num in LEVELS:
        level = f"L{level_num}"
        level_washrooms = [w for w in washrooms if w["level"] == level]
        level_avg = sum(w["whi"] for w in level_washrooms) / len(level_washrooms) if level_washrooms else 0
        levels_data.append({
            "level": level,
            "avg_whi": round(level_avg, 1),
            "washrooms": level_washrooms,
        })

    return {
        "terminal_id": terminal_id,
        "avg_whi": round(avg_whi, 1),
        "total_devices": len(washrooms),
        "critical_count": critical_count,
        "levels": levels_data,
    }

def calculate_level_whi(terminal_id: str, level: str) -> float:
    """Calculate average WHI for a specific level from cache — only authorized devices."""
    authorized = set(settings.device_id_list)
    whis = []
    for device_id, telemetry in cache_store.telemetry_snapshots.items():
        if device_id in authorized and device_id.startswith(f"{terminal_id}-{level}-"):
            whi = telemetry.whi_score if hasattr(telemetry, 'whi_score') else 0
            whis.append(whi)
    return round(sum(whis) / len(whis), 1) if whis else 0
