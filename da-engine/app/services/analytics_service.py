from typing import List, Dict, Any
from datetime import datetime, timezone
from loguru import logger

from app.ingestion.normalizer import telemetry_normalizer
from app.ingestion.quality_checker import quality_checker
from app.processing.preprocessing import preprocessor
from app.processing.calibration import sensor_calibration
from app.analytics.whi.calculator import whi_calculator
from app.analytics.incidents.detector import incident_detector
from app.analytics.incidents.debouncer import incident_debouncer
from app.analytics.airport.aggregator import airport_aggregator
from app.storage.cache import cache_store
from app.storage.history import device_history_buffer
from app.storage.snapshots import snapshot_store

class AnalyticsService:
    async def process_raw_payloads(self, raw_payloads: List[Dict[str, Any]]):
        """
        Orchestrates the entire ingestion and analytics pipeline:
        Ingest -> Preprocess -> Normalize -> Quality Check -> Calibrate -> Compute WHI -> Incidents Debouncing -> Cache
        """
        logger.info(f"Orchestrating processing of {len(raw_payloads)} raw telemetry records.")
        
        all_incidents = []
        
        for raw in raw_payloads:
            try:
                # 1. Preprocess
                cleaned = preprocessor.preprocess(raw)
                
                # 2. Normalize
                telemetry = telemetry_normalizer.normalize(cleaned)
                if not telemetry:
                    continue
                    
                # 3. Quality Check
                if not quality_checker.check(telemetry):
                    continue
                    
                # 4. Calibrate (Placeholder)
                telemetry = sensor_calibration.calibrate(telemetry)
                
                # 5. Compute WHI
                whi_score = whi_calculator.compute_whi(telemetry)
                telemetry.whi_score = whi_score
                
                # 6. Update Circular History (with timestamp for trend charts)
                device_history_buffer.add_reading(
                    telemetry.device_id, whi_score, telemetry.recorded_at
                )
                
                # 7. Incident Detection & Debouncing
                breaches = incident_detector.detect_breaches(telemetry)
                device_incidents = incident_debouncer.process_telemetry_breaches(
                    telemetry.device_id, breaches, telemetry.recorded_at
                )
                all_incidents.extend(device_incidents)
                
                # 8. Update Snapshots
                snapshot_store.save_snapshot({
                    "device_id": telemetry.device_id,
                    "terminal_id": telemetry.terminal_id,
                    "whi_score": telemetry.whi_score,
                    "recorded_at": telemetry.recorded_at.isoformat()
                })
                
                # 9. Cache Individual Snapshot
                cache_store.update_telemetry(telemetry.device_id, telemetry)
                
            except Exception as e:
                logger.error(f"Failed to process telemetry payload: {e}")
                
        # 10. Update Active Incidents in Cache
        cache_store.set_active_incidents(incident_debouncer.get_all_active_incidents())
        
        # 11. Run Hierarchical Rollups
        all_telemetries = cache_store.get_all_telemetry()
        active_incidents = cache_store.active_incidents
        
        airport_sum = airport_aggregator.aggregate(all_telemetries, active_incidents)
        cache_store.set_airport_summary(airport_sum)
        logger.info(f"Analytics cache compilation complete. Average WHI: {airport_sum.avg_whi}%")

analytics_service = AnalyticsService()
