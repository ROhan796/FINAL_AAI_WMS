from enum import Enum

class IncidentState(str, Enum):
    NORMAL = "NORMAL"
    PENDING_ALERT = "PENDING_ALERT"
    ACTIVE_INCIDENT = "ACTIVE_INCIDENT"
    RESOLVED = "RESOLVED"

class FloorState(str, Enum):
    NORMAL = "NORMAL"
    FLOOR_CRITICAL = "FLOOR_CRITICAL"
