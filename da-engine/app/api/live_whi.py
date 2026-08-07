from fastapi import APIRouter
from typing import Dict, Any, List
from datetime import datetime, timezone
from app.storage.cache import cache_store
from app.config.settings import settings
from app.utils.id_utils import parse_device_id
from app.utils.whi_status import get_whi_status

router = APIRouter()

@router.get("/live-whi")
async def get_live_whi() -> Dict[str, Any]:
    """
    Get live WHI snapshot for all 54 devices
    Used by: /terminal/live-whi page (polls every 10s)
    """
    now = datetime.now(timezone.utc).isoformat()

    rankings = []
    terminal_data = {"T1": [], "T2": [], "T3": []}

    # Get all device IDs from settings
    all_device_ids = settings.device_id_list

    for device_id in all_device_ids:
        telemetry = await cache_store.get_telemetry(device_id)
        if telemetry:
            parsed = parse_device_id(device_id)
            if parsed:
                whi = telemetry.whi_score if hasattr(telemetry, 'whi_score') else 0
                rankings.append({
                    "device_id": device_id,
                    "whi": whi,
                    "status": get_whi_status(whi),
                    "terminal": parsed["terminal"],
                    "level": parsed["level"],
                    "type": parsed["type"],
                })
                terminal_data[parsed["terminal"]].append(whi)

    # Sort by WHI descending for rankings
    rankings.sort(key=lambda x: x["whi"], reverse=True)

    # Add rank number
    for i, r in enumerate(rankings):
        r["rank"] = i + 1

    # Calculate terminal summaries
    by_terminal = {}
    for terminal_id in ["T1", "T2", "T3"]:
        whis = terminal_data[terminal_id]
        avg_whi = sum(whis) / len(whis) if whis else 0
        critical_count = sum(1 for w in whis if w < 60)
        by_terminal[terminal_id] = {
            "avg_whi": round(avg_whi, 1),
            "critical_count": critical_count,
        }

    return {
        "timestamp": now,
        "rankings": rankings,
        "by_terminal": by_terminal,
    }
