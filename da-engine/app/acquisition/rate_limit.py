import asyncio
import time
from loguru import logger
from app.config.settings import settings


class TokenBucketRateLimiter:
    def __init__(self, rate_per_minute: int = 60, burst_buffer: int = 5):
        self.capacity = rate_per_minute
        self.tokens = float(rate_per_minute - burst_buffer)
        self.fill_rate = rate_per_minute / 60.0
        self.last_fill = time.monotonic()
        self.lock = asyncio.Lock()

    async def acquire(self):
        async with self.lock:
            now = time.monotonic()
            elapsed = now - self.last_fill
            self.last_fill = now

            self.tokens = min(self.capacity, self.tokens + elapsed * self.fill_rate)

            if self.tokens < 1.0:
                sleep_duration = (1.0 - self.tokens) / self.fill_rate
                logger.debug(f"Rate limit: throttling {sleep_duration:.2f}s")
                await asyncio.sleep(sleep_duration)
                self.tokens = 0.0
            else:
                self.tokens -= 1.0


rate_limiter = TokenBucketRateLimiter(
    rate_per_minute=settings.RATE_LIMIT_PER_MINUTE,
    burst_buffer=5,
)
