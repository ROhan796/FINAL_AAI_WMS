from fastapi import APIRouter, HTTPException
from typing import Dict, Any, List
from app.storage.cache import cache_store
from app.config.settings import settings
from app.utils.id_utils import parse_device_id
from app.utils.whi_status import get_whi_status

router = APIRouter()

@router.get("/summary")
async def get_dashboard_summary() -> Dict[str, Any]:
    """Get airport-wide dashboard summary"""
    # Get all device IDs from settings
    all_device_ids = settings.device_id_list

    # Collect telemetry for all devices
    washrooms = []
    terminal_data = {"T1": [], "T2": [], "T3": []}

    for device_id in all_device_ids:
        telemetry = cache_store.get_telemetry(device_id)
        if telemetry:
            parsed = parse_device_id(device_id)
            if parsed:
                whi = telemetry.whi_score if hasattr(telemetry, 'whi_score') else 0
                washroom_entry = {
                    "device_id": device_id,
                    "whi": whi,
                    "status": get_whi_status(whi),
                    "terminal": parsed["terminal"],
                    "level": parsed["level"],
                    "type": parsed["type"],
                    "latest_sensors": {
                        "nh3": telemetry.ammonia_ppm if hasattr(telemetry, 'ammonia_ppm') else 0,
                        "h2s": telemetry.co2_ppm if hasattr(telemetry, 'co2_ppm') else 0,
                        "temperature": telemetry.temperature_celsius if hasattr(telemetry, 'temperature_celsius') else 0,
                        "humidity": telemetry.humidity_pct if hasattr(telemetry, 'humidity_pct') else 0,
                        "occupancy": telemetry.occupancy_count if hasattr(telemetry, 'occupancy_count') else 0,
                    },
                }
                washrooms.append(washroom_entry)
                terminal_data[parsed["terminal"]].append(whi)

    # Calculate airport-wide WHI
    all_whis = [w["whi"] for w in washrooms]
    airport_whi = sum(all_whis) / len(all_whis) if all_whis else 0

    # Calculate terminal summaries
    terminal_summaries = []
    for terminal_id in ["T1", "T2", "T3"]:
        whis = terminal_data[terminal_id]
        avg_whi = sum(whis) / len(whis) if whis else 0
        critical_count = sum(1 for w in whis if w < 60)
        terminal_summaries.append({
            "terminal_id": terminal_id,
            "avg_whi": round(avg_whi, 1),
            "total": len(whis),
            "critical": critical_count,
        })

    return {
        "airport_whi": round(airport_whi, 1),
        "total_washrooms": len(washrooms),
        "online_devices": len(washrooms),
        "critical_count": sum(1 for w in all_whis if w < 60),
        "terminal_summaries": terminal_summaries,
        "washroom_list": washrooms,
    }
