import asyncio
from redis.asyncio import Redis, ConnectionPool
from app.core.config import settings
from app.core.logger import logger


class RedisClient:
    def __init__(self):
        url = settings.redis_connection_url
        kwargs = {
            "decode_responses": True,
            "max_connections": 20,
            "retry_on_timeout": True,
            "socket_connect_timeout": 5,
            "socket_timeout": 5,
            "health_check_interval": 30,
        }

        self.pool = ConnectionPool.from_url(url, **kwargs)
        self.client = Redis(connection_pool=self.pool)

    async def get_client(self) -> Redis:
        return self.client

    async def close(self):
        await self.client.aclose()
        logger.info("Redis connection closed")


redis_manager = RedisClient()


async def get_redis(max_retries: int = 3, retry_delay: float = 1.0) -> Redis:
    for attempt in range(max_retries):
        try:
            client = await redis_manager.get_client()
            await client.ping()
            return client
        except Exception as e:
            if attempt < max_retries - 1:
                logger.warning(f"Redis connection attempt {attempt + 1} failed: {e}. Retrying in {retry_delay}s...")
                await asyncio.sleep(retry_delay)
                retry_delay *= 2
            else:
                logger.error(f"Failed to connect to Redis after {max_retries} attempts: {e}")
                raise
