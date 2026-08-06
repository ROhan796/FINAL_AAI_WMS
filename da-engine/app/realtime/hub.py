"""
Real-time WebSocket Hub for DA Engine.
Broadcasts telemetry updates, incidents, and summaries to all connected clients.
Uses fan-out pattern: one message → broadcast to all subscribers.
"""

import asyncio
import json
from typing import Set, Dict, Any, Optional
from datetime import datetime, timezone
from fastapi import WebSocket
from loguru import logger


class RealtimeHub:
    def __init__(self):
        self._connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
        self._broadcast_count: int = 0

    async def connect(self, ws: WebSocket):
        await ws.accept()
        async with self._lock:
            self._connections.add(ws)
        logger.info(f"WebSocket hub: client connected (total: {len(self._connections)})")

    async def disconnect(self, ws: WebSocket):
        async with self._lock:
            self._connections.discard(ws)
        logger.info(f"WebSocket hub: client disconnected (total: {len(self._connections)})")

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

    async def broadcast_telemetry_update(self, telemetry_list: list):
        """Broadcast telemetry snapshot update."""
        await self.broadcast("telemetry:update", {
            "devices": telemetry_list,
            "count": len(telemetry_list),
        })

    async def broadcast_incidents_update(self, incidents: list):
        """Broadcast active incidents update."""
        await self.broadcast("incidents:update", {
            "incidents": incidents,
            "count": len(incidents),
        })

    async def broadcast_summary_update(self, summary: dict):
        """Broadcast airport summary update."""
        await self.broadcast("summary:update", summary)

    async def broadcast_live_whi(self, data):
        """Broadcast live WHI rankings with by_terminal aggregation."""
        if isinstance(data, dict):
            await self.broadcast("live_whi:update", data)
        else:
            await self.broadcast("live_whi:update", {
                "rankings": data,
                "count": len(data),
            })

    async def broadcast_trends_update(self, trends: dict):
        """Broadcast trends/historical data update."""
        await self.broadcast("trends:update", trends)

    async def broadcast_washrooms_update(self, washrooms: list):
        """Broadcast washroom list update with real-time WHI scores."""
        await self.broadcast("washrooms:update", {
            "washrooms": washrooms,
            "count": len(washrooms),
        })

    async def broadcast_devices_update(self, devices: list):
        """Broadcast device status update (battery, online/offline, last ping)."""
        await self.broadcast("devices:update", {
            "devices": devices,
            "count": len(devices),
        })

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    @property
    def total_broadcasts(self) -> int:
        return self._broadcast_count


# Singleton
realtime_hub = RealtimeHub()
