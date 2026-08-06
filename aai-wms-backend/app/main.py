import os
import sys
from pathlib import Path
from dotenv import load_dotenv

# Load .env2 in production, .env otherwise
_env_file = ".env2" if os.getenv("APP_ENV") == "production" else ".env"
load_dotenv(Path(__file__).resolve().parent.parent / _env_file, override=True)

sys.path.append(str(Path(__file__).resolve().parent.parent))

import asyncio
from fastapi import FastAPI
from contextlib import asynccontextmanager
from app.db.redis import redis_manager
from app.db.postgres import db_manager
from app.services.mqtt import mqtt_subscriber
from app.workers.priority import priority_worker
from app.workers.normal import normal_worker
from app.services.batcher import telemetry_batcher
from app.services.audit import audit_batcher
from app.core.logger import logger
from app.api.routes import router as api_router
from app.api.ws import router as ws_router

bg_tasks = []

async def seed_users():
    """
    Seeds default dashboard_operator and supervisor credentials in the users table.
    Connects briefly as the superuser, seeds, and closes connection before worker initialization.
    """
    from app.core.config import settings, get_secret
    from app.core.security import hash_password
    import asyncpg
    
    op_pass = get_secret("operator_password")
    sup_pass = get_secret("supervisor_password")
    pg_pass = get_secret("postgres_password")
    
    if not op_pass or not sup_pass or not pg_pass:
        logger.warning("Skipping database user seeding: missing required secrets")
        return
        
    logger.info("Initializing superuser connection to seed credentials...")
    superuser_url = settings.postgres_superuser_connection_url.replace("postgresql+asyncpg://", "postgresql://")
    ssl_opt = "require" if "sslmode=require" in superuser_url else None
    
    conn = None
    try:
        conn = await asyncpg.connect(dsn=superuser_url, ssl=ssl_opt)
        
        # Apply schema updates to ensure new attributes exist in existing volumes
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS zone TEXT DEFAULT NULL;")
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_start TIME NOT NULL DEFAULT '00:00:00';")
        await conn.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS shift_end TIME NOT NULL DEFAULT '23:59:59';")
        
        # Hash user passwords using Argon2id RFC settings (implemented in security.py)
        op_hash = hash_password(op_pass.strip())
        sup_hash = hash_password(sup_pass.strip())
        
        from datetime import time
        users_to_seed = [
            ("operator", op_hash, "dashboard_operator", "T1", time(0, 0, 0), time(23, 59, 59)),
            ("supervisor", sup_hash, "supervisor", "T1", time(0, 0, 0), time(23, 59, 59)),
            ("supervisor_t2", sup_hash, "supervisor", "T2", time(0, 0, 0), time(23, 59, 59)),
            ("supervisor_overnight", sup_hash, "supervisor", "T1", time(22, 0, 0), time(6, 0, 0)),
            ("supervisor_inactive", sup_hash, "supervisor", "T1", time(0, 0, 0), time(0, 1, 0)),
            ("supervisor_global", sup_hash, "supervisor", None, time(0, 0, 0), time(23, 59, 59)),
            ("admin", sup_hash, "admin", None, time(0, 0, 0), time(23, 59, 59)),
        ]
        
        for username, pw_hash, role, zone, start, end in users_to_seed:
            await conn.execute(
                """
                INSERT INTO users (username, password_hash, role, zone, shift_start, shift_end)
                VALUES ($1, $2, $3, $4, $5::TIME, $6::TIME)
                ON CONFLICT (username)
                DO UPDATE SET password_hash = EXCLUDED.password_hash,
                              role = EXCLUDED.role,
                              zone = EXCLUDED.zone,
                              shift_start = EXCLUDED.shift_start,
                              shift_end = EXCLUDED.shift_end
                """,
                username, pw_hash, role, zone, start, end
            )
        logger.info("Database user seeding completed successfully.")
    except Exception as e:
        logger.error(f"Critical error during database seeding: {e}")
        raise e
    finally:
        if conn:
            await conn.close()
            logger.info("Superuser database connection closed successfully.")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up FastAPI components...")
    
    # 1. Seed users as superuser before establishing the worker database pool
    await seed_users()
    
    # 2. Connect worker connection pool (running under the restricted role aai_app_worker)
    await db_manager.connect()
    
    # 3. Start telemetry batcher monitor
    await telemetry_batcher.start_monitor()
    await audit_batcher.start_monitor()
    
    # 4. Start workers
    bg_tasks.append(asyncio.create_task(priority_worker()))
    for _ in range(3):
        bg_tasks.append(asyncio.create_task(normal_worker()))
        
    # 5. Start MQTT Subscriber last so it starts pushing to queues only when workers are ready
    bg_tasks.append(asyncio.create_task(mqtt_subscriber.start()))
    
    yield
    
    logger.info("Shutting down FastAPI components...")
    
    # Graceful shutdown
    for task in bg_tasks:
        task.cancel()
        
    await asyncio.gather(*bg_tasks, return_exceptions=True)
    await telemetry_batcher.stop_monitor()
    await audit_batcher.stop_monitor()

    await db_manager.disconnect()
    await redis_manager.close()

app = FastAPI(
    title="AAI Intelligent Washroom Monitoring Pipeline",
    lifespan=lifespan
)

from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings as _settings

cors_origins = _settings.CORS_ORIGINS.split(",") if _settings.CORS_ORIGINS else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "OPTIONS", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Mock-Time", "Upgrade", "Connection", "Sec-WebSocket-Key", "Sec-WebSocket-Version", "Sec-WebSocket-Extensions", "Sec-WebSocket-Protocol"],
)

# Register endpoints router
app.include_router(api_router)
app.include_router(ws_router)

@app.get("/health")
async def health_check():
    from app.realtime.hub import wms_realtime_hub
    return {
        "status": "ok",
        "service": "wms-backend",
        "version": "2.0.0",
        "websocket": {
            "connected_clients": wms_realtime_hub.connection_count,
            "total_broadcasts": wms_realtime_hub.total_broadcasts,
        },
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
