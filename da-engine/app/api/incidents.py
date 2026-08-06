from fastapi import APIRouter
from typing import List, Dict, Any
from app.storage.cache import cache_store
from app.config.settings import settings
from app.config.constants import UNIT_CAPACITY
from app.utils.id_utils import parse_device_id

router = APIRouter()

@router.get("/incidents", response_model=List[Dict[str, Any]])
async def get_incidents(limit: int = 100) -> List[Dict[str, Any]]:
    """
    Get auto-detected incidents based on threshold breaches.
    Thresholds based on WHI penalty tables:
    - CRITICAL_NH3: nh3 > 8 ppm
    - WARNING_NH3: nh3 > 4 ppm
    - CRITICAL_H2S: h2s > 5 ppm
    - WARNING_H2S: h2s > 3 ppm
    - CRITICAL_WHIP: raw_whi < 40
    - LOW_WHIP: raw_whi < 60
    - HIGH_OCCUPANCY: occupancy >= capacity (PPD:2, PPM:4, PPF:4)
    - HIGH_HUMIDITY: humidity > 80%
    - HIGH_TEMPERATURE: temperature > 32°C
    """
    all_device_ids = settings.device_id_list

    incidents = []

    for device_id in all_device_ids:
        telemetry = cache_store.get_telemetry(device_id)
        if not telemetry:
            continue

        parsed = parse_device_id(device_id)
        if not parsed:
            continue

        nh3 = telemetry.ammonia_ppm if hasattr(telemetry, 'ammonia_ppm') else 0
        h2s = telemetry.co2_ppm if hasattr(telemetry, 'co2_ppm') else 0
        whi = telemetry.whi_score if hasattr(telemetry, 'whi_score') else 100
        humidity = telemetry.humidity_pct if hasattr(telemetry, 'humidity_pct') else 50
        temperature = telemetry.temperature_celsius if hasattr(telemetry, 'temperature_celsius') else 25
        occupancy = telemetry.occupancy_count if hasattr(telemetry, 'occupancy_count') else 0
        timestamp = telemetry.recorded_at.isoformat() if hasattr(telemetry, 'recorded_at') and telemetry.recorded_at else ""

        # Get capacity for this device type
        unit_type = parsed["type"]
        capacity = UNIT_CAPACITY.get(unit_type, 4)

        # CRITICAL incidents (based on WHI penalty tables)
        if nh3 > 8:
            incidents.append(create_incident(
                device_id, parsed, "CRITICAL", "CRITICAL_NH3",
                "Critical NH3", nh3, 8, timestamp, whi
            ))
        if h2s > 5:
            incidents.append(create_incident(
                device_id, parsed, "CRITICAL", "CRITICAL_H2S",
                "Critical H2S", h2s, 5, timestamp, whi
            ))
        if whi < 40:
            incidents.append(create_incident(
                device_id, parsed, "CRITICAL", "CRITICAL_WHIP",
                "Critical WHI", whi, 40, timestamp, whi
            ))

        # WARNING incidents
        if nh3 > 4:
            incidents.append(create_incident(
                device_id, parsed, "WARNING", "HIGH_NH3",
                "High NH3", nh3, 4, timestamp, whi
            ))
        if h2s > 3:
            incidents.append(create_incident(
                device_id, parsed, "WARNING", "HIGH_H2S",
                "High H2S", h2s, 3, timestamp, whi
            ))
        if whi < 60:
            incidents.append(create_incident(
                device_id, parsed, "WARNING", "LOW_WHIP",
                "Low WHI", whi, 60, timestamp, whi
            ))
        if occupancy >= capacity:
            incidents.append(create_incident(
                device_id, parsed, "WARNING", "HIGH_OCCUPANCY",
                "High Occupancy", occupancy, capacity, timestamp, whi
            ))
        if humidity > 80:
            incidents.append(create_incident(
                device_id, parsed, "WARNING", "HIGH_HUMIDITY",
                "High Humidity", humidity, 80, timestamp, whi
            ))
        if temperature > 32:
            incidents.append(create_incident(
                device_id, parsed, "WARNING", "HIGH_TEMPERATURE",
                "High Temperature", temperature, 32, timestamp, whi
            ))

    # Sort by severity (CRITICAL first) then by timestamp
    severity_order = {"CRITICAL": 0, "WARNING": 1}
    incidents.sort(key=lambda x: (severity_order.get(x["severity"], 2), x["timestamp"]))

    return incidents[:limit]

def create_incident(
    device_id: str,
    parsed: dict,
    severity: str,
    incident_type: str,
    description: str,
    value: float,
    threshold: float,
    timestamp: str,
    whi: float,
) -> Dict[str, Any]:
    """Create an incident record"""
    return {
        "device_id": device_id,
        "terminal": parsed["terminal"],
        "level": parsed["level"],
        "type": parsed["type"],
        "incident_type": incident_type,
        "severity": severity,
        "description": description,
        "value": value,
        "threshold": threshold,
        "timestamp": timestamp,
        "whi": whi,
    }
