from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional

class NormalizedTelemetry(BaseModel):
    device_id: str
    terminal_id: str          # Extracted from device_id pattern
    floor_level: str          # Extracted from device_id pattern
    temperature_celsius: float
    humidity_pct: float
    pressure_hpa: Optional[float] = None
    battery_pct: Optional[float] = None
    signal_rssi: Optional[float] = None
    ammonia_ppm: float = 0.0        # Core sensing: NH3 level
    co2_ppm: Optional[float] = None  # Core sensing: CO2 level
    occupancy_count: int = 0         # Core sensing: people inside
    # Consumable fields - not used in core sensing pipeline, kept for backward compat
    soap_pct: float = Field(default=100.0, deprecated=True)
    paper_pct: float = Field(default=100.0, deprecated=True)
    sanitizer_pct: float = Field(default=100.0, deprecated=True)
    cleanliness_score: float = 100.0
    recorded_at: datetime     # Parsed and UTC-normalized timestamp
    whi_score: float = 0.0    # Core: Washroom Hygiene Index
    # Penalty fields from device firmware
    penalty_nh3: float = 0.0
    penalty_h2s: float = 0.0
    penalty_humidity: float = 0.0
    penalty_temperature: float = 0.0
    peak_nh3_ppm: float = 0.0       # Core sensing: peak NH3
    throughput: float = 0.0          # Core sensing: traffic count
