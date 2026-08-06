from datetime import datetime, timezone
from redis.asyncio import Redis
from app.models.domain import IncidentState, FloorState
from app.core.logger import logger
from app.db.redis import get_redis
from app.db.postgres import db_manager

class EscalationEngine:
    async def evaluate_floor_state(self, terminal: str, washroom_id: str, new_state: str, redis: Redis = None, timestamp: datetime = None):
        # Extract floor from washroom_id (e.g., "L2_M01" -> "L2", "L2-M01" -> "L2")
        floor = "unknown_floor"
        for sep in ("_", "-"):
            if sep in washroom_id:
                floor = washroom_id.split(sep)[0]
                break

        if redis is None:
            redis = await get_redis()
            
        floor_state_key = f"state:floor:{terminal}:{floor}:incidents"
        
        if new_state == IncidentState.ACTIVE_INCIDENT.value:
            await redis.sadd(floor_state_key, washroom_id)
        else:
            await redis.srem(floor_state_key, washroom_id)
            
        active_count = await redis.scard(floor_state_key)
        
        floor_status_key = f"state:floor:{terminal}:{floor}:status"
        current_floor_status = await redis.get(floor_status_key)
        old_status_val = current_floor_status if current_floor_status is not None else FloorState.NORMAL.value
        
        new_status_val = None
        
        if active_count >= 2 and old_status_val != FloorState.FLOOR_CRITICAL.value:
            new_status_val = FloorState.FLOOR_CRITICAL.value
            await redis.set(floor_status_key, new_status_val)
            logger.critical(f"Floor Escalation! {terminal} Floor {floor} is now FLOOR_CRITICAL")
            
        elif active_count < 2 and old_status_val == FloorState.FLOOR_CRITICAL.value:
            new_status_val = FloorState.NORMAL.value
            await redis.set(floor_status_key, new_status_val)
            logger.info(f"Floor Recovery. {terminal} Floor {floor} is back to NORMAL")
            
        if new_status_val is not None:
            # Persist to database
            event_time = timestamp or datetime.now(timezone.utc)
            if db_manager.pool:
                try:
                    await db_manager.execute(
                        """
                        INSERT INTO floor_escalation_events (time, floor, terminal, old_status, new_status, active_incident_count)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        """,
                        event_time, floor, terminal, old_status_val, new_status_val, active_count
                    )
                    logger.info(f"Persisted floor escalation event for {floor}: {old_status_val} -> {new_status_val}")
                except Exception as e:
                    logger.error(f"Failed to persist floor escalation event for {floor}: {e}")

escalation_engine = EscalationEngine()

