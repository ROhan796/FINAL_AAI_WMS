import time
import random
import httpx
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception,
    RetryCallState,
)
from loguru import logger


def is_retryable(exception: BaseException) -> bool:
    if isinstance(exception, httpx.RequestError):
        return True
    if isinstance(exception, httpx.HTTPStatusError):
        code = exception.response.status_code
        return code == 429 or code >= 500
    return False


def _get_retry_after(exception: BaseException) -> float | None:
    if isinstance(exception, httpx.HTTPStatusError):
        header = exception.response.headers.get("Retry-After")
        if header:
            try:
                return max(float(header), 1.0)
            except (ValueError, TypeError):
                pass
    return None


def _wait_strategy(retry_state: RetryCallState) -> float:
    exc = retry_state.outcome.exception() if retry_state.outcome else None
    if exc:
        ra = _get_retry_after(exc)
        if ra is not None:
            # Add jitter: 50-150% of Retry-After value
            jittered = ra * random.uniform(0.5, 1.5)
            logger.info(f"Retry-After header: waiting {jittered:.1f}s (base: {ra:.1f}s)")
            return jittered

        # For 429 specifically, use longer base wait with jitter
        if isinstance(exc, httpx.HTTPStatusError) and exc.response.status_code == 429:
            base_wait = min(2 ** retry_state.attempt_number * 5, 120)
            jittered = base_wait * random.uniform(0.5, 1.5)
            logger.warning(f"Rate limited (429): backoff {jittered:.1f}s (attempt {retry_state.attempt_number})")
            return jittered

    return wait_exponential(multiplier=2, min=3, max=30)(retry_state)


nscbi_retry = retry(
    retry=retry_if_exception(is_retryable),
    stop=stop_after_attempt(5),
    wait=_wait_strategy,
    reraise=True,
)


class CircuitBreaker:
    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 60.0):
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.failure_count = 0
        self.last_failure_time: float = 0.0
        self.state = "closed"

    def record_success(self):
        self.failure_count = 0
        self.state = "closed"

    def record_failure(self):
        self.failure_count += 1
        self.last_failure_time = time.monotonic()
        if self.failure_count >= self.failure_threshold:
            self.state = "open"
            logger.warning(
                f"Circuit breaker OPEN after {self.failure_count} failures. "
                f"Recovery in {self.recovery_timeout}s."
            )

    def allow_request(self) -> bool:
        if self.state == "closed":
            return True
        if self.state == "open":
            elapsed = time.monotonic() - self.last_failure_time
            if elapsed >= self.recovery_timeout:
                self.state = "half-open"
                logger.info("Circuit breaker: half-open, allowing probe request")
                return True
            return False
        return True


circuit_breaker = CircuitBreaker(failure_threshold=5, recovery_timeout=60.0)
