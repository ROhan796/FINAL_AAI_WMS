"""
WebSocket endpoint for DA Engine real-time push.
Clients connect to /ws and receive live telemetry, incidents, and summary updates.
"""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from loguru import logger
from app.realtime.hub import realtime_hub

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for real-time DA Engine data streaming.
    
    On connect: client receives current snapshot immediately.
    Then: client receives push updates as data changes.
    
    Message types:
    - telemetry:update  — full telemetry snapshot (all devices)
    - incidents:update  — active incidents list
    - summary:update    — airport-wide summary
    - live_whi:update   — live WHI rankings
    - pong              — heartbeat response
    """
    await realtime_hub.connect(websocket)
    try:
        # Send initial snapshot immediately on connect (optimized - only summary + top 20)
        from app.storage.cache import cache_store

        all_telemetry = await cache_store.get_all_telemetry()
        
        # Always send summary (lightweight)
        summary = await cache_store.get_airport_summary()
        if summary:
            terminal_summaries = []
            terminals = {}
            for t in all_telemetry:
                tid = getattr(t, 'terminal_id', 'Unknown')
                if tid not in terminals:
                    terminals[tid] = {'whi_scores': [], 'critical': 0}
                terminals[tid]['whi_scores'].append(getattr(t, 'whi_score', 0))
                if getattr(t, 'whi_score', 0) < 60:
                    terminals[tid]['critical'] += 1
            for tid, data in terminals.items():
                avg = sum(data['whi_scores']) / len(data['whi_scores']) if data['whi_scores'] else 0
                terminal_summaries.append({
                    'terminal': tid,
                    'avg_whi': round(avg, 1),
                    'critical_count': data['critical'],
                    'washroom_count': len(data['whi_scores']),
                })
            summary_dict = {
                "avg_whi": getattr(summary, 'avg_whi', 0.0),
                "total_washrooms": getattr(summary, 'total_washrooms', 0),
                "critical_count": getattr(summary, 'critical_count', 0),
                "warning_count": getattr(summary, 'warning_count', 0),
                "good_count": getattr(summary, 'good_count', 0),
                "online_devices": getattr(summary, 'online_devices', 0),
                "terminal_summaries": terminal_summaries,
            }
            await realtime_hub.broadcast_summary_update(summary_dict)

        # Send top 20 WHI rankings (lightweight, no full telemetry)
        live_whi = []
        by_terminal = {}
        sorted_telemetry = sorted(all_telemetry, key=lambda t: getattr(t, 'whi_score', 0))
        for t in sorted_telemetry[:20]:
            terminal_id = getattr(t, 'terminal_id', '')
            live_whi.append({
                "device_id": t.device_id,
                "terminal": terminal_id,
                "floor": getattr(t, 'floor_level', ''),
                "whi": getattr(t, 'whi_score', 0.0),
                "status": "Good" if getattr(t, 'whi_score', 0) >= 80 else "Fair" if getattr(t, 'whi_score', 0) >= 60 else "Critical",
                "occupancy": getattr(t, 'occupancy_count', 0),
                "ammonia_ppm": getattr(t, 'ammonia_ppm', 0.0),
                "last_updated": str(getattr(t, 'recorded_at', '')),
            })
            if terminal_id not in by_terminal:
                by_terminal[terminal_id] = {'scores': [], 'critical': 0}
            by_terminal[terminal_id]['scores'].append(getattr(t, 'whi_score', 0))
            if getattr(t, 'whi_score', 0) < 60:
                by_terminal[terminal_id]['critical'] += 1
        by_terminal_out = {}
        for tid, data in by_terminal.items():
            avg = sum(data['scores']) / len(data['scores']) if data['scores'] else 0
            by_terminal_out[tid] = {'avg_whi': round(avg, 1), 'critical_count': data['critical']}
        await realtime_hub.broadcast_live_whi({
            "rankings": live_whi,
            "count": len(live_whi),
            "by_terminal": by_terminal_out,
        })

        # Send active incidents
        incidents = cache_store.active_incidents
        if incidents:
            await realtime_hub.broadcast_incidents_update(incidents)

        # Keep connection alive, handle client messages
        while True:
            data = await websocket.receive_text()
            # Handle ping/pong heartbeat
            if data == "ping":
                await websocket.send_text('{"type":"pong"}')
            # Handle client request for full data
            elif data == "request_full":
                # Client requests full telemetry data (core sensing only - no consumables)
                full_telemetry = await cache_store.get_all_telemetry()
                telemetry_data = []
                for t in full_telemetry:
                    telemetry_data.append({
                        "device_id": t.device_id,
                        "terminal_id": getattr(t, 'terminal_id', ''),
                        "floor_level": getattr(t, 'floor_level', ''),
                        "whi_score": getattr(t, 'whi_score', 0.0),
                        "ammonia_ppm": getattr(t, 'ammonia_ppm', 0.0),
                        "occupancy_count": getattr(t, 'occupancy_count', 0),
                        "temperature_celsius": getattr(t, 'temperature_celsius', 0.0),
                        "humidity_pct": getattr(t, 'humidity_pct', 0.0),
                        "battery_pct": getattr(t, 'battery_pct', 0.0),
                        "signal_rssi": getattr(t, 'signal_rssi', 0.0),
                        "peak_nh3_ppm": getattr(t, 'peak_nh3_ppm', 0.0),
                        "throughput": getattr(t, 'throughput', 0.0),
                        "last_updated": getattr(t, 'recorded_at', ''),
                    })
                await realtime_hub.broadcast_telemetry_update(telemetry_data)
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await realtime_hub.disconnect(websocket)
