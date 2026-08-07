"""
WebSocket endpoint for WMS Backend real-time push.
Clients connect to /ws and receive live floor status, incidents, and MQTT telemetry.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.core.logger import logger
from app.realtime.hub import wms_realtime_hub

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time WMS Backend data streaming.
    
    On connect: client receives current floor status immediately.
    Then: client receives push updates as MQTT messages arrive.
    
    Message types:
    - mqtt:telemetry     — raw telemetry from IoT sensors
    - floor_status:update — floor state changes
    - incident:new       — new/resolved incidents
    - alert:escalation   — floor escalation alerts
    - pong               — heartbeat response
    """
    await wms_realtime_hub.connect(websocket)
    try:
        # Send current floor status immediately on connect
        from app.db.redis import get_redis
        try:
            redis = await get_redis()
        except Exception as e:
            logger.error(f"WMS WebSocket: Failed to connect to Redis: {e}")
            redis = None

        floor_status = []
        terminals = ["T1", "T2", "T3"]
        floors = ["L1", "L2", "L3", "L4", "L5", "L6"]

        if redis:
            for terminal in terminals:
                for floor in floors:
                    status_key = f"state:floor:{terminal}:{floor}:status"
                    incidents_key = f"state:floor:{terminal}:{floor}:incidents"

                    try:
                        status = await redis.get(status_key) or "NORMAL"
                        incident_count = await redis.scard(incidents_key) or 0
                    except Exception as e:
                        logger.warning(f"WMS WebSocket: Redis read error for {terminal}/{floor}: {e}")
                        status = "NORMAL"
                        incident_count = 0

                    floor_status.append({
                        "terminal": terminal,
                        "floor": floor,
                        "status": status,
                        "active_incidents": incident_count,
                    })
        else:
            # Redis unavailable - return default status
            for terminal in terminals:
                for floor in floors:
                    floor_status.append({
                        "terminal": terminal,
                        "floor": floor,
                        "status": "NORMAL",
                        "active_incidents": 0,
                    })

        await wms_realtime_hub.broadcast_floor_status(floor_status)

        # Keep connection alive, handle client messages
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WMS WebSocket error: {e}")
    finally:
        await wms_realtime_hub.disconnect(websocket)
