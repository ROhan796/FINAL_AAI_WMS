from app.workers.common import run_worker


async def normal_worker():
    await run_worker("normal")