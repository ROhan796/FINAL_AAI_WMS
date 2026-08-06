import unittest
import asyncio
import os
import jwt
import httpx
from datetime import datetime, timezone
from app.main import app
from app.core.config import settings
from app.db.redis import get_redis
from app.db.postgres import db_manager

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

class TestABACConstraints(unittest.TestCase):
    def setUp(self):
        # Read standard seeded credentials
        self.operator_password = get_test_secret("operator_password")
        self.supervisor_password = get_test_secret("supervisor_password")
        
        # Point the app's get_secret to local secrets folder
        os.environ["OPERATOR_PASSWORD_FILE"] = os.path.abspath("secrets/operator_password.txt")
        os.environ["SUPERVISOR_PASSWORD_FILE"] = os.path.abspath("secrets/supervisor_password.txt")
        os.environ["POSTGRES_PASSWORD_FILE"] = os.path.abspath("secrets/postgres_password.txt")

    def run_async(self, coro):
        return asyncio.run(coro)

    async def run_test_with_fresh_connections(self, test_coro):
        """
        Setup test DB pools, seed the schema and users, run the test, and clean up.
        """
        if db_manager.pool:
            await db_manager.disconnect()
        await db_manager.connect()
        
        from app.db.redis import redis_manager
        from redis.asyncio import Redis, ConnectionPool
        try:
            await redis_manager.close()
        except Exception:
            pass
        redis_manager.pool = ConnectionPool.from_url(settings.redis_connection_url, decode_responses=True)
        redis_manager.client = Redis(connection_pool=redis_manager.pool)
        
        from app.main import seed_users
        await seed_users()
        
        try:
            await test_coro()
        finally:
            await db_manager.disconnect()
            try:
                await redis_manager.close()
            except Exception:
                pass

    def test_dashboard_filtering_by_zone(self):
        """
        Verify that dashboard/status filters floors based on the operator's zone.
        """
        async def run_test():
            # Seed multiple floors in different zones in Redis
            redis = await get_redis()
            await redis.set("state:floor:T1:L2:status", "NORMAL")
            await redis.set("state:floor:T2:L3:status", "NORMAL")
            
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                # 1. Log in as operator (zone=T1)
                op_login = await client.post("/auth/login", json={
                    "username": "operator",
                    "password": self.operator_password
                })
                op_token = op_login.json()["access_token"]
                
                # Check status: should only see T1 floor
                resp = await client.get("/dashboard/status", headers={"Authorization": f"Bearer {op_token}"})
                self.assertEqual(resp.status_code, 200)
                data = resp.json()
                floors = data["floors"]
                self.assertTrue(len(floors) >= 1)
                for floor in floors:
                    self.assertEqual(floor["terminal"], "T1")
                    
                # 2. Log in as supervisor_t2 (zone=T2)
                t2_login = await client.post("/auth/login", json={
                    "username": "supervisor_t2",
                    "password": self.supervisor_password
                })
                t2_token = t2_login.json()["access_token"]
                
                # Check status: should only see T2 floor
                resp = await client.get("/dashboard/status", headers={"Authorization": f"Bearer {t2_token}"})
                self.assertEqual(resp.status_code, 200)
                data = resp.json()
                floors = data["floors"]
                self.assertTrue(len(floors) >= 1)
                for floor in floors:
                    self.assertEqual(floor["terminal"], "T2")

                # 3. Log in as supervisor_global (zone=NULL)
                global_login = await client.post("/auth/login", json={
                    "username": "supervisor_global",
                    "password": self.supervisor_password
                })
                global_token = global_login.json()["access_token"]
                
                # Check status: should see both T1 and T2 floors
                resp = await client.get("/dashboard/status", headers={"Authorization": f"Bearer {global_token}"})
                self.assertEqual(resp.status_code, 200)
                data = resp.json()
                floors = data["floors"]
                terminals = [f["terminal"] for f in floors]
                self.assertIn("T1", terminals)
                self.assertIn("T2", terminals)

        self.run_async(self.run_test_with_fresh_connections(run_test))

    def test_zone_constrained_incident_operations(self):
        """
        Verify that supervisor can only acknowledge/resolve same-zone incidents.
        """
        async def run_test():
            redis = await get_redis()
            # Set up washrooms and active incident states
            await redis.set("state:washroom:L2_WashroomA", "ACTIVE_INCIDENT")  # mapped to T1
            await redis.set("state:washroom:L2_WashroomT2", "ACTIVE_INCIDENT") # mapped to T2
            
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                # Log in as supervisor (zone=T1)
                login = await client.post("/auth/login", json={
                    "username": "supervisor",
                    "password": self.supervisor_password
                })
                token = login.json()["access_token"]
                headers = {"Authorization": f"Bearer {token}"}
                
                # 1. Acknowledge T1 washroom - should succeed
                resp = await client.post("/incidents/L2_WashroomA/acknowledge", headers=headers)
                self.assertEqual(resp.status_code, 200)
                
                # 2. Acknowledge T2 washroom - should be blocked (403 Forbidden)
                resp = await client.post("/incidents/L2_WashroomT2/acknowledge", headers=headers)
                self.assertEqual(resp.status_code, 403)
                self.assertIn("Operation not permitted", resp.json()["detail"])
                
                # 3. Non-existent washroom in config map - should fail closed with 404
                resp = await client.post("/incidents/UnknownWashroom/acknowledge", headers=headers)
                self.assertEqual(resp.status_code, 404)

        self.run_async(self.run_test_with_fresh_connections(run_test))

    def test_overnight_shift_active_and_inactive_time_ranges(self):
        """
        Test the overnight shift boundaries (22:00:00 to 06:00:00) using X-Mock-Time.
        """
        async def run_test():
            # Force environment to testing to allow time mocking
            settings.APP_ENV = "testing"
            
            redis = await get_redis()
            await redis.set("state:washroom:L2_WashroomA", "ACTIVE_INCIDENT")
            
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                # Log in as supervisor_overnight
                login = await client.post("/auth/login", json={
                    "username": "supervisor_overnight",
                    "password": self.supervisor_password
                })
                token = login.json()["access_token"]
                
                # 1. Test active shift hours (e.g. 23:00:00 and 02:00:00)
                for active_time in ("23:00:00", "02:00:00"):
                    headers = {
                        "Authorization": f"Bearer {token}",
                        "X-Mock-Time": active_time
                    }
                    resp = await client.post("/incidents/L2_WashroomA/acknowledge", headers=headers)
                    self.assertEqual(resp.status_code, 200, f"Failed shift check at {active_time}")
                    # Re-seed state since it remains acknowledged
                    await redis.set("state:washroom:L2_WashroomA", "ACTIVE_INCIDENT")

                # 2. Test inactive shift hours (e.g. 12:00:00)
                headers = {
                    "Authorization": f"Bearer {token}",
                    "X-Mock-Time": "12:00:00"
                }
                resp = await client.post("/incidents/L2_WashroomA/acknowledge", headers=headers)
                self.assertEqual(resp.status_code, 403, "Shift validation failed to block inactive shift operator")
                self.assertIn("shift is currently inactive", resp.json()["detail"])

        self.run_async(self.run_test_with_fresh_connections(run_test))

    def test_production_gating_ignores_mock_header(self):
        """
        Verify that X-Mock-Time is ignored in production environment (defaults to actual time).
        """
        async def run_test():
            # Set to production
            settings.APP_ENV = "production"
            
            redis = await get_redis()
            await redis.set("state:washroom:L2_WashroomA", "ACTIVE_INCIDENT")
            
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                # supervisor_overnight is only active 22:00-06:00.
                # If we mock time to 23:00:00 but settings.APP_ENV = "production",
                # it will check the actual system time (which is likely daytime, e.g. 13:28:48), and return 403.
                login = await client.post("/auth/login", json={
                    "username": "supervisor_overnight",
                    "password": self.supervisor_password
                })
                token = login.json()["access_token"]
                
                headers = {
                    "Authorization": f"Bearer {token}",
                    "X-Mock-Time": "23:00:00" # Should be ignored!
                }
                resp = await client.post("/incidents/L2_WashroomA/acknowledge", headers=headers)
                # Should get 403 because it ignores mock time and evaluates current time
                self.assertEqual(resp.status_code, 403)

        self.run_async(self.run_test_with_fresh_connections(run_test))

    def test_inactive_shift_dashboard_bypass(self):
        """
        Verify that an inactive-shift supervisor is blocked on writing (acknowledge)
        but bypassed on reading (dashboard status).
        """
        async def run_test():
            settings.APP_ENV = "testing"
            
            redis = await get_redis()
            await redis.set("state:washroom:L2_WashroomA", "ACTIVE_INCIDENT")
            await redis.set("state:floor:T1:L2:status", "NORMAL")
            
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                # Log in as supervisor_inactive (shift is 00:00:00 to 00:01:00)
                login = await client.post("/auth/login", json={
                    "username": "supervisor_inactive",
                    "password": self.supervisor_password
                })
                token = login.json()["access_token"]
                
                # Mock time to 12:00:00 (definitely inactive shift)
                headers = {
                    "Authorization": f"Bearer {token}",
                    "X-Mock-Time": "12:00:00"
                }
                
                # 1. Verify GET /dashboard/status is ALLOWED
                resp = await client.get("/dashboard/status", headers=headers)
                self.assertEqual(resp.status_code, 200)
                
                # 2. Verify POST /acknowledge is BLOCKED
                resp = await client.post("/incidents/L2_WashroomA/acknowledge", headers=headers)
                self.assertEqual(resp.status_code, 403)

        self.run_async(self.run_test_with_fresh_connections(run_test))

    def test_jwt_key_rotation_acceptance_and_rejection(self):
        """
        Verify validation overlap window: accepts current, accepts previous, rejects older keys.
        """
        async def run_test():
            current_secret = "active_jwt_secret_key_12345678901234567"
            previous_secret = "previous_jwt_secret_key_abcdefghijklmnop"
            older_secret = "older_jwt_secret_key_xyz9876543210987654"
            # Mock jwt_secret_previous property by overriding it
            type(settings).jwt_secret = property(lambda self: current_secret)
            type(settings).jwt_secret_previous = property(lambda self: previous_secret)
            
            # Generate test tokens using different keys
            current_token = jwt.encode({"sub": "supervisor", "role": "supervisor", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}, current_secret, algorithm="HS256")
            previous_token = jwt.encode({"sub": "supervisor", "role": "supervisor", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}, previous_secret, algorithm="HS256")
            older_token = jwt.encode({"sub": "supervisor", "role": "supervisor", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}, older_secret, algorithm="HS256")
            
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                # 1. Current token - should succeed
                resp = await client.get("/dashboard/status", headers={"Authorization": f"Bearer {current_token}"})
                self.assertEqual(resp.status_code, 200)
                
                # 2. Previous token - should succeed (overlap window)
                resp = await client.get("/dashboard/status", headers={"Authorization": f"Bearer {previous_token}"})
                self.assertEqual(resp.status_code, 200)
                
                # 3. Older token - should fail (401 Unauthorized)
                resp = await client.get("/dashboard/status", headers={"Authorization": f"Bearer {older_token}"})
                self.assertEqual(resp.status_code, 401)

        from datetime import timedelta
        self.run_async(self.run_test_with_fresh_connections(run_test))

    def test_operator_self_zone_modification_block(self):
        """
        Verify that operators and supervisors cannot modify user attributes (returns 403).
        Only admin can perform attribute modifications.
        """
        async def run_test():
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                # 1. Log in as operator
                op_login = await client.post("/auth/login", json={
                    "username": "operator",
                    "password": self.operator_password
                })
                op_token = op_login.json()["access_token"]
                
                # Try to modify self attributes - should be blocked
                resp = await client.put(
                    "/admin/users/operator/attributes",
                    json={"zone": "T2"},
                    headers={"Authorization": f"Bearer {op_token}"}
                )
                self.assertEqual(resp.status_code, 403)
                
                # 2. Log in as admin
                admin_login = await client.post("/auth/login", json={
                    "username": "admin",
                    "password": self.supervisor_password
                })
                admin_token = admin_login.json()["access_token"]
                
                # Try to modify operator zone - should succeed
                resp = await client.put(
                    "/admin/users/operator/attributes",
                    json={"zone": "T2"},
                    headers={"Authorization": f"Bearer {admin_token}"}
                )
                self.assertEqual(resp.status_code, 200)
                
                # Check DB value has indeed changed to T2
                row = await db_manager.fetchrow("SELECT zone FROM users WHERE username = 'operator'")
                self.assertEqual(row["zone"], "T2")

        self.run_async(self.run_test_with_fresh_connections(run_test))

    def test_alerts_dispatch_shift_and_zone_constrained(self):
        """
        Verify POST /alerts/dispatch checks active shift and target zone.
        """
        async def run_test():
            settings.APP_ENV = "testing"
            
            async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
                # 1. Log in as supervisor_overnight (T1 zone, shift is 22:00-06:00)
                login = await client.post("/auth/login", json={
                    "username": "supervisor_overnight",
                    "password": self.supervisor_password
                })
                token = login.json()["access_token"]
                
                # Mock active shift hours, target T1 washroom - should succeed
                headers = {"Authorization": f"Bearer {token}", "X-Mock-Time": "23:00:00"}
                resp = await client.post(
                    "/alerts/dispatch",
                    json={"washroom_id": "L2_WashroomA", "message": "Manual trigger critical"},
                    headers=headers
                )
                self.assertEqual(resp.status_code, 200)
                
                # Mock active shift hours, target T2 washroom - should fail cross-zone (403)
                resp = await client.post(
                    "/alerts/dispatch",
                    json={"washroom_id": "L2_WashroomT2", "message": "Manual trigger critical"},
                    headers=headers
                )
                self.assertEqual(resp.status_code, 403)
                
                # Mock inactive shift hours, target T1 washroom - should fail inactive shift (403)
                headers["X-Mock-Time"] = "12:00:00"
                resp = await client.post(
                    "/alerts/dispatch",
                    json={"washroom_id": "L2_WashroomA", "message": "Manual trigger critical"},
                    headers=headers
                )
                self.assertEqual(resp.status_code, 403)

        self.run_async(self.run_test_with_fresh_connections(run_test))

if __name__ == "__main__":
    unittest.main()
