"""Shared utility functions for DA Engine API endpoints."""


def get_whi_status(whi: float) -> str:
    """Resolve WHI score to human-readable status.
    
    Thresholds:
        >= 80: Good
        >= 60: Fair
        < 60:  Critical
    """
    if whi >= 80:
        return "Good"
    elif whi >= 60:
        return "Fair"
    else:
        return "Critical"
