from fastapi import APIRouter, HTTPException
from typing import List
from app.storage.cache import cache_store
from app.models.washroom import WashroomState
from app.analytics.floor.aggregator import floor_aggregator

router = APIRouter()

@router.get("/terminals/{terminal_id}/floors/{level}/washrooms", response_model=List[WashroomState])
async def get_floor_washrooms(terminal_id: str, level: str):
    """
    Returns array of washrooms with details and WHI scores on a specific floor.
    """
    all_telemetries = await cache_store.get_all_telemetry()
    
    # Filter telemetries by terminal_id and floor_level
    filtered = [
        t for t in all_telemetries 
        if t.terminal_id.upper() == terminal_id.upper() and t.floor_level.upper() == level.upper()
    ]
    
    if not filtered:
        # Check if terminal details are even present in airport summary
        summary = await cache_store.get_airport_summary()
        if not summary:
            return []
        
        # If no active telemetry is found, return empty list
        return []

    floor_sum = floor_aggregator.aggregate(level, filtered)
    return floor_sum.washrooms
