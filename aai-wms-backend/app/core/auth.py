import jwt
import secrets
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from redis.asyncio import Redis

from app.core.config import settings
from app.db.redis import get_redis

# PyJWT Configuration
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 15
REFRESH_TOKEN_EXPIRE_DAYS = 7

# OAuth2 Scheme
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")

# Atomic Lua script for Refresh Token Rotation and Reuse Revocation
# References two keys:
# KEYS[1] = active refresh token key ("state:refresh_token:<token>")
# KEYS[2] = used refresh token key ("state:refresh_token:<token>:used")
LUA_ROTATE_SCRIPT = """
local token_key = KEYS[1]
local used_key = KEYS[2]
local user = redis.call('GET', token_key)
if not user then
    if redis.call('EXISTS', used_key) == 1 then
        local username = redis.call('GET', used_key)
        -- Atomic Revocation: Delete all active refresh tokens for this user
        local user_tokens_key = "state:user_tokens:" .. username
        local tokens = redis.call('SMEMBERS', user_tokens_key)
        for _, t in ipairs(tokens) do
            redis.call('DEL', "state:refresh_token:" .. t)
        end
        redis.call('DEL', user_tokens_key)
        return {"reuse", username}
    else
        return {"not_found", ""}
    end
end
redis.call('DEL', token_key)
redis.call('SET', used_key, user, 'EX', 30)
return {"success", user}
"""

def create_access_token(username: str, role: str) -> str:
    """
    Creates a short-lived access JWT.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": username,
        "role": role,
        "exp": expire
    }
    # settings.jwt_secret is expected to be a raw 64-char hex string (256 bits of entropy)
    # We pass it directly to jwt.encode without decoding as bytes first.
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=JWT_ALGORITHM)

def decode_access_token(token: str) -> dict:
    """
    Decodes and validates an access JWT using the current secret key,
    or falls back to the previous secret key during rotation overlap.
    """
    try:
        # Try decoding with the current active secret
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidSignatureError:
        # If signature is invalid, check if we have a previous secret key (overlap support)
        prev_secret = settings.jwt_secret_previous
        if prev_secret:
            try:
                payload = jwt.decode(token, prev_secret, algorithms=[JWT_ALGORITHM])
                return payload
            except jwt.ExpiredSignatureError:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Access token has expired",
                    headers={"WWW-Authenticate": "Bearer"},
                )
            except jwt.InvalidTokenError:
                pass
        
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid access token",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def issue_refresh_token(username: str, redis: Redis = None) -> str:
    """
    Generates a new secure refresh token, updates the active list and user tokens index in Redis.
    """
    if redis is None:
        redis = await get_redis()
        
    token = secrets.token_hex(32) # Secure random string
    token_key = f"state:refresh_token:{token}"
    user_tokens_key = f"state:user_tokens:{username}"
    
    # Store token and index
    ttl = int(timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS).total_seconds())
    await redis.set(token_key, username, ex=ttl)
    await redis.sadd(user_tokens_key, token)
    await redis.expire(user_tokens_key, ttl)
    
    return token

async def rotate_refresh_token(old_token: str, redis: Redis = None) -> tuple[str, str]:
    """
    Atomically rotates a refresh token.
    If reuse is detected, revokes all user sessions and raises 401.
    Returns (new_access_token, new_refresh_token).
    """
    if redis is None:
        redis = await get_redis()
        
    token_key = f"state:refresh_token:{old_token}"
    used_key = f"state:refresh_token:{old_token}:used"
    
    # Run Lua check-and-rotate script atomically.
    # We pass KEYS count as 2, and token_key/used_key as key arguments.
    result = await redis.eval(LUA_ROTATE_SCRIPT, 2, token_key, used_key)
    status_code, username = result[0], result[1]
    
    if status_code == "reuse":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token reuse detected. All user sessions have been revoked.",
        )
    elif status_code == "not_found":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )
        
    # Old token successfully marked used. Clean up from user tokens index
    user_tokens_key = f"state:user_tokens:{username}"
    await redis.srem(user_tokens_key, old_token)
    
    # Check if user exists in database to confirm they are still active
    from app.db.postgres import db_manager
    user_rec = await db_manager.fetchrow("SELECT username, role FROM users WHERE username = $1", username)
    if not user_rec:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User no longer exists",
        )
        
    role = user_rec["role"]
    
    # Issue new pair
    new_refresh = await issue_refresh_token(username, redis)
    new_access = create_access_token(username, role)
    
    return new_access, new_refresh

async def revoke_all_user_tokens(username: str, redis: Redis = None):
    """
    Revokes all active refresh tokens for a user.
    """
    if redis is None:
        redis = await get_redis()
        
    user_tokens_key = f"state:user_tokens:{username}"
    tokens = await redis.smembers(user_tokens_key)
    for token in tokens:
        await redis.delete(f"state:refresh_token:{token}")
    await redis.delete(user_tokens_key)

async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Dependency to fetch and validate the current authenticated user.
    """
    payload = decode_access_token(token)
    username = payload.get("sub")
    role = payload.get("role")
    if not username or not role:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token payload is missing credentials",
        )
    
    # Query database to retrieve fresh zone and shift time attributes
    from app.db.postgres import db_manager
    user_rec = await db_manager.fetchrow(
        "SELECT zone, shift_start, shift_end FROM users WHERE username = $1",
        username
    )
    
    zone = user_rec["zone"] if user_rec else None
    shift_start = user_rec["shift_start"] if user_rec else None
    shift_end = user_rec["shift_end"] if user_rec else None
    
    return {
        "username": username,
        "role": role,
        "zone": zone,
        "shift_start": shift_start,
        "shift_end": shift_end
    }

class RoleChecker:
    """
    Dependency to restrict access to endpoints based on user roles.
    """
    def __init__(self, allowed_roles: list[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: dict = Depends(get_current_user)) -> dict:
        if current_user["role"] not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operation not permitted for this role",
            )
        return current_user

# ABAC Chained Dependencies
async def verify_zone_access(washroom_id: str, current_user: dict = Depends(get_current_user)) -> dict:
    """
    ABAC Dependency: Verifies if the operator is assigned to the terminal zone of the washroom.
    Fails closed with a 404 Not Found if the washroom_id is not mapped.
    """
    user_zone = current_user.get("zone")
    terminal = settings.WASHROOM_TERMINAL_MAP.get(washroom_id)
    
    if not terminal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Washroom ID '{washroom_id}' not found in terminal mapping configuration"
        )
        
    if user_zone is not None and terminal != user_zone:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Operation not permitted: washroom is in terminal {terminal}, but you are assigned to {user_zone}"
        )
        
    return current_user

def is_time_in_shift(current: datetime.time, start: datetime.time, end: datetime.time) -> bool:
    """
    Checks if current time is within [start, end] shift window, supporting overnight shifts.
    """
    if start <= end:
        return start <= current <= end
    else:  # Overnight shift (e.g. 22:00:00 to 06:00:00)
        return current >= start or current <= end

async def verify_active_shift(
    x_mock_time: str | None = Header(None, alias="X-Mock-Time"),
    current_user: dict = Depends(get_current_user)
) -> dict:
    """
    ABAC Dependency: Verifies if the request time falls within the user's active shift window.
    Accepts and respects the X-Mock-Time header ONLY when settings.APP_ENV == 'testing'.
    """
    # 1. Parse current checking time (mock or actual)
    if x_mock_time and settings.APP_ENV == "testing":
        try:
            current_time = datetime.strptime(x_mock_time, "%H:%M:%S").time()
        except ValueError:
            current_time = datetime.now(timezone.utc).time()
    else:
        current_time = datetime.now(timezone.utc).time()
        
    start_val = current_user.get("shift_start")
    end_val = current_user.get("shift_end")
    
    if start_val is None or end_val is None:
        return current_user
        
    # 2. Normalize types from DB
    if isinstance(start_val, str):
        start_val = datetime.strptime(start_val, "%H:%M:%S").time()
    elif isinstance(start_val, datetime):
        start_val = start_val.time()
        
    if isinstance(end_val, str):
        end_val = datetime.strptime(end_val, "%H:%M:%S").time()
    elif isinstance(end_val, datetime):
        end_val = end_val.time()
        
    # 3. Check shift validity
    if not is_time_in_shift(current_time, start_val, end_val):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operation not permitted: your shift is currently inactive"
        )
        
    return current_user
