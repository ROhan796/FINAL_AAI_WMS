import asyncio
from app.services.queue import queue_router
from app.services.incident import get_incident_engine
from app.services.batcher import telemetry_batcher
from app.db.redis import get_redis
from app.core.logger import logger


async def _get_next_payload():
    pq = queue_router.priority_queue
    nq = queue_router.normal_queue

    if not pq.empty():
        return pq.get_nowait(), True

    pq_task = asyncio.ensure_future(pq.get())
    nq_task = asyncio.ensure_future(nq.get())
    try:
        done, pending = await asyncio.wait(
            {pq_task, nq_task}, return_when=asyncio.FIRST_COMPLETED
        )
    except asyncio.CancelledError:
        pq_task.cancel()
        nq_task.cancel()
        raise

    if pq_task in done:
        if nq_task in done:
            nq.put_nowait(nq_task.result())
        else:
            nq_task.cancel()
        return pq_task.result(), True

    pq_task.cancel()
    try:
        await pq_task
    except (asyncio.CancelledError, Exception):
        pass
    return nq_task.result(), False


async def run_worker(name: str):
    logger.info(f"Starting {name} worker")
    redis = await get_redis()
    incident_engine = get_incident_engine(redis)

    while True:
        try:
            payload, was_priority = await _get_next_payload()
            await incident_engine.process_reading(payload)
            await telemetry_batcher.push_payload(payload.terminal, payload.washroom_id, payload, redis)
            if was_priority:
                queue_router.priority_queue.task_done()
            else:
                queue_router.normal_queue.task_done()
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Error in {name} worker: {e}")