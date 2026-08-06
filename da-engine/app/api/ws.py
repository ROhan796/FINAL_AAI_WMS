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
        # Send initial snapshot immediately on connect
        from app.storage.cache import cache_store
        from app.analytics.airport.aggregator import airport_aggregator

        all_telemetry = cache_store.get_all_telemetry()
        if all_telemetry:
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
                    "last_updated": getattr(t, 'recorded_at', ''),
                })
            await realtime_hub.broadcast_telemetry_update(telemetry_data)

        incidents = cache_store.active_incidents
        if incidents:
            await realtime_hub.broadcast_incidents_update(incidents)

        summary = cache_store.get_airport_summary()
        if summary:
            terminals = {}
            for t in all_telemetry:
                tid = getattr(t, 'terminal_id', 'Unknown')
                if tid not in terminals:
                    terminals[tid] = {'whi_scores': [], 'critical': 0}
                terminals[tid]['whi_scores'].append(getattr(t, 'whi_score', 0))
                if getattr(t, 'whi_score', 0) < 60:
                    terminals[tid]['critical'] += 1
            terminal_summaries = []
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

        # Broadcast live WHI with by_terminal
        live_whi = []
        by_terminal = {}
        for t in all_telemetry[:20]:
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

        # Broadcast trends (hourly aggregation)
        trends_data = {"hourly": [], "daily": []}
        hourly_buckets = {}
        for t in all_telemetry:
            recorded = getattr(t, 'recorded_at', None)
            if recorded:
                hour_key = str(recorded)[:13]
                if hour_key not in hourly_buckets:
                    hourly_buckets[hour_key] = []
                hourly_buckets[hour_key].append(getattr(t, 'whi_score', 0))
        for hour_key in sorted(hourly_buckets.keys())[-24:]:
            scores = hourly_buckets[hour_key]
            trends_data["hourly"].append({
                "hour": hour_key,
                "avg_whi": round(sum(scores) / len(scores), 1) if scores else 0,
                "count": len(scores),
            })
        await realtime_hub.broadcast_trends_update(trends_data)

        # Broadcast washroom list with real-time scores
        washroom_list = []
        for t in all_telemetry:
            washroom_list.append({
                "device_id": t.device_id,
                "terminal": getattr(t, 'terminal_id', ''),
                "level": getattr(t, 'floor_level', ''),
                "whi": getattr(t, 'whi_score', 0.0),
                "status": "Good" if getattr(t, 'whi_score', 0) >= 80 else "Fair" if getattr(t, 'whi_score', 0) >= 60 else "Critical",
                "ammonia_ppm": getattr(t, 'ammonia_ppm', 0.0),
                "occupancy_count": getattr(t, 'occupancy_count', 0),
                "temperature_celsius": getattr(t, 'temperature_celsius', 0.0),
                "humidity_pct": getattr(t, 'humidity_pct', 0.0),
                "battery_pct": getattr(t, 'battery_pct', 0.0),
                "last_updated": str(getattr(t, 'recorded_at', '')),
            })
        await realtime_hub.broadcast_washrooms_update(washroom_list)

        # Broadcast device status
        devices = []
        for t in all_telemetry:
            devices.append({
                "device_id": t.device_id,
                "terminal": getattr(t, 'terminal_id', ''),
                "level": getattr(t, 'floor_level', ''),
                "battery_pct": getattr(t, 'battery_pct', 100.0),
                "status": "ONLINE",
                "last_ping": str(getattr(t, 'recorded_at', '')),
                "type": getattr(t, 'device_type', 'PPM'),
            })
        await realtime_hub.broadcast_devices_update(devices)

        # Keep connection alive, handle client messages
        while True:
            data = await websocket.receive_text()
            # Handle ping/pong heartbeat
            if data == "ping":
                await websocket.send_text('{"type":"pong"}')
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        await realtime_hub.disconnect(websocket)
