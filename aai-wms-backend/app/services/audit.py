import asyncio
import json
import time
from datetime import datetime, timezone
from redis.asyncio import Redis

from app.db.redis import get_redis
from app.db.postgres import db_manager
from app.core.logger import logger

class AuditBatcher:
    def __init__(self):
        self._monitor_task: asyncio.Task | None = None
        # BUG 5 FIX: track fire-and-forget flush tasks so they aren't
        # silently garbage collected mid-flight, so exceptions inside them
        # actually get logged instead of dropped, and so shutdown can wait
        # for them instead of letting them run after the DB pool closes.
        self._flush_tasks: set[asyncio.Task] = set()
        self._shutting_down = False

    async def push_raw(self, topic: str, payload_bytes: bytes, redis: Redis = None):
        if redis is None:
            redis = await get_redis()

        buffer_key = "state:audit_buffer"

        try:
            raw_payload = payload_bytes.decode('utf-8', errors='replace')
        except Exception:
            raw_payload = str(payload_bytes)

        record = {
            "received_at": datetime.now(timezone.utc).isoformat(),
            "topic": topic,
            "raw_payload": raw_payload
        }
        record_json = json.dumps(record)

        length = await redis.rpush(buffer_key, record_json)

        # Trigger immediate flush if size limit is reached (100)
        if length >= 100 and not self._shutting_down:
            logger.info("Buffer size limit (100) reached for state:audit_buffer. Flushing immediately in background.")
            task = asyncio.create_task(self.flush_buffer(redis))
            self._flush_tasks.add(task)
            task.add_done_callback(self._on_flush_task_done)

    def _on_flush_task_done(self, task: asyncio.Task):
        self._flush_tasks.discard(task)
        if task.cancelled():
            return
        exc = task.exception()
        if exc is not None:
            logger.error(f"Background audit flush task failed: {exc}")

    async def flush_buffer(self, redis: Redis = None):
        if redis is None:
            redis = await get_redis()

        buffer_key = "state:audit_buffer"
        temp_key = f"{buffer_key}:temp"

        # Atomically rename to temp_key to avoid race conditions with incoming writes
        try:
            await redis.rename(buffer_key, temp_key)
        except Exception:
            # Key might not exist (already renamed or empty)
            return

        # Fetch elements
        items = await redis.lrange(temp_key, 0, -1)
        if not items:
            await redis.delete(temp_key)
            return

        # Parse payloads and prepare db parameters
        list_of_tuples = []
        for item in items:
            try:
                record = json.loads(item)
                received_at_dt = datetime.fromisoformat(record["received_at"])
                list_of_tuples.append((
                    received_at_dt,
                    record["topic"],
                    record["raw_payload"]
                ))
            except Exception as parse_err:
                logger.warning(f"Skipping malformed audit record during batch insert: {parse_err}")

        # Perform bulk write
        if list_of_tuples:
            try:
                await self._bulk_insert_to_db(list_of_tuples)
                # Successful insert, clean up temp key
                await redis.delete(temp_key)
            except Exception as db_err:
                logger.error(f"Bulk insert failed for {buffer_key}: {db_err}. Restoring buffered items.")
                # Attempt to restore elements to the main buffer to prevent data loss
                try:
                    while await redis.llen(temp_key) > 0:
                        val = await redis.rpop(temp_key)
                        if val:
                            await redis.lpush(buffer_key, val)
                except Exception as restore_err:
                    logger.critical(f"Failed to restore temp buffer after DB failure: {restore_err}")
                raise db_err

        # Update last flush time
        current_time = time.time()
        await redis.set("state:audit_last_flush_time", str(current_time))

    async def _bulk_insert_to_db(self, list_of_tuples):
        # BUG 4 FIX: go through db_manager.executemany() instead of reaching
        # into db_manager.pool directly - one consistent DB access path.
        query = """
        INSERT INTO raw_telemetry_audit (
            received_at, topic, raw_payload
        ) VALUES ($1, $2, $3)
        """
        await db_manager.executemany(query, list_of_tuples)

    async def start_monitor(self):
        if self._monitor_task is not None:
            return
        self._monitor_task = asyncio.create_task(self.monitor_and_flush())

    async def stop_monitor(self):
        # BUG 5 FIX: stop accepting new background flushes and let any
        # in-flight ones finish before the caller closes the DB pool.
        self._shutting_down = True
        if self._flush_tasks:
            await asyncio.gather(*self._flush_tasks, return_exceptions=True)

        if self._monitor_task is None:
            return
        self._monitor_task.cancel()
        try:
            await self._monitor_task
        except asyncio.CancelledError:
            pass
        self._monitor_task = None

    async def monitor_and_flush(self):
        logger.info("Audit batcher monitor started")
        redis = await get_redis()
        while True:
            try:
                length = await redis.llen("state:audit_buffer")
                if length > 0:
                    current_time = time.time()
                    last_flush_time_str = await redis.get("state:audit_last_flush_time")

                    should_flush = False
                    if length >= 100:
                        should_flush = True
                    elif last_flush_time_str is None:
                        should_flush = True
                    else:
                        time_since_last = current_time - float(last_flush_time_str)
                        if time_since_last >= 5.0:
                            should_flush = True

                    if should_flush:
                        await self.flush_buffer(redis)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Error in audit batcher monitor: {e}")

            await asyncio.sleep(0.5)

audit_batcher = AuditBatcher()