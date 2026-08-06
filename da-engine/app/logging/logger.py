import sys
import json
from loguru import logger
from app.config.settings import settings

def serialize(record):
    subset = {
        "timestamp": record["time"].isoformat(),
        "level": record["level"].name,
        "message": record["message"],
        "module": record["module"],
        "function": record["function"],
        "line": record["line"]
    }
    if record["exception"]:
        subset["exception"] = record["exception"]
    return json.dumps(subset)

def json_formatter(record):
    record["extra"]["serialized"] = serialize(record)
    return "{extra[serialized]}\n"

def setup_logging():
    # Remove default handler
    logger.remove()
    
    log_level = settings.LOG_LEVEL.upper()
    
    # In production/staging, log JSON format to stdout.
    # In development, use a clean human-readable console logger.
    if settings.ENVIRONMENT.lower() in ("production", "staging"):
        logger.add(
            sys.stdout,
            level=log_level,
            format=json_formatter,
            colorize=False,
            backtrace=True,
            diagnose=False
        )
    else:
        logger.add(
            sys.stdout,
            level=log_level,
            format="<green>{time:YYYY-MM-DD HH:mm:ss.SSS}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan>:<cyan>{function}</cyan>:<cyan>{line}</cyan> - <level>{message}</level>",
            colorize=True,
            backtrace=True,
            diagnose=True
        )

# Run setup upon module import
setup_logging()
