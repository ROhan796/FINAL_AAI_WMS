from typing import Dict, Any
from app.storage.cache import cache_store

class ReportService:
    async def generate_summary_report(self) -> Dict[str, Any]:
        """
        Assembles a structured summary report payload.
        """
        summary = await cache_store.get_airport_summary()
        if not summary:
            return {"status": "NO_DATA", "message": "No telemetry processed yet."}
            
        return {
            "title": "AAI Smart Washroom Performance Report",
            "generated_at": cache_store.last_updated.isoformat(),
            "avg_whi": summary.avg_whi,
            "total_washrooms": summary.total_washrooms,
            "online_devices": summary.online_devices,
            "active_incidents": summary.active_incidents,
            "terminals": [
                {
                    "terminal_id": t.terminal_id,
                    "avg_whi": t.avg_whi,
                    "active_incidents": t.active_incidents,
                    "total_washrooms": t.total_washrooms
                }
                for t in summary.terminals
            ]
        }

report_service = ReportService()
