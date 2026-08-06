import ssl
from redis.asyncio import Redis, ConnectionPool
from app.core.config import settings
from app.core.logger import logger


class RedisClient:
    def __init__(self):
        url = settings.redis_connection_url
        kwargs = {"decode_responses": True}

        # Upstash (rediss://) requires TLS
        if url.startswith("rediss://"):
            kwargs["ssl"] = ssl.create_default_context()

        self.pool = ConnectionPool.from_url(url, **kwargs)
        self.client = Redis(connection_pool=self.pool)

    async def get_client(self) -> Redis:
        return self.client

    async def close(self):
        await self.client.aclose()
        logger.info("Redis connection closed")


redis_manager = RedisClient()


async def get_redis():
    return await redis_manager.get_client()
