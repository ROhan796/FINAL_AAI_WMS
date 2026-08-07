from typing import Optional
from app.storage.cache import cache_store
from app.models.airport import AirportSummary

class DashboardService:
    async def get_summary(self) -> Optional[AirportSummary]:
        """
        Retrieves the compiled AirportSummary from the cache.
        """
        return await cache_store.get_airport_summary()

dashboard_service = DashboardService()
