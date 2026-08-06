"""
Real-time WebSocket Hub for WMS Backend.
Broadcasts floor status, incidents, and telemetry to all connected portal clients.
Fan-out pattern: one MQTT message → broadcast to all WebSocket subscribers.
"""

import asyncio
import json
from typing import Set, Dict, Any
from datetime import datetime, timezone
from fastapi import WebSocket
from app.core.logger import logger


class WMSRealtimeHub:
    def __init__(self):
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._broadcast_count: int = 0

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)
        logger.info(f"WMS WebSocket hub: client connected (total: {len(self._connections)})")

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self._connections.discard(ws)
        logger.info(f"WMS WebSocket hub: client disconnected (total: {len(self._connections)})")

    async def broadcast(self, event_type: str, data: Dict[str, Any]):
        """Broadcast a message to all connected WebSocket clients."""
        if not self._connections:
            return

        message = json.dumps({
            "type": event_type,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "data": data,
        }, default=str)

        dead: list[WebSocket] = []
        async with self._lock:
            targets = list(self._connections)

        success_count = 0
        for ws in targets:
            try:
                await ws.send_text(message)
                success_count += 1
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    self._connections.discard(ws)

        async with self._lock:
            self._broadcast_count += success_count

    async def broadcast_telemetry(self, payload: Dict[str, Any]):
        """Broadcast raw telemetry from MQTT."""
        await self.broadcast("mqtt:telemetry", payload)

    async def broadcast_floor_status(self, floor_status: list):
        """Broadcast floor status update."""
        await self.broadcast("floor_status:update", {
            "floors": floor_status,
        })

    async def broadcast_incident(self, incident: Dict[str, Any]):
        """Broadcast new/resolved incident."""
        await self.broadcast("incident:new", incident)

    async def broadcast_alert(self, alert: Dict[str, Any]):
        """Broadcast escalation alert."""
        await self.broadcast("alert:escalation", alert)

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    @property
    def total_broadcasts(self) -> int:
        return self._broadcast_count


# Singleton
wms_realtime_hub = WMSRealtimeHub()
