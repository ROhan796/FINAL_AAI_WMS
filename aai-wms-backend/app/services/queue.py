import asyncio
from app.models.schemas import TelemetryPayload
from app.core.logger import logger
from app.core.config import settings

class DualQueueRouter:
    def __init__(self):
        # Bounded queues to prevent OOM
        self.priority_queue = asyncio.Queue(maxsize=1000)
        self.normal_queue = asyncio.Queue(maxsize=10000)

    async def route_message(self, payload: TelemetryPayload):
        # Routing logic
        is_priority = (payload.msg_type == "alert") or (payload.raw_whi < settings.WHI_CRITICAL_THRESHOLD)
        
        target_queue = self.priority_queue if is_priority else self.normal_queue
        queue_name = "priority" if is_priority else "normal"
        
        try:
            target_queue.put_nowait(payload)
            # logger.debug(f"Routed message to {queue_name} queue")
        except asyncio.QueueFull:
            logger.error(f"{queue_name.capitalize()} queue is FULL. Dropping message for {payload.device_id}")

queue_router = DualQueueRouter()
