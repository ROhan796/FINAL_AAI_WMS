from fastapi import APIRouter
from app.api import dashboard, analytics, trends, heatmap, incidents, reports, health
from app.api import terminals, levels, washrooms_detail, live_whi, seed

router = APIRouter()

router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
router.include_router(analytics.router, tags=["Analytics"])
router.include_router(trends.router, tags=["Trends"])
router.include_router(heatmap.router, tags=["Heatmap"])
router.include_router(incidents.router, tags=["Incidents"])
router.include_router(reports.router, tags=["Reports"])
router.include_router(health.router, tags=["Health"])
router.include_router(seed.router, tags=["Seed"])

# 54-device schema endpoints (no /api prefix — main.py already adds it)
router.include_router(terminals.router, tags=["Terminals"])
router.include_router(levels.router, tags=["Levels"])
router.include_router(washrooms_detail.router, tags=["Washrooms"])
router.include_router(live_whi.router, prefix="/dashboard", tags=["Live WHI"])
