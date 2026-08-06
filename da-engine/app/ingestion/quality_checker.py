from datetime import datetime, timezone, timedelta
from typing import Set, Tuple
from loguru import logger
from app.models.telemetry import NormalizedTelemetry

class QualityChecker:
    def __init__(self):
        # Cache of (device_id, recorded_at_timestamp) to detect duplicate telemetry payloads
        self.seen_signatures: Set[Tuple[str, float]] = set()

    def check(self, telemetry: NormalizedTelemetry) -> bool:
        """
        Validates data quality: stale timestamp, out-of-range sensor values, and duplicates.
        Returns True if payload is clean, False if it should be discarded.
        """
        now = datetime.now(timezone.utc)
        
        # 1. Staleness Check: Check if timestamp is older than 7 days or in the future
        if telemetry.recorded_at < now - timedelta(days=7):
            logger.warning(f"Telemetry quality warning: Stale data for {telemetry.device_id}. Recorded at {telemetry.recorded_at}")
            return False
        if telemetry.recorded_at > now + timedelta(minutes=5):
            logger.warning(f"Telemetry quality warning: Future timestamp for {telemetry.device_id}. Recorded at {telemetry.recorded_at}")
            return False

        # 2. Out-of-Range Checks
        if not (-20.0 <= telemetry.temperature_celsius <= 70.0):
            logger.warning(f"Telemetry quality warning: Temperature out of range ({telemetry.temperature_celsius} C) for {telemetry.device_id}")
            return False
        if not (0.0 <= telemetry.humidity_pct <= 100.0):
            logger.warning(f"Telemetry quality warning: Humidity out of range ({telemetry.humidity_pct}%) for {telemetry.device_id}")
            return False
        if telemetry.ammonia_ppm < 0.0 or telemetry.ammonia_ppm > 500.0:
            logger.warning(f"Telemetry quality warning: Ammonia out of range ({telemetry.ammonia_ppm} ppm) for {telemetry.device_id}")
            return False
        if not (0.0 <= telemetry.soap_pct <= 100.0) or not (0.0 <= telemetry.paper_pct <= 100.0) or not (0.0 <= telemetry.sanitizer_pct <= 100.0):
            logger.warning(f"Telemetry quality warning: Consumable percentages out of range for {telemetry.device_id}")
            return False
            
        # 3. Duplicate Check
        signature = (telemetry.device_id, telemetry.recorded_at.timestamp())
        if signature in self.seen_signatures:
            logger.debug(f"Telemetry quality info: Duplicate record ignored for {telemetry.device_id} at {telemetry.recorded_at}")
            return False
            
        # Keep seen signature cache clean (prune older than 24 hours)
        self.seen_signatures.add(signature)
        if len(self.seen_signatures) > 10000:
            threshold = now.timestamp() - 86400
            self.seen_signatures = {s for s in self.seen_signatures if s[1] >= threshold}

        return True

quality_checker = QualityChecker()
