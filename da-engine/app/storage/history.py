import threading
from typing import Dict, List, Optional
from collections import deque
from datetime import datetime
from app.config.settings import settings

class HistoryEntry:
    """A single history entry with timestamp and WHI score"""
    __slots__ = ('whi', 'timestamp')

    def __init__(self, whi: float, timestamp: Optional[datetime] = None):
        self.whi = whi
        self.timestamp = timestamp or datetime.utcnow()

    def to_dict(self):
        return {
            "whi": self.whi,
            "timestamp": self.timestamp.isoformat() if self.timestamp else "",
        }

class CircularHistoryBuffer:
    def __init__(self):
        self.lock = threading.Lock()
        # Maps device_id -> deque of HistoryEntry
        self.buffers: Dict[str, deque] = {}
        self.limit = settings.WHI_HISTORY_BUFFER_SIZE

    def add_reading(self, device_id: str, whi_score: float, timestamp: Optional[datetime] = None):
        with self.lock:
            if device_id not in self.buffers:
                self.buffers[device_id] = deque(maxlen=self.limit)
            self.buffers[device_id].append(HistoryEntry(whi_score, timestamp))

    def get_history(self, device_id: str) -> List[float]:
        """Return list of WHI scores (backward compatible)"""
        with self.lock:
            if device_id in self.buffers:
                return [entry.whi for entry in self.buffers[device_id]]
            return []

    def get_history_with_timestamps(self, device_id: str) -> List[dict]:
        """Return list of {whi, timestamp} dicts for trend charts"""
        with self.lock:
            if device_id in self.buffers:
                return [entry.to_dict() for entry in self.buffers[device_id]]
            return []

device_history_buffer = CircularHistoryBuffer()
