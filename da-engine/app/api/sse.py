"""
Server-Sent Events (SSE) endpoint for DA Engine.
Fallback for environments where WebSocket is blocked (e.g., corporate proxies).
Provides real-time telemetry streaming via HTTP long-polling.
"""

import asyncio
import json
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from loguru import logger

router = APIRouter()


async def _telemetry_generator(request: Request):
    """SSE generator that yields telemetry updates. Stops on client disconnect."""
    from app.storage.cache import cache_store

    last_count = 0
    try:
        while True:
            if await request.is_disconnected():
                logger.debug("SSE client disconnected, stopping generator")
                break

            try:
                all_telemetry = cache_store.get_all_telemetry()
                current_count = len(all_telemetry)

                # Only send if data changed
                if current_count != last_count or current_count > 0:
                    telemetry_data = []
                    for t in all_telemetry:
                        telemetry_data.append({
                            "device_id": t.device_id,
                            "terminal_id": getattr(t, 'terminal_id', ''),
                            "floor_level": getattr(t, 'floor_level', ''),
                            "whi_score": getattr(t, 'whi_score', 0.0),
                            "ammonia_ppm": getattr(t, 'ammonia_ppm', 0.0),
                            "occupancy_count": getattr(t, 'occupancy_count', 0),
                            "soap_pct": getattr(t, 'soap_pct', 0.0),
                            "paper_pct": getattr(t, 'paper_pct', 0.0),
                            "sanitizer_pct": getattr(t, 'sanitizer_pct', 0.0),
                            "temperature_celsius": getattr(t, 'temperature_celsius', 0.0),
                            "humidity_pct": getattr(t, 'humidity_pct', 0.0),
                            "battery_pct": getattr(t, 'battery_pct', 0.0),
                            "last_updated": str(getattr(t, 'recorded_at', '')),
                        })

                    message = json.dumps({
                        "type": "telemetry:update",
                        "data": {"devices": telemetry_data, "count": len(telemetry_data)},
                    }, default=str)
                    yield f"data: {message}\n\n"
                    last_count = current_count

                # Also send incidents
                incidents = cache_store.active_incidents
                if incidents:
                    inc_message = json.dumps({
                        "type": "incidents:update",
                        "data": {"incidents": incidents, "count": len(incidents)},
                    }, default=str)
                    yield f"data: {inc_message}\n\n"

                # Also send summary
                summary = cache_store.get_airport_summary()
                if summary:
                    summary_dict = {
                        "avg_whi": getattr(summary, 'avg_whi', 0.0),
                        "total_washrooms": getattr(summary, 'total_washrooms', 0),
                        "critical_count": getattr(summary, 'critical_count', 0),
                        "warning_count": getattr(summary, 'warning_count', 0),
                        "good_count": getattr(summary, 'good_count', 0),
                        "online_devices": getattr(summary, 'online_devices', 0),
                    }
                    sum_message = json.dumps({
                        "type": "summary:update",
                        "data": summary_dict,
                    }, default=str)
                    yield f"data: {sum_message}\n\n"

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"SSE generator error: {e}")
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

            await asyncio.sleep(2)  # Push every 2 seconds
    except asyncio.CancelledError:
        pass
    finally:
        logger.debug("SSE generator stopped")


@router.get("/api/sse/telemetry")
async def sse_telemetry_stream(request: Request):
    """
    SSE endpoint for real-time telemetry streaming.
    Falls back to this when WebSocket is unavailable.
    """
    return StreamingResponse(
        _telemetry_generator(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
