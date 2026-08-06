from app.config.constants import UNIT_CAPACITY
from app.models.telemetry import NormalizedTelemetry
from app.analytics.whi.calculator import WHICalculator
from loguru import logger


class WHIEngine:
    """WHI calculation engine — delegates to WHICalculator for the actual formula."""

    @staticmethod
    def extract_unit_type(device_id: str) -> str:
        """
        Extracts unit type (PPM, PPF, PPD, STF) from standard device ID format:
        e.g., T1-L1-PPM-001 -> PPM
        """
        parts = device_id.split("-")
        for part in parts:
            if part in UNIT_CAPACITY:
                return part
        return "PPM"  # Default fallback

    @classmethod
    def calculate(cls, telemetry: NormalizedTelemetry) -> float:
        """Calculates the Washroom Hygiene Index (WHI) — delegates to WHICalculator."""
        return WHICalculator.compute_whi(telemetry)

    @staticmethod
    def resolve_status(whi_score: float) -> str:
        if whi_score < 60.0:
            return "CRITICAL"
        if whi_score < 75.0:
            return "WARNING"
        return "GOOD"
