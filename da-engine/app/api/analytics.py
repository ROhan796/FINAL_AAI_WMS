from fastapi import APIRouter, HTTPException
from app.storage.cache import cache_store
from app.models.washroom import WashroomState
from app.analytics.whi.thresholds import whi_thresholds

router = APIRouter()

# NOTE: /washrooms/{device_id} route moved to washrooms_detail.py
# to provide nested sensors/penalties format expected by the frontend portal.
