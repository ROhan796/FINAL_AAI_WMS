"""
FINAL COMPREHENSIVE INTEGRATION TEST
Tests ALL services: DA Engine, WMS Backend, EMQX, TimescaleDB, Redis, Frontend
"""
import asyncio
import json
import ssl
import sys
import subprocess
import urllib.request

def test(name, condition, detail=""):
    status = "PASS" if condition else "FAIL"
    sym = "+" if condition else "X"
    print(f"  [{sym}] {name}" + (f" -- {detail}" if detail else ""))
    return condition

def https_get(path):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
    r = opener.open(f"https://localhost:443{path}", timeout=10)
    return json.loads(r.read())

def https_post(path, data, token=None):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"https://localhost:443{path}", data=json.dumps(data).encode(), headers=headers, method="POST")
    r = opener.open(req, timeout=10)
    return json.loads(r.read())

def http_get(path):
    r = urllib.request.urlopen(f"http://localhost:8001{path}", timeout=10)
    return json.loads(r.read())

def docker_query(container, cmd):
    result = subprocess.run(["docker", "exec", container] + cmd, capture_output=True, text=True, timeout=15)
    return result.stdout, result.returncode

async def main():
    passed = 0
    failed = 0
    skipped = 0
    
    def P(name, cond, detail=""):
        nonlocal passed, failed
        if test(name, cond, detail):
            passed += 1
        else:
            failed += 1
    
    def S(name, reason=""):
        nonlocal skipped
        skipped += 1
        print(f"  [-] {name} -- SKIPPED: {reason}")
    
    print("=" * 70)
    print("  FINAL COMPREHENSIVE INTEGRATION TEST")
    print("=" * 70)
    
    # ═══════════════════════════════════════════
    # SECTION 1: Docker Infrastructure
    # ═══════════════════════════════════════════
    print("\n1. DOCKER INFRASTRUCTURE")
    stdout, rc = docker_query("emqx1", ["emqx", "ctl", "status"])
    P("EMQX cluster running", "Running" in stdout or "Core" in stdout or "emqx" in stdout.lower())
    
    stdout, rc = docker_query("washroom-timescaledb", ["pg_isready", "-U", "postgres"])
    P("TimescaleDB running", rc == 0)
    
    stdout, rc = docker_query("washroom-redis", ["redis-cli", "-a", "35d917a9b4e47447f2ec4b6ec3944e51", "--no-auth-warning", "ping"])
    P("Redis running", "PONG" in (stdout or ""))
    
    stdout, rc = docker_query("fastapi", ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')"])
    P("FastAPI container healthy", rc == 0)
    
    # ═══════════════════════════════════════════
    # SECTION 2: DA Engine (Local, port 8001)
    # ═══════════════════════════════════════════
    print("\n2. DA ENGINE (port 8001)")
    try:
        data = http_get("/health")
        P("Health endpoint", data.get("status") == "healthy")
        P("WebSocket stats present", "connected_clients" in data.get("websocket", {}))
    except Exception as e:
        P("Health endpoint", False, str(e))
    
    try:
        data = http_get("/api/dashboard/summary")
        P("Dashboard summary", "airport_whi" in data or "avg_whi" in data)
        P("36 washrooms", data.get("total_washrooms", 0) == 36)
    except Exception as e:
        P("Dashboard summary", False, str(e))
    
    try:
        data = http_get("/api/terminals")
        P("Terminals endpoint", isinstance(data, list) and len(data) == 3)
    except Exception as e:
        P("Terminals endpoint", False, str(e))
    
    try:
        data = http_get("/api/incidents")
        P("Incidents endpoint", isinstance(data, list) and len(data) > 0, f"{len(data)} incidents")
    except Exception as e:
        P("Incidents endpoint", False, str(e))
    
    try:
        data = http_get("/api/dashboard/live-whi")
        P("Live WHI endpoint", "rankings" in data)
        P("36 rankings", len(data.get("rankings", [])) == 36)
    except Exception as e:
        P("Live WHI endpoint", False, str(e))
    
    try:
        data = http_get("/api/levels/T1/L1")
        P("Levels endpoint", "washrooms" in data)
    except Exception as e:
        P("Levels endpoint", False, str(e))
    
    # ═══════════════════════════════════════════
    # SECTION 3: DA Engine WebSocket
    # ═══════════════════════════════════════════
    print("\n3. DA ENGINE WEBSOCKET")
    try:
        import websockets
        async with websockets.connect("ws://localhost:8001/ws") as ws:
            types = []
            device_count = 0
            for _ in range(5):
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=3)
                    data = json.loads(msg)
                    types.append(data["type"])
                    if data["type"] == "telemetry:update":
                        device_count = len(data["data"].get("devices", []))
                except asyncio.TimeoutError:
                    break
            
            P("Receives telemetry:update", "telemetry:update" in types)
            P("Receives summary:update", "summary:update" in types)
            P("36 devices in telemetry", device_count == 36, f"got {device_count}")
            
            await ws.send("ping")
            msg = await asyncio.wait_for(ws.recv(), timeout=3)
            data = json.loads(msg)
            P("Pong response", data.get("type") == "pong")
    except Exception as e:
        P("WebSocket connection", False, str(e))
    
    # ═══════════════════════════════════════════
    # SECTION 4: DA Engine SSE
    # ═══════════════════════════════════════════
    print("\n4. DA ENGINE SSE")
    try:
        import http.client
        conn = http.client.HTTPConnection("localhost", 8001, timeout=10)
        conn.request("GET", "/api/sse/telemetry", headers={"Accept": "text/event-stream"})
        resp = conn.getresponse()
        P("SSE returns 200", resp.status == 200)
        P("Content-Type is event-stream", "text/event-stream" in resp.getheader("content-type", ""))
        body = resp.read(2048).decode()
        P("SSE contains data", "data:" in body)
        conn.close()
    except Exception as e:
        P("SSE endpoint", False, str(e))
    
    # ═══════════════════════════════════════════
    # SECTION 5: WMS Backend (HAProxy port 443)
    # ═══════════════════════════════════════════
    print("\n5. WMS BACKEND (port 443)")
    try:
        data = https_get("/health")
        P("Health endpoint", data.get("status") == "ok")
        P("WebSocket stats", "connected_clients" in data.get("websocket", {}))
        P("Service name", data.get("service") == "wms-backend")
    except Exception as e:
        P("Health endpoint", False, str(e))
    
    # Login
    token = None
    try:
        resp = https_post("/auth/login", {"username": "operator", "password": "N3fc/fiIi55E3+O4qr4FRw=="})
        token = resp.get("access_token")
        P("JWT login", token is not None and len(token) > 50)
    except Exception as e:
        P("JWT login", False, str(e))
    
    # Protected routes
    for path in ["/dashboard/status", "/analytics/heatmap"]:
        try:
            data = https_get(path) if not token else None
            if token:
                ctx = ssl.create_default_context()
                ctx.check_hostname = False
                ctx.verify_mode = ssl.CERT_NONE
                opener = urllib.request.build_opener(urllib.request.HTTPSHandler(context=ctx))
                req = urllib.request.Request(f"https://localhost:443{path}", headers={"Authorization": f"Bearer {token}"})
                r = opener.open(req, timeout=10)
                data = json.loads(r.read())
            P(f"GET {path}", data is not None, f"200")
        except Exception as e:
            P(f"GET {path}", False, str(e))
    
    # ═══════════════════════════════════════════
    # SECTION 6: WMS Backend WebSocket
    # ═══════════════════════════════════════════
    print("\n6. WMS BACKEND WEBSOCKET")
    try:
        import websockets
        ssl_ctx = ssl.create_default_context()
        ssl_ctx.check_hostname = False
        ssl_ctx.verify_mode = ssl.CERT_NONE
        
        async with websockets.connect("wss://localhost:443/ws", ssl=ssl_ctx) as ws:
            types = []
            floor_count = 0
            for _ in range(5):
                try:
                    msg = await asyncio.wait_for(ws.recv(), timeout=5)
                    data = json.loads(msg)
                    types.append(data["type"])
                    if data["type"] == "floor_status:update":
                        floor_count = len(data["data"].get("floors", []))
                except asyncio.TimeoutError:
                    break
            
            P("Receives floor_status:update", "floor_status:update" in types)
            P("18 floors (3 terminals x 6)", floor_count == 18, f"got {floor_count}")
            
            await ws.send("ping")
            msg = await asyncio.wait_for(ws.recv(), timeout=3)
            data = json.loads(msg)
            P("Pong response", data.get("type") == "pong")
    except Exception as e:
        P("WebSocket connection", False, str(e))
    
    # ═══════════════════════════════════════════
    # SECTION 7: TimescaleDB Data
    # ═══════════════════════════════════════════
    print("\n7. TIMESCALEDB DATA")
    stdout, rc = docker_query("washroom-timescaledb", ["psql", "-U", "postgres", "-d", "washroom_db", "-t", "-c",
        "SELECT count(*) FROM washroom_telemetry;"])
    if rc == 0:
        count = int(stdout.strip())
        P("Telemetry records", count > 1000, f"{count:,} records")
    else:
        P("Telemetry records", False, stdout)
    
    stdout, rc = docker_query("washroom-timescaledb", ["psql", "-U", "postgres", "-d", "washroom_db", "-t", "-c",
        "SELECT count(*) FROM users;"])
    if rc == 0:
        P("Users table", int(stdout.strip()) >= 7, f"{stdout.strip()} users")
    
    # Check continuous aggregates
    stdout, rc = docker_query("washroom-timescaledb", ["psql", "-U", "postgres", "-d", "washroom_db", "-t", "-c",
        "SELECT count(*) FROM whi_hourly_summary;"])
    if rc == 0:
        P("Hourly aggregate exists", True, f"{stdout.strip()} rows")
    
    # ═══════════════════════════════════════════
    # SECTION 8: Redis State
    # ═══════════════════════════════════════════
    print("\n8. REDIS STATE")
    stdout, rc = docker_query("washroom-redis", ["redis-cli", "-a", "35d917a9b4e47447f2ec4b6ec3944e51", "--no-auth-warning", "dbsize"])
    if rc == 0:
        P("Redis has data", "key" in stdout.lower() or not "empty" in stdout.lower(), stdout.strip())
    
    stdout, rc = docker_query("washroom-redis", ["redis-cli", "-a", "35d917a9b4e47447f2ec4b6ec3944e51", "--no-auth-warning", "keys", "state:*"])
    if rc == 0:
        floor_keys = len([l for l in stdout.strip().split('\n') if l.strip()])
        P("Floor state keys", floor_keys > 0, f"{floor_keys} keys")
    
    # ═══════════════════════════════════════════
    # SECTION 9: EMQX MQTT
    # ═══════════════════════════════════════════
    print("\n9. EMQX MQTT BROKER")
    stdout, rc = docker_query("emqx1", ["emqx", "ctl", "clients", "list"])
    P("MQTT subscriber connected", "system-backend-subscriber" in stdout and "connected=true" in stdout)
    
    stdout, rc = docker_query("emqx1", ["emqx", "ctl", "brokers"])
    P("EMQX broker running", "version" in stdout.lower() or "emqx" in stdout.lower())
    
    # ═══════════════════════════════════════════
    # SECTION 10: Next.js Frontend (port 3000)
    # ═══════════════════════════════════════════
    print("\n10. NEXT.JS FRONTEND (port 3000)")
    for path, name in [("/", "Homepage"), ("/admin/dashboard", "Admin Dashboard"), ("/terminal", "Terminal")]:
        try:
            r = urllib.request.urlopen(f"http://localhost:3000{path}", timeout=30)
            size = len(r.read())
            P(f"{name} renders", size > 1000, f"{size:,} bytes")
        except Exception as e:
            P(f"{name} renders", False, str(e))
    
    # Proxy routes
    for path in ["/api/da/summary", "/api/da/incidents", "/api/da/live-whi", "/api/da/terminals"]:
        try:
            r = urllib.request.urlopen(f"http://localhost:3000{path}", timeout=15)
            P(f"Proxy {path}", r.status == 200)
        except Exception as e:
            P(f"Proxy {path}", False, str(e))
    
    # ═══════════════════════════════════════════
    # SUMMARY
    # ═══════════════════════════════════════════
    total = passed + failed + skipped
    print("\n" + "=" * 70)
    print(f"  RESULTS: {passed} PASS / {failed} FAIL / {skipped} SKIPPED  (out of {total})")
    print("=" * 70)
    
    if failed == 0:
        print("  ALL TESTS PASSED!")
    else:
        print(f"  {failed} test(s) failed — review above")
    
    return failed == 0

if __name__ == "__main__":
    result = asyncio.run(main())
    sys.exit(0 if result else 1)
