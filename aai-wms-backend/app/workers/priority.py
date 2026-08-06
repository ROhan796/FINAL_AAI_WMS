from app.workers.common import run_worker


async def priority_worker():
    await run_worker("priority")