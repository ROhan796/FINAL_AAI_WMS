from datetime import datetime, timezone
from redis.asyncio import Redis
from app.models.schemas import TelemetryPayload
from app.models.domain import IncidentState
from app.core.config import settings
from app.core.logger import logger
from app.services.escalation import escalation_engine
from app.db.postgres import db_manager

class IncidentEngine:
    def __init__(self, redis: Redis):
        self.redis = redis

    async def process_reading(self, payload: TelemetryPayload):
        if not payload.washroom_id or not payload.terminal:
            return

        whi = payload.raw_whi
        washroom_id = payload.washroom_id
        
        debounce_key = f"debounce:{washroom_id}"
        state_key = f"state:washroom:{washroom_id}"

        # Retrieve the active state or fallback to default
        current_state = await self.redis.get(state_key) or IncidentState.NORMAL.value

        if whi >= settings.WHI_WARNING_THRESHOLD:
            # WHI is good (>=50) - resolve any active incident
            if current_state == IncidentState.ACTIVE_INCIDENT.value:
                await self._set_state(washroom_id, payload.terminal, IncidentState.RESOLVED.value, whi=whi, timestamp=payload.timestamp)
                await self._set_state(washroom_id, payload.terminal, IncidentState.NORMAL.value, whi=whi, timestamp=payload.timestamp)
            elif current_state != IncidentState.NORMAL.value:
                await self._set_state(washroom_id, payload.terminal, IncidentState.NORMAL.value, whi=whi, timestamp=payload.timestamp)
            # Clear debounce counter when WHI is good
            await self.redis.delete(debounce_key)

        elif whi >= settings.WHI_CRITICAL_THRESHOLD:
            # WHI is in warning range (30-50) - set pending alert
            if current_state == IncidentState.ACTIVE_INCIDENT.value:
                # Don't downgrade from ACTIVE_INCIDENT to PENDING_ALERT
                pass
            else:
                await self._set_state(washroom_id, payload.terminal, IncidentState.PENDING_ALERT.value, whi=whi, timestamp=payload.timestamp)
            # Clear debounce counter in warning range
            await self.redis.delete(debounce_key)

        else:
            # WHI is critical (<30) - increment debounce and potentially trigger incident
            if current_state == IncidentState.ACTIVE_INCIDENT.value:
                # Already active, no need to debounce again
                pass
            else:
                debounce_count = await self.redis.incr(debounce_key)
                await self.redis.expire(debounce_key, 3600)  # TTL safety net
                if debounce_count >= settings.DEBOUNCE_THRESHOLD:
                    await self._set_state(washroom_id, payload.terminal, IncidentState.ACTIVE_INCIDENT.value, whi=whi, timestamp=payload.timestamp)
                    await self.redis.delete(debounce_key)

    async def _set_state(self, washroom_id: str, terminal: str, new_state: str, whi: float = None, timestamp: datetime = None):
        state_key = f"state:washroom:{washroom_id}"
        old_state = await self.redis.get(state_key)
        old_state_val = old_state if old_state is not None else IncidentState.NORMAL.value
        
        if old_state_val != new_state:
            await self.redis.set(state_key, new_state)
            
            event_time = timestamp or datetime.now(timezone.utc)
            
            # Persist historical event data to TimescaleDB
            if db_manager.pool:
                try:
                    await db_manager.execute(
                        """
                        INSERT INTO incident_events (time, washroom_id, terminal, old_state, new_state, whi)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        """,
                        event_time, washroom_id, terminal, old_state_val, new_state, whi
                    )
                    logger.info(f"Persisted incident event for {washroom_id}: {old_state_val} -> {new_state}")
                except Exception as e:
                    logger.error(f"Failed to persist incident event for {washroom_id}: {e}")

            # Broadcast incident state change to WebSocket clients (real-time)
            try:
                from app.realtime.hub import wms_realtime_hub
                if wms_realtime_hub.connection_count > 0:
                    await wms_realtime_hub.broadcast_incident({
                        "washroom_id": washroom_id,
                        "terminal": terminal,
                        "old_state": old_state_val,
                        "new_state": new_state,
                        "whi": whi,
                        "timestamp": event_time.isoformat(),
                    })
            except Exception:
                pass
            
            # Notify downstream escalation engine of state adjustment
            await escalation_engine.evaluate_floor_state(
                terminal=terminal,
                washroom_id=washroom_id,
                new_state=new_state,
                redis=self.redis,
                timestamp=event_time
            )

def get_incident_engine(redis: Redis) -> IncidentEngine:
    return IncidentEngine(redis)
