from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.core.security import verify_password
from app.db.postgres import db_manager
from app.db.redis import get_redis
from app.core.auth import (
    create_access_token,
    issue_refresh_token,
    rotate_refresh_token,
    revoke_all_user_tokens,
    get_current_user,
    RoleChecker,
    verify_zone_access,
    verify_active_shift
)
from app.models.domain import IncidentState, FloorState
from app.services.incident import get_incident_engine

router = APIRouter()

# Pydantic Schemas for Requests & Responses
class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class RefreshRequest(BaseModel):
    refresh_token: str

# Role validation dependencies
require_operator = RoleChecker(allowed_roles=["dashboard_operator", "supervisor"])
require_supervisor = RoleChecker(allowed_roles=["supervisor"])

@router.post("/auth/login", response_model=TokenResponse)
async def login(credentials: LoginRequest):
    """
    User login endpoint. Verifies username and password against users table,
    then issues JWT access and secure refresh tokens.
    """
    user_rec = await db_manager.fetchrow(
        "SELECT username, password_hash, role FROM users WHERE username = $1",
        credentials.username
    )
    if not user_rec or not verify_password(user_rec["password_hash"], credentials.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
        
    username = user_rec["username"]
    role = user_rec["role"]
    
    access_token = create_access_token(username, role)
    refresh_token = await issue_refresh_token(username)
    
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer"
    }

@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest):
    """
    Refresh access and refresh tokens using atomic rotation.
    """
    new_access, new_refresh = await rotate_refresh_token(body.refresh_token)
    return {
        "access_token": new_access,
        "refresh_token": new_refresh,
        "token_type": "bearer"
    }

@router.post("/auth/logout")
async def logout(body: RefreshRequest, current_user: dict = Depends(get_current_user)):
    """
    Logout endpoint. Revokes all sessions/refresh tokens for the authenticated user.
    """
    await revoke_all_user_tokens(current_user["username"])
    return {"message": "Successfully logged out and revoked all sessions"}

@router.get("/dashboard/status")
async def get_dashboard_status(current_user: dict = Depends(require_operator)):
    """
    Dashboard status endpoint. Accessible by operator and supervisor roles.
    Fetches floor state summaries and counts, filtered by zone (if assigned).
    """
    redis = await get_redis()
    
    # Retrieve all active floor status keys
    # Match: state:floor:*:status
    status_keys = await redis.keys("state:floor:*:status")
    
    floors = []
    user_zone = current_user.get("zone")
    
    for key_bytes in status_keys:
        key = key_bytes.decode("utf-8") if isinstance(key_bytes, bytes) else key_bytes
        # Extract terminal and floor from key (state:floor:{terminal}:{floor}:status)
        parts = key.split(":")
        if len(parts) >= 5:
            terminal = parts[2]
            
            # ABAC Filtering: Filter floors if user has a specific zone assigned
            if user_zone is not None and terminal != user_zone:
                continue
                
            floor = parts[3]
            
            status_val_bytes = await redis.get(key)
            status_val = status_val_bytes.decode("utf-8") if isinstance(status_val_bytes, bytes) else status_val_bytes
            
            # Count active incidents for this floor
            incidents_key = f"state:floor:{terminal}:{floor}:incidents"
            incident_count = await redis.scard(incidents_key)
            
            floors.append({
                "terminal": terminal,
                "floor": floor,
                "status": status_val,
                "active_incidents": incident_count
            })
            
    return {
        "floors": floors,
        "total_active_floors": len(floors)
    }

@router.post("/incidents/{washroom_id}/acknowledge", dependencies=[Depends(require_supervisor), Depends(verify_zone_access), Depends(verify_active_shift)])
async def acknowledge_incident(washroom_id: str):
    """
    Acknowledge incident endpoint. Requires supervisor role, same terminal zone, and active shift.
    Moves the washroom state to ACKNOWLEDGED in Redis.
    """
    redis = await get_redis()
    state_key = f"state:washroom:{washroom_id}"
    
    current_state_bytes = await redis.get(state_key)
    if not current_state_bytes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active state found for washroom {washroom_id}"
        )
        
    current_state = current_state_bytes.decode("utf-8") if isinstance(current_state_bytes, bytes) else current_state_bytes
    if current_state != IncidentState.ACTIVE_INCIDENT.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Washroom {washroom_id} is in state '{current_state}', only '{IncidentState.ACTIVE_INCIDENT.value}' incidents can be acknowledged"
        )
        
    await redis.set(state_key, "ACKNOWLEDGED")
    return {"message": f"Incident for washroom {washroom_id} acknowledged successfully"}

@router.post("/incidents/{washroom_id}/resolve", dependencies=[Depends(require_supervisor), Depends(verify_zone_access), Depends(verify_active_shift)])
async def resolve_incident(washroom_id: str):
    """
    Resolve incident endpoint. Requires supervisor role, same terminal zone, and active shift.
    Uses IncidentEngine to transition state to NORMAL, writing to DB and notifying escalation engine.
    """
    redis = await get_redis()
    state_key = f"state:washroom:{washroom_id}"
    
    current_state_bytes = await redis.get(state_key)
    if not current_state_bytes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active state found for washroom {washroom_id}"
        )
        
    current_state = current_state_bytes.decode("utf-8") if isinstance(current_state_bytes, bytes) else current_state_bytes
    if current_state not in (IncidentState.ACTIVE_INCIDENT.value, "ACKNOWLEDGED"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Washroom {washroom_id} is in state '{current_state}', only active or acknowledged incidents can be resolved"
        )
        
    # Get the incident engine and transition the state to NORMAL.
    engine = get_incident_engine(redis)
    await engine._set_state(
        washroom_id=washroom_id,
        terminal="manual", # Manual resolution by supervisor
        new_state=IncidentState.NORMAL.value,
        whi=100.0 # Force WHI to 100.0 for normal state recovery
    )
    
    return {"message": f"Incident for washroom {washroom_id} resolved successfully"}

# New ABAC and Management Routes
class AlertDispatchPayload(BaseModel):
    washroom_id: str
    message: str

@router.post("/alerts/dispatch", dependencies=[Depends(require_supervisor), Depends(verify_active_shift)])
async def dispatch_escalation_alert(payload: AlertDispatchPayload, current_user: dict = Depends(get_current_user)):
    # Verify zone access to the washroom
    await verify_zone_access(payload.washroom_id, current_user)
    
    from app.core.logger import logger
    logger.info(f"Escalation alert dispatched by {current_user['username']} for {payload.washroom_id}: {payload.message}")

    # Broadcast alert to all connected WebSocket clients
    try:
        from app.api.ws import broadcast_alert
        await broadcast_alert({
            "washroom_id": payload.washroom_id,
            "message": payload.message,
            "dispatched_by": current_user["username"],
        })
    except Exception:
        pass

    return {"status": "dispatched", "washroom_id": payload.washroom_id, "message": payload.message}

@router.get("/devices/{device_id}/config")
async def get_device_config(device_id: str, current_user: dict = Depends(get_current_user)):
    # ABAC: If the current user is a device (starts with pico-), it can only access its own config
    if current_user["username"].startswith("pico-") and current_user["username"] != device_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: device can only access its own configuration"
        )
    return {"device_id": device_id, "status": "configured", "poll_interval": 60}

class UserAttributesPayload(BaseModel):
    zone: str | None = None
    shift_start: str | None = None
    shift_end: str | None = None

require_admin = RoleChecker(allowed_roles=["admin"])

@router.put("/admin/users/{username}/attributes", dependencies=[Depends(require_admin)])
async def update_user_attributes(username: str, payload: UserAttributesPayload):
    updates = []
    params = []
    idx = 1
    if payload.zone is not None:
        updates.append(f"zone = ${idx}")
        params.append(payload.zone)
        idx += 1
    if payload.shift_start is not None:
        updates.append(f"shift_start = ${idx}::TIME")
        params.append(payload.shift_start)
        idx += 1
    if payload.shift_end is not None:
        updates.append(f"shift_end = ${idx}::TIME")
        params.append(payload.shift_end)
        idx += 1
        
    if not updates:
        raise HTTPException(status_code=400, detail="No updates provided")
        
    params.append(username)
    query = f"UPDATE users SET {', '.join(updates)} WHERE username = ${idx}"
    
    await db_manager.execute(query, *params)
    return {"message": f"Attributes for user {username} updated successfully"}


@router.get("/analytics/heatmap")
async def get_hourly_heatmap(
    terminal: str = "T1",
    level: str = "L1",
    hours: int = 24,
    current_user: dict = Depends(require_operator)
):
    """
    Returns hourly occupancy averages per washroom for heatmap visualization.
    Queries TimescaleDB washroom_telemetry for the last N hours.
    """
    from datetime import datetime, timedelta, timezone
    
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    query = """
        SELECT 
            date_trunc('hour', time) AS hour,
            device_id,
            AVG(occupancy_inside) AS avg_occupancy,
            AVG(raw_whi) AS avg_whi
        FROM washroom_telemetry
        WHERE time >= $1
          AND terminal = $2
          AND washroom_id LIKE $3 || '%'
        GROUP BY hour, device_id
        ORDER BY hour, device_id
    """
    
    # Pattern match: T1-L1% covers T1-L1-PPD, T1-L1-PPM, T1-L1-PPF
    pattern = f"{terminal}-{level}"
    
    try:
        rows = await db_manager.fetch(query, start_time, terminal, pattern)
        
        # Group by hour
        hourly_data: dict[int, list[dict]] = {}
        for row in rows:
            hour = row["hour"].hour
            if hour not in hourly_data:
                hourly_data[hour] = []
            hourly_data[hour].append({
                "device_id": row["device_id"],
                "avg_occupancy": round(float(row["avg_occupancy"] or 0), 1),
                "avg_whi": round(float(row["avg_whi"] or 0), 1),
            })
        
        # Fill missing hours with zeros
        result = []
        for h in range(24):
            result.append({
                "hour": h,
                "washrooms": hourly_data.get(h, []),
            })
        
        return result
    except Exception as e:
        from app.core.logger import logger
        logger.warning(f"Heatmap query failed (DB may be empty): {e}")
        # Return empty hourly data
        return [{"hour": h, "washrooms": []} for h in range(24)]


@router.get("/audit/raw-telemetry")
async def get_raw_telemetry_audit(
    hours: int = 24,
    terminal: str | None = None,
    limit: int = 100,
    current_user: dict = Depends(require_operator)
):
    """
    Returns raw MQTT telemetry audit trail from TimescaleDB.
    """
    from datetime import datetime, timedelta, timezone
    from app.core.logger import logger
    
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    try:
        if terminal:
            query = """
                SELECT received_at, topic, raw_payload
                FROM raw_telemetry_audit
                WHERE received_at >= $1 AND topic LIKE $2
                ORDER BY received_at DESC
                LIMIT $3
            """
            rows = await db_manager.fetch(query, start_time, f"%{terminal}%", limit)
        else:
            query = """
                SELECT received_at, topic, raw_payload
                FROM raw_telemetry_audit
                WHERE received_at >= $1
                ORDER BY received_at DESC
                LIMIT $2
            """
            rows = await db_manager.fetch(query, start_time, limit)
        
        return [
            {
                "received_at": row["received_at"].isoformat(),
                "topic": row["topic"],
                "raw_payload": row["raw_payload"],
            }
            for row in rows
        ]
    except Exception as e:
        logger.warning(f"Raw telemetry audit query failed: {e}")
        return []


@router.get("/audit/incident-events")
async def get_incident_events_audit(
    hours: int = 24,
    limit: int = 100,
    current_user: dict = Depends(require_operator)
):
    """
    Returns incident state transition events from TimescaleDB.
    """
    from datetime import datetime, timedelta, timezone
    from app.core.logger import logger
    
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    try:
        query = """
            SELECT time, washroom_id, terminal, old_state, new_state, whi
            FROM incident_events
            WHERE time >= $1
            ORDER BY time DESC
            LIMIT $2
        """
        rows = await db_manager.fetch(query, start_time, limit)
        
        return [
            {
                "time": row["time"].isoformat(),
                "washroom_id": row["washroom_id"],
                "terminal": row["terminal"],
                "old_state": row["old_state"],
                "new_state": row["new_state"],
                "whi": float(row["whi"] or 0),
            }
            for row in rows
        ]
    except Exception as e:
        logger.warning(f"Incident events audit query failed: {e}")
        return []


@router.get("/audit/floor-escalations")
async def get_floor_escalations_audit(
    hours: int = 24,
    limit: int = 100,
    current_user: dict = Depends(require_operator)
):
    """
    Returns floor-level escalation events from TimescaleDB.
    """
    from datetime import datetime, timedelta, timezone
    from app.core.logger import logger
    
    now = datetime.now(timezone.utc)
    start_time = now - timedelta(hours=hours)
    
    try:
        query = """
            SELECT time, floor, terminal, old_status, new_status, active_incident_count
            FROM floor_escalation_events
            WHERE time >= $1
            ORDER BY time DESC
            LIMIT $2
        """
        rows = await db_manager.fetch(query, start_time, limit)
        
        return [
            {
                "time": row["time"].isoformat(),
                "floor": row["floor"],
                "terminal": row["terminal"],
                "old_status": row["old_status"],
                "new_status": row["new_status"],
                "active_incident_count": row["active_incident_count"],
            }
            for row in rows
        ]
    except Exception as e:
        logger.warning(f"Floor escalations audit query failed: {e}")
        return []
