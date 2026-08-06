import time
from redis.asyncio import Redis
from app.core.config import settings
from app.core.logger import logger

# Atomic Lua Script for multi-instance distributed safe token-bucket rate limiting
LUA_RATE_LIMITER = """
local key = KEYS[1]
local max_tokens = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current_time = tonumber(ARGV[3])

-- 1. Fetch current bucket state from Redis Hash
local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(data[1])
local last_refill = tonumber(data[2])

-- 2. If bucket doesn't exist, initialize it fully
if not tokens or not last_refill then
    tokens = max_tokens
    last_refill = current_time
else
    -- 3. Check window condition: Full structural reset if the window elapsed
    if (current_time - last_refill) >= window then
        tokens = max_tokens
        last_refill = current_time
    end
end

-- 4. Evaluate token capacity and consume atomic credit
if tokens > 0 then
    tokens = tokens - 1
    redis.call('HSET', key, 'tokens', tokens, 'last_refill', last_refill)
    redis.call('EXPIRE', key, window * 2) -- Protect memory lifecycle
    return 1 -- ALLOWED
else
    return 0 -- RATE LIMITED
end
"""

class RateLimiter:
    def __init__(self, redis: Redis):
        self.redis = redis
        self.limit = settings.RATE_LIMIT_MESSAGES
        self.window = settings.RATE_LIMIT_WINDOW_SECONDS
        # Compile and register the Lua script execution shortcut
        self._lua_script = self.redis.register_script(LUA_RATE_LIMITER)

    async def is_allowed(self, device_id: str) -> bool:
        key = f"rate_limit:{device_id}"
        current_time = int(time.time())
        
        try:
            # Execute the Lua script atomically on the Redis server
            # keys=[key], args=[limit, window, current_time]
            result = await self._lua_script(
                keys=[key], 
                args=[self.limit, self.window, current_time]
            )
            
            if result == 1:
                return True
            else:
                logger.warning(f"Device {device_id} exceeded rate limit")
                return False
                
        except Exception as e:
            logger.error(f"Rate limiting failed for {device_id}: {e}")
            # Fail closed for maximum system protection
            return False
