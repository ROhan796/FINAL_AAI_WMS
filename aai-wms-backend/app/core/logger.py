import json
import logging
import sys
import re
from datetime import datetime, timezone

class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        # Format timestamp in UTC ISO-8601 format
        timestamp = datetime.fromtimestamp(record.created, tz=timezone.utc).isoformat()
        
        # Determine service name dynamically from module/filename
        service = getattr(record, "service", None)
        if not service:
            module_name = record.module
            if module_name == "main":
                service = "fastapi"
            else:
                service = module_name
                
        log_data = {
            "timestamp": timestamp,
            "service": service,
            "level": record.levelname,
            "event": record.getMessage()
        }
        
        # Extract device_id if passed explicitly in extra (e.g. extra={"device_id": "..."})
        device_id = getattr(record, "device_id", None)
        if device_id:
            log_data["device_id"] = device_id
        else:
            # Proactively extract device_id patterns (like pico-T1-W01) from the log message itself
            msg = record.getMessage()
            match = re.search(r'\b(pico-[a-zA-Z0-9\-]+)\b', msg)
            if match:
                log_data["device_id"] = match.group(1)
                
        # Format exception traceback if present
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
            
        return json.dumps(log_data)

def setup_logging():
    # Intercept root logging configuration
    root = logging.getLogger()
    
    # Remove existing handlers
    for handler in root.handlers[:]:
        root.removeHandler(handler)
        
    # Setup custom JSON stdout handler
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JSONFormatter())
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    
    # Force uvicorn, fastapi, and their subloggers to propagate logs to the root handler
    for logger_name in ("uvicorn", "uvicorn.access", "uvicorn.error", "fastapi"):
        l = logging.getLogger(logger_name)
        l.handlers = []
        l.propagate = True
        
    return logging.getLogger("washroom_pipeline")

logger = setup_logging()
