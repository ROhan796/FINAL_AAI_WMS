from pydantic import BaseModel, Field
from datetime import datetime

class TelemetryPayload(BaseModel):
    device_id: str = Field(..., min_length=1, pattern=r'^pico-[a-zA-Z0-9\-]+$')
    timestamp: datetime
    avg_nh3_ppm: float = Field(..., ge=0.0, le=500.0)
    peak_nh3_ppm: float = Field(..., ge=0.0, le=500.0)
    avg_temperature_c: float = Field(..., ge=-10.0, le=60.0)
    avg_humidity_percent: float = Field(..., ge=0.0, le=100.0)
    throughput: int = Field(..., ge=0, le=10000)
    occupancy_inside: int = Field(..., ge=0, le=1000)
    abandon_rate_percent: float = Field(..., ge=0.0, le=100.0)
    raw_whi: float = Field(..., ge=0.0, le=100.0)
    
    # Inferred from MQTT topic (washroom/{terminal}/{washroom_id}/{msg_type})
    terminal: str | None = Field(None, pattern=r'^[a-zA-Z0-9\-_]+$')
    washroom_id: str | None = Field(None, pattern=r'^[a-zA-Z0-9\-_]+$')
    msg_type: str | None = Field(None, pattern=r'^(telemetry|alerts|heartbeat)$')
