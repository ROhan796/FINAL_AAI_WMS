import unittest
import asyncio
import asyncpg
import os
from datetime import datetime, timezone
from app.core.config import settings

def get_test_secret(name: str) -> str:
    paths = [
        f"secrets/{name}.txt",
        f"../secrets/{name}.txt",
        f"/run/secrets/{name}"
    ]
    for p in paths:
        if os.path.exists(p):
            with open(p, "r") as f:
                return f.read().strip()
    return "default_password"

class TestDatabaseHardening(unittest.TestCase):
    def setUp(self):
        # Configure secrets paths for local execution
        os.environ["POSTGRES_PASSWORD_FILE"] = os.path.abspath("secrets/postgres_password.txt")
        os.environ["AAI_APP_WORKER_PASSWORD_FILE"] = os.path.abspath("secrets/aai_app_worker_password.txt")

        # Setup superuser connection URL (postgres)
        pg_pass = get_test_secret("postgres_password")
        self.superuser_url = f"postgresql://postgres:{pg_pass}@127.0.0.1:5433/washroom_db"
        self.ssl_opt = "require"
        
        # Setup worker connection URL (aai_app_worker)
        worker_pass = get_test_secret("aai_app_worker_password")
        self.worker_url = f"postgresql://aai_app_worker:{worker_pass}@127.0.0.1:5433/washroom_db"

        # Self-healing database state: ensure triggers are enabled on setup
        async def reset_triggers():
            conn = await asyncpg.connect(dsn=self.superuser_url, ssl=self.ssl_opt)
            try:
                await conn.execute("ALTER TABLE incident_events ENABLE TRIGGER ALL")
                await conn.execute("ALTER TABLE raw_telemetry_audit ENABLE TRIGGER ALL")
                await conn.execute("ALTER TABLE floor_escalation_events ENABLE TRIGGER ALL")
            finally:
                await conn.close()
        
        self.run_async(reset_triggers())

    def run_async(self, coro):
        return asyncio.run(coro)

    def test_immutable_triggers_prevent_update_delete(self):
        """
        Verify that updates and deletes raise exceptions on historical logs
        due to the freeze_historical_logs trigger.
        """
        async def run_test():
            # 1. Connect as superuser to verify triggers are enforced on all roles
            conn = await asyncpg.connect(dsn=self.superuser_url, ssl=self.ssl_opt)
            try:
                test_time = datetime.now(timezone.utc)
                
                # Insert a test incident event
                await conn.execute(
                    """
                    INSERT INTO incident_events (time, washroom_id, terminal, old_state, new_state, whi)
                    VALUES ($1, $2, $3, $4, $5, $6)
                    """,
                    test_time, "L2_TestRoom", "T1", "NORMAL", "ACTIVE_INCIDENT", 15.0
                )
                
                # Attempt to UPDATE and expect exception
                with self.assertRaises(asyncpg.exceptions.RaiseError) as ctx_update:
                    await conn.execute(
                        "UPDATE incident_events SET old_state = 'PENDING_ALERT' WHERE washroom_id = 'L2_TestRoom'"
                    )
                self.assertIn("Security Policy Violation: Historical incident audit vectors cannot be altered or removed.", str(ctx_update.exception))
                
                # Attempt to DELETE and expect exception
                with self.assertRaises(asyncpg.exceptions.RaiseError) as ctx_delete:
                    await conn.execute(
                        "DELETE FROM incident_events WHERE washroom_id = 'L2_TestRoom'"
                    )
                self.assertIn("Security Policy Violation: Historical incident audit vectors cannot be altered or removed.", str(ctx_delete.exception))
                
            finally:
                # Cleanup the test row using superuser by disabling and re-enabling triggers
                # Only superuser can do this, confirming why privilege separation is needed
                await conn.execute("ALTER TABLE incident_events DISABLE TRIGGER ALL")
                await conn.execute("DELETE FROM incident_events WHERE washroom_id = 'L2_TestRoom'")
                await conn.execute("ALTER TABLE incident_events ENABLE TRIGGER ALL")
                await conn.close()

        self.run_async(run_test())

    def test_timescaledb_chunk_operations_respect_triggers(self):
        """
        Verify that even direct updates and deletes on individual chunk tables
        respect the trigger enforcement (addressing older TimescaleDB bypass edge cases).
        """
        async def run_test():
            conn = await asyncpg.connect(dsn=self.superuser_url, ssl=self.ssl_opt)
            try:
                test_time = datetime.now(timezone.utc)
                
                # Insert a test audit event
                await conn.execute(
                    """
                    INSERT INTO raw_telemetry_audit (received_at, topic, raw_payload)
                    VALUES ($1, $2, $3)
                    """,
                    test_time, "test/topic", "{}"
                )
                
                # Fetch chunk names associated with the hypertable
                chunks = await conn.fetch("SELECT show_chunks('raw_telemetry_audit')")
                if not chunks:
                    # If TimescaleDB hasn't created a chunk because time intervals are wide, skip chunk direct test
                    # but typically chunk is created immediately upon insertion
                    return
                
                chunk_table = chunks[0][0] # e.g. '_timescaledb_internal._hyper_4_1_chunk'
                
                # Attempt direct UPDATE on the chunk table
                with self.assertRaises(asyncpg.exceptions.RaiseError) as ctx_chunk_update:
                    await conn.execute(
                        f"UPDATE {chunk_table} SET topic = 'hacked/topic' WHERE topic = 'test/topic'"
                    )
                self.assertIn("Security Policy Violation: Historical incident audit vectors cannot be altered or removed.", str(ctx_chunk_update.exception))

                # Attempt direct DELETE on the chunk table
                with self.assertRaises(asyncpg.exceptions.RaiseError) as ctx_chunk_delete:
                    await conn.execute(
                        f"DELETE FROM {chunk_table} WHERE topic = 'test/topic'"
                    )
                self.assertIn("Security Policy Violation: Historical incident audit vectors cannot be altered or removed.", str(ctx_chunk_delete.exception))

            finally:
                # Cleanup using superuser
                await conn.execute("ALTER TABLE raw_telemetry_audit DISABLE TRIGGER ALL")
                await conn.execute("DELETE FROM raw_telemetry_audit WHERE topic = 'test/topic'")
                await conn.execute("ALTER TABLE raw_telemetry_audit ENABLE TRIGGER ALL")
                await conn.close()

        self.run_async(run_test())

    def test_worker_role_privilege_isolation(self):
        """
        Verify that the restricted aai_app_worker role cannot disable triggers,
        cannot delete or update rows, and cannot execute alter table/schema operations.
        """
        async def run_test():
            # Connect as worker
            conn = await asyncpg.connect(dsn=self.worker_url, ssl=self.ssl_opt)
            try:
                # Attempt to disable triggers - expect permission denied
                with self.assertRaises(asyncpg.exceptions.InsufficientPrivilegeError) as ctx_disable:
                    await conn.execute("ALTER TABLE incident_events DISABLE TRIGGER ALL")
                self.assertIn("must be owner of table", str(ctx_disable.exception))
                
                # Attempt to ALTER table schema - expect permission denied
                with self.assertRaises(asyncpg.exceptions.InsufficientPrivilegeError) as ctx_alter:
                    await conn.execute("ALTER TABLE incident_events ADD COLUMN hack_col TEXT")
                self.assertIn("must be owner of table", str(ctx_alter.exception))

                # Attempt to DROP table - expect permission denied
                with self.assertRaises(asyncpg.exceptions.InsufficientPrivilegeError) as ctx_drop:
                    await conn.execute("DROP TABLE incident_events")
                self.assertIn("must be owner of table", str(ctx_drop.exception))

            finally:
                await conn.close()

        self.run_async(run_test())

if __name__ == "__main__":
    unittest.main()
