import asyncio
import time
from loguru import logger

class TokenBucketRateLimiter:
    def __init__(self, rate_per_minute: int = 60):
        self.capacity = rate_per_minute
        self.tokens = float(rate_per_minute)
        self.fill_rate = rate_per_minute / 60.0  # tokens per second
        self.last_fill = time.monotonic()
        self.lock = asyncio.Lock()

    async def acquire(self):
        async with self.lock:
            now = time.monotonic()
            elapsed = now - self.last_fill
            self.last_fill = now
            
            # Add tokens based on elapsed time
            self.tokens = min(self.capacity, self.tokens + elapsed * self.fill_rate)
            
            if self.tokens < 1.0:
                # Calculate sleep duration to get 1 token
                sleep_duration = (1.0 - self.tokens) / self.fill_rate
                logger.info(f"Rate limit approaching. Throttling for {sleep_duration:.2f} seconds...")
                await asyncio.sleep(sleep_duration)
                # After sleeping, consume the 1 token we accumulated.
                # Do NOT update last_fill — the elapsed time on next call
                # will naturally account for the sleep duration.
                self.tokens = 0.0
            else:
                self.tokens -= 1.0

rate_limiter = TokenBucketRateLimiter(60)
