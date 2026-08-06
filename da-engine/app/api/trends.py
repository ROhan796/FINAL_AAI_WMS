from fastapi import APIRouter
from typing import List, Dict, Any
from datetime import datetime, timedelta, timezone
from app.config.settings import settings
from app.utils.id_utils import parse_device_id
from app.storage.history import device_history_buffer

router = APIRouter()

@router.get("/trends", response_model=List[Dict[str, Any]])
async def get_trends(days: int = 7) -> List[Dict[str, Any]]:
    """
    Get daily WHI trends for last 7 days, broken down by terminal.
    Returns: [{date, avg_whi, T1_avg, T2_avg, T3_avg, total_records}]
    """
    all_device_ids = settings.device_id_list
    now = datetime.now(timezone.utc)

    # Generate date range
    trends = []
    for day_offset in range(days):
        date = (now - timedelta(days=day_offset)).strftime("%Y-%m-%d")

        # Collect WHIs for this date by terminal
        terminal_whis = {"T1": [], "T2": [], "T3": []}
        all_whis = []
        total_records = 0

        for device_id in all_device_ids:
            # Get timestamped history for this device
            history = device_history_buffer.get_history_with_timestamps(device_id)
            parsed = parse_device_id(device_id)

            if parsed and history:
                # Filter history for this date
                day_records = [
                    h for h in history
                    if h["timestamp"] and h["timestamp"].startswith(date)
                ]

                if day_records:
                    avg_whi = sum(h["whi"] for h in day_records) / len(day_records)
                    terminal_whis[parsed["terminal"]].append(avg_whi)
                    all_whis.append(avg_whi)
                    total_records += len(day_records)
                else:
                    # Fallback: use overall average if no date-specific records
                    avg_whi = sum(h["whi"] for h in history) / len(history) if history else 0
                    terminal_whis[parsed["terminal"]].append(avg_whi)
                    all_whis.append(avg_whi)

        # Calculate averages
        airport_avg = sum(all_whis) / len(all_whis) if all_whis else 0
        t1_avg = sum(terminal_whis["T1"]) / len(terminal_whis["T1"]) if terminal_whis["T1"] else 0
        t2_avg = sum(terminal_whis["T2"]) / len(terminal_whis["T2"]) if terminal_whis["T2"] else 0
        t3_avg = sum(terminal_whis["T3"]) / len(terminal_whis["T3"]) if terminal_whis["T3"] else 0

        trends.append({
            "date": date,
            "avg_whi": round(airport_avg, 1),
            "T1_avg": round(t1_avg, 1),
            "T2_avg": round(t2_avg, 1),
            "T3_avg": round(t3_avg, 1),
            "total_records": total_records,
        })

    # Reverse to show oldest first
    trends.reverse()

    return trends
