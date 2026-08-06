from typing import Any, Dict
from app.models.sensor import RawSensorPayload

class SchemaMapper:
    @staticmethod
    def map_and_fill_defaults(payload: RawSensorPayload) -> Dict[str, Any]:
        """
        Maps fields from RawSensorPayload to the schema expected by NormalizedTelemetry.
        Fills missing optional fields with appropriate default fallbacks.
        """
        # Determine device_id from either field
        device_id = payload.deviceId if payload.deviceId else (payload.device_id or "UNKNOWN")

        # Parse terminal ID and level from device ID
        parts = device_id.split("-")
        terminal_id = parts[0] if len(parts) > 0 else "UNKNOWN"
        floor_level = parts[1] if len(parts) > 1 else "L1"

        # Temperature and humidity
        temperature = payload.temperature if payload.temperature is not None else 25.0
        humidity = payload.humidity if payload.humidity is not None else 50.0

        # Ammonia — use nh3 field from API, fallback to ammonia_ppm
        ammonia = payload.nh3 if payload.nh3 is not None else (payload.ammonia_ppm or 0.0)

        # H2S — use h2s field from API, fallback to co2_ppm
        h2s = payload.h2s if payload.h2s is not None else (payload.co2_ppm or 0.0)

        # Occupancy from either field set
        occupancy = int(payload.occupancy_inside) if payload.occupancy_inside is not None else (payload.occupancy_count or 0)

        # CRITICAL: raw_whi must map to whi_score (NOT cleanliness_score)
        # This is the pre-computed WHI from the device firmware
        whi_score = payload.raw_whi if payload.raw_whi is not None else 100.0

        return {
            "device_id": device_id,
            "terminal_id": terminal_id,
            "floor_level": floor_level,
            "temperature_celsius": temperature,
            "humidity_pct": humidity,
            "pressure_hpa": 1013.25,
            "battery_pct": 100.0,
            "signal_rssi": -60.0,
            "ammonia_ppm": ammonia,
            "co2_ppm": h2s,
            "occupancy_count": occupancy,
            "soap_pct": 100.0,
            "paper_pct": 100.0,
            "sanitizer_pct": 100.0,
            "cleanliness_score": whi_score,
            # whi_score is what the API endpoints read — MUST be set from raw_whi
            "whi_score": whi_score,
            # Penalty fields passed through
            "penalty_nh3": payload.penalty_nh3 if payload.penalty_nh3 is not None else 0.0,
            "penalty_h2s": payload.penalty_h2s if payload.penalty_h2s is not None else 0.0,
            "penalty_humidity": payload.penalty_humidity if payload.penalty_humidity is not None else 0.0,
            "penalty_temperature": payload.penalty_temperature if payload.penalty_temperature is not None else 0.0,
            "peak_nh3_ppm": 0.0,
            "throughput": payload.throughput if payload.throughput is not None else 0.0,
        }

schema_mapper = SchemaMapper()
