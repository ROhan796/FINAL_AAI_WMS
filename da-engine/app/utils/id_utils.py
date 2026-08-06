import re
from typing import Optional, Dict, Any

# VALIDATE against 54-device format
DEVICE_ID_PATTERN = re.compile(
    r'^(T[1-3])-(L[1-6])-(PPD|PPM|PPF)-(\d{3})$'
)

def parse_device_id(device_id: str) -> Optional[Dict[str, Any]]:
    """
    Parse device ID format: Tn-Lm-PPX-NNN
    Returns dict with terminal, level, type, number or None if invalid
    """
    match = DEVICE_ID_PATTERN.match(device_id)
    if not match:
        return None

    terminal, level, unit_type, number = match.groups()
    return {
        "terminal": terminal,      # T1, T2, T3
        "level": level,            # L1-L6
        "type": unit_type,         # PPD, PPM, PPF
        "number": int(number),     # 1-54
        "terminal_num": int(terminal[1]),
        "level_num": int(level[1]),
    }

def validate_device_id(device_id: str) -> bool:
    """Check if device_id matches the 54-device format"""
    return DEVICE_ID_PATTERN.match(device_id) is not None

def get_device_type(device_id: str) -> Optional[str]:
    """Extract device type (PPD/PPM/PPF) from device ID"""
    parsed = parse_device_id(device_id)
    return parsed["type"] if parsed else None

def get_terminal(device_id: str) -> Optional[str]:
    """Extract terminal (T1/T2/T3) from device ID"""
    parsed = parse_device_id(device_id)
    return parsed["terminal"] if parsed else None

def get_level(device_id: str) -> Optional[str]:
    """Extract level (L1-L6) from device ID"""
    parsed = parse_device_id(device_id)
    return parsed["level"] if parsed else None
