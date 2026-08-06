# SLA Thresholds
WHI_THRESHOLD_CRITICAL = 60.0
WHI_THRESHOLD_FAIR = 80.0

AMMONIA_ALERT_PPM = 50.0
SUPPLY_ALERT_PCT = 20.0

# Unit Capacities - 54 Device Schema (NO STF)
UNIT_CAPACITY = {
    "PPD": 2,  # Disabled
    "PPM": 4,  # Men
    "PPF": 4,  # Female
}

# Device Structure Constants
TERMINALS = ["T1", "T2", "T3"]
LEVELS = [1, 2, 3, 4, 5, 6]
UNIT_TYPES = ["PPD", "PPM", "PPF"]

# WHI Thresholds for status determination
WHI_THRESHOLDS = {
    "CRITICAL": 60,
    "FAIR": 80,
    "GOOD": 100
}

# WHI calculation weights
WEIGHT_CLEANLINESS = 0.35
WEIGHT_OCCUPANCY = 0.20
WEIGHT_SUPPLIES = 0.25
WEIGHT_AIR_QUALITY = 0.20

# Incident Detection Thresholds (Schema Addendum Section 8)
INCIDENT_THRESHOLDS = {
    "CRITICAL_NH3": 30,
    "WARNING_NH3": 15,
    "CRITICAL_H2S": 2,
    "WARNING_H2S": 1,
    "CRITICAL_WHIP": 40,
    "WARNING_WHIP": 60,
    "WARNING_OCCUPANCY": 4,
    "WARNING_HUMIDITY": 75,
    "WARNING_TEMPERATURE": 30,
}
