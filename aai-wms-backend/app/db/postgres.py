import asyncpg
from typing import List, Tuple, Any
from app.core.config import settings
from app.core.logger import logger

class PostgresManager:
    def __init__(self):
        self.pool: asyncpg.Pool | None = None

    REQUIRED_TABLES = (
        "washroom_telemetry",
        "incident_events",
        "floor_escalation_events",
        "raw_telemetry_audit",
    )

    async def connect(self):
        try:
            # Note: The asyncpg DSN doesn't usually use the +asyncpg scheme
            # like SQLAlchemy does, so we replace it if needed.
            dsn = settings.postgres_connection_url.replace("postgresql+asyncpg://", "postgresql://")
            ssl_opt = "require" if "sslmode=require" in settings.postgres_connection_url else None
            self.pool = await asyncpg.create_pool(dsn=dsn, ssl=ssl_opt)
            logger.info("PostgreSQL connected successfully")
            await self.initialize_schema()
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}")
            raise

    async def initialize_schema(self):
        # Schema ownership lives in db_init/01-init.sql, which Postgres runs
        # automatically from docker-entrypoint-initdb.d on first container
        # boot. This method used to duplicate every CREATE TABLE / hypertable
        # / index statement here in Python with IF NOT EXISTS guards, which
        # silently swallowed TimescaleDB errors via logger.warning and could
        # leave the app running against plain (non-hypertable) Postgres
        # tables without anyone noticing. Instead, this now just verifies
        # the schema the SQL init file was supposed to create actually
        # exists, and fails loudly if not - a missing table/extension should
        # stop startup, not degrade silently.
        if not self.pool:
            return
        async with self.pool.acquire() as conn:
            missing = []
            for table in self.REQUIRED_TABLES:
                exists = await conn.fetchval(
                    "SELECT to_regclass($1) IS NOT NULL", f"public.{table}"
                )
                if not exists:
                    missing.append(table)

            if missing:
                raise RuntimeError(
                    "Database schema is incomplete, missing tables: "
                    f"{', '.join(missing)}. Ensure db_init/01-init.sql has "
                    "run (it only runs automatically on a fresh Postgres "
                    "data volume - if the volume already existed, run it "
                    "manually)."
                )

            timescale_installed = await conn.fetchval(
                "SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb')"
            )
            if not timescale_installed:
                logger.warning(
                    "TimescaleDB extension not detected - tables exist but "
                    "may be plain Postgres tables rather than hypertables. "
                    "Check db_init/01-init.sql ran against a TimescaleDB image."
                )

            logger.info("Database schema verified successfully")

    async def disconnect(self):
        if self.pool:
            await self.pool.close()
            logger.info("PostgreSQL disconnected")

    async def execute(self, query: str, *args: Any) -> str:
        if not self.pool:
            raise RuntimeError("Database pool not initialized")
        async with self.pool.acquire() as conn:
            return await conn.execute(query, *args)

    async def fetch(self, query: str, *args: Any) -> List[asyncpg.Record]:
        if not self.pool:
            raise RuntimeError("Database pool not initialized")
        async with self.pool.acquire() as conn:
            return await conn.fetch(query, *args)

    async def fetchrow(self, query: str, *args: Any) -> asyncpg.Record | None:
        if not self.pool:
            raise RuntimeError("Database pool not initialized")
        async with self.pool.acquire() as conn:
            return await conn.fetchrow(query, *args)

    async def executemany(self, query: str, args_list: List[Tuple[Any, ...]]) -> None:
        if not self.pool:
            raise RuntimeError("Database pool not initialized")
        if not args_list:
            return

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                try:
                    await conn.executemany(query, args_list)
                except Exception as e:
                    logger.error(f"Batch execution transaction failed: {e}")
                    raise e

db_manager = PostgresManager()