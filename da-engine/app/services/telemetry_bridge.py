"""
Telemetry Bridge: Syncs DA Engine in-memory telemetry to WMS Backend PostgreSQL.
Uses COPY protocol for high-throughput bulk inserts (5-10x faster than executemany).
Runs as a background task inside the DA Engine process.
"""

import asyncio
import asyncpg
from datetime import datetime, timezone
from loguru import logger


class TelemetryBridge:
    def __init__(self):
        self.pool: asyncpg.Pool | None = None
        self.running = False
        self._task: asyncio.Task | None = None
        self._sync_interval = 30  # seconds, matches DA Engine polling interval

    async def connect(self):
        """Connect to WMS Backend PostgreSQL (supports NeonDB with SSL)."""
        import os
        try:
            # Prefer DATABASE_URL (single connection string) over individual WMS_PG_* vars
            dsn = os.environ.get('DATABASE_URL', '')
            if not dsn:
                # Fallback: construct from individual vars (all required, no hardcoded defaults)
                host = os.environ.get('WMS_PG_HOST', '')
                port = os.environ.get('WMS_PG_PORT', '5432')
                db = os.environ.get('WMS_PG_DB', '')
                user = os.environ.get('WMS_PG_USER', '')
                password = os.environ.get('WMS_PG_PASSWORD', '')
                ssl_mode = os.environ.get('WMS_PG_SSLMODE', 'require')
                if not all([host, db, user]):
                    logger.error("TelemetryBridge: DATABASE_URL or WMS_PG_HOST/WMS_PG_DB/WMS_PG_USER must be set")
                    self.pool = None
                    return
                dsn = f"postgresql://{user}:{password}@{host}:{port}/{db}?sslmode={ssl_mode}"
            self.pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=3)
            logger.info("TelemetryBridge: Connected to PostgreSQL")
        except Exception as e:
            logger.error(f"TelemetryBridge: Failed to connect to PostgreSQL: {e}")
            self.pool = None

    async def disconnect(self):
        """Disconnect from PostgreSQL."""
        if self._task:
            self._task.cancel()
        if self.pool:
            await self.pool.close()
            logger.info("TelemetryBridge: Disconnected from PostgreSQL")

    async def start_sync(self, cache_store):
        """Start periodic sync of DA Engine cache to PostgreSQL."""
        if not self.pool:
            await self.connect()
        if not self.pool:
            logger.warning("TelemetryBridge: No DB connection, skipping sync")
            return

        self.running = True
        self._task = asyncio.create_task(self._sync_loop(cache_store))
        logger.info("TelemetryBridge: Started telemetry sync loop")

    async def _sync_loop(self, cache_store):
        """Main sync loop: reads from cache, writes to PostgreSQL."""
        while self.running:
            try:
                await self._sync_once(cache_store)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"TelemetryBridge: Sync error: {e}")
            await asyncio.sleep(self._sync_interval)

    async def _sync_once(self, cache_store):
        """Single sync pass: read all cached telemetry, bulk insert into PostgreSQL using COPY protocol."""
        if not self.pool:
            return

        all_telemetry = cache_store.get_all_telemetry()
        if not all_telemetry:
            return

        rows = []
        now = datetime.now(timezone.utc)
        for telem in all_telemetry:
            device_id = telem.device_id
            terminal = getattr(telem, 'terminal_id', '') or ''
            # Derive washroom_id from device_id: T1-L1-PPM-002 -> T1-L1-PPM
            parts = device_id.split('-')
            if len(parts) >= 3:
                washroom_id = '-'.join(parts[:3])
            else:
                washroom_id = device_id

            rows.append((
                now,                        # time
                device_id,                  # device_id
                terminal,                   # terminal
                washroom_id,                # washroom_id
                getattr(telem, 'ammonia_ppm', 0.0),       # avg_nh3_ppm
                getattr(telem, 'peak_nh3_ppm', 0.0),      # peak_nh3_ppm
                getattr(telem, 'temperature_celsius', 0.0), # avg_temperature_c
                getattr(telem, 'humidity_pct', 0.0),       # avg_humidity_percent
                int(getattr(telem, 'throughput', 0)),       # throughput
                int(getattr(telem, 'occupancy_count', 0)),  # occupancy_inside
                None,                                        # abandon_rate_percent
                getattr(telem, 'whi_score', 0.0),           # raw_whi
            ))

        if not rows:
            return

        try:
            async with self.pool.acquire() as conn:
                # Use COPY protocol for high-throughput bulk insert (5-10x faster than executemany)
                await conn.copy_records_to_table(
                    'washroom_telemetry',
                    records=rows,
                    columns=[
                        'time', 'device_id', 'terminal', 'washroom_id',
                        'avg_nh3_ppm', 'peak_nh3_ppm', 'avg_temperature_c',
                        'avg_humidity_percent', 'throughput', 'occupancy_inside',
                        'abandon_rate_percent', 'raw_whi'
                    ]
                )
            logger.debug(f"TelemetryBridge: Synced {len(rows)} records via COPY")
        except Exception as e:
            logger.error(f"TelemetryBridge: COPY insert failed, falling back to executemany: {e}")
            # Fallback to executemany if COPY fails
            try:
                async with self.pool.acquire() as conn:
                    await conn.executemany(
                        """
                        INSERT INTO washroom_telemetry
                            (time, device_id, terminal, washroom_id,
                             avg_nh3_ppm, peak_nh3_ppm, avg_temperature_c,
                             avg_humidity_percent, throughput, occupancy_inside,
                             abandon_rate_percent, raw_whi)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                        """,
                        rows
                    )
                logger.debug(f"TelemetryBridge: Fallback synced {len(rows)} records via executemany")
            except Exception as e2:
                logger.error(f"TelemetryBridge: Both COPY and executemany failed: {e2}")

    async def sync_incidents(self, incidents: list):
        """Sync active incidents to WMS Backend incident_events table."""
        if not self.pool or not incidents:
            return

        rows = []
        now = datetime.now(timezone.utc)
        for inc in incidents:
            washroom_id = inc.get('device_id', '')
            terminal = inc.get('terminal_id', '')
            whi = inc.get('whi_score', 0.0)
            rows.append((
                now, washroom_id, terminal,
                'NORMAL', 'ACTIVE_INCIDENT', whi
            ))

        if rows:
            try:
                async with self.pool.acquire() as conn:
                    await conn.copy_records_to_table(
                        'incident_events',
                        records=rows,
                        columns=['time', 'washroom_id', 'terminal', 'old_state', 'new_state', 'whi']
                    )
                logger.debug(f"TelemetryBridge: Synced {len(rows)} incident events via COPY")
            except Exception as e:
                logger.error(f"TelemetryBridge: Incident COPY failed: {e}")


# Singleton instance
telemetry_bridge = TelemetryBridge()
