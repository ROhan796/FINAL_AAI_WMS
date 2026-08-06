# Cloud Implementation Plan: Code Changes for Cloud Deployment

## Table of Contents

1. [Overview](#1-overview)
2. [Deployment Targets](#2-deployment-targets)
3. [Oracle Cloud Free Tier VM Setup](#3-oracle-cloud-free-tier-vm-setup)
4. [WMS Backend Code Changes](#4-wms-backend-code-changes)
5. [DA Engine Code Changes](#5-da-engine-code-changes)
6. [Portal Code Changes](#6-portal-code-changes)
7. [Environment Variables Setup](#7-environment-variables-setup)
8. [Dockerfile Updates](#8-dockerfile-updates)
9. [WebSocket Strategy for Vercel](#9-websocket-strategy-for-vercel)
10. [Deployment Steps](#10-deployment-steps)
11. [Testing Checklist](#11-testing-checklist)

---

## 1. Overview

### Problem
The codebase currently runs entirely in local Docker with internal networking (Docker container names like `emqx1`, `washroom-redis`, `washroom-timescaledb`). Moving to cloud requires:

- Replacing Docker internal hostnames with cloud endpoints
- Making secrets configurable via environment variables (no Docker secrets)
- Configuring CORS for production domains
- Handling WebSocket connections through Vercel's serverless model
- Ensuring SSL/TLS works with cloud services

### Solution Summary

| Service | Change Type | Key Changes |
|---------|-------------|-------------|
| WMS Backend | Config updates | Remove Docker secrets, update MQTT/CORS, add SSL support |
| DA Engine | Config updates | Add SSL to PostgreSQL, update CORS, env var adjustments |
| Portal | Config + architecture | Update WebSocket URLs, remove custom server for Vercel, update env vars |

---

## 2. Deployment Targets

| Service | Platform | URL Pattern | Cost |
|---------|----------|-------------|------|
| HAProxy + Keepalived | Oracle Cloud Free Tier VM | `YOUR_VM_IP:8883`, `YOUR_VM_IP:443` | **$0 forever** |
| WMS Backend | Render | `https://your-wms-backend.onrender.com` | $0 (free tier) |
| DA Engine | Render | `https://your-da-engine.onrender.com` | $0 (free tier) |
| Next.js Portal | Vercel | `https://your-app.vercel.app` | $0 (free tier) |
| PostgreSQL | NeonDB | `ep-nameless-brook-ah66rf6f-pooler...` | $0 (free tier) |
| Redis | Upstash | `ready-monkey-212683.upstash.io` | $0 (free tier) |
| MQTT | EMQX Cloud | `ke1040ef.ala.us-east-1.emqxsl.com` | Already configured |

**Total Monthly Cost: $0** (Everything is free tier or already configured)

---

## 3. Oracle Cloud Free Tier VM Setup

Oracle Cloud offers **Always Free** resources that never expire:
- 4 ARM OCPUs (24 GHz total) + 24GB RAM
- 200GB block storage
- 10GB object storage
- 2 AMD instances (1/8 OPU each, 1GB RAM)

This is perfect for running HAProxy + Keepalived Docker containers.

### Step 3.1: Create Oracle Cloud Account

1. Go to https://cloud.oracle.com
2. Click "Start for Free"
3. Sign up with your email
4. Verify email and complete registration
5. **Important:** Select "Always Free" tier when creating the VM

### Step 3.2: Create the VM Instance

1. Log into Oracle Cloud Console
2. Click hamburger menu → Compute → Instances
3. Click "Create Instance"
4. Configure:
   - **Name:** `aai-haproxy`
   - **Image:** Ubuntu 22.04 (or Oracle Linux 8)
   - **Shape:** Select "VM.Standard.A1.Flex" (ARM-based, always free)
     - OCPUs: 4
     - RAM: 24 GB
   - **Virtual Cloud Network:** Create new VCN
     - Click "Create Virtual Cloud Network"
     - Name: `aai-vcn`
     - Use "Create VCN with Internet Connectivity"
     - Click "Create"
   - **Public IP address:** Select "Assign a public IP address"
   - **SSH Keys:** Upload your SSH public key or generate a new one
5. Click "Create"
6. **Note down the public IP address** (e.g., `129.146.xx.xx`)

### Step 3.3: Initial VM Setup

```bash
# SSH into the VM
ssh -i ~/.ssh/your-key ubuntu@YOUR_VM_IP

# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sudo sh

# Add user to docker group (avoid using sudo for docker commands)
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin -y

# Verify Docker installation
docker --version
docker compose version

# Log out and log back in for group changes to take effect
exit
```

### Step 3.4: Deploy HAProxy Stack on Oracle VM

```bash
# SSH into the VM
ssh -i ~/.ssh/your-key ubuntu@YOUR_VM_IP

# Create project directory
mkdir -p /opt/aai-haproxy
cd /opt/aai-haproxy

# Clone the repository (or copy files manually)
git clone https://github.com/your-repo/Fullstack_Unification.git .

# Navigate to HAProxy directory
cd aai-wms-backend

# Use cloud docker-compose
cp docker-compose.cloud.yml docker-compose.yml

# Create HAProxy config directory
mkdir -p haproxy

# Create certificate directory
mkdir -p certs/haproxy

# Start services
docker compose up -d

# Verify services are running
docker compose ps
docker compose logs -f
```

### Step 3.5: Open Firewall Ports

Oracle Cloud uses Security Lists (firewall rules):

1. Go to Oracle Cloud Console → Networking → Virtual Cloud Networks
2. Click on `aai-vcn`
3. Click on the public subnet
4. Under "Security Lists", click the default security list
5. Click "Add Ingress Rules"
6. Add these rules:

| Port | Protocol | Source | Description |
|------|----------|--------|-------------|
| 22 | TCP | Your IP/32 | SSH access |
| 8883 | TCP | 0.0.0.0/0 | MQTT over SSL |
| 443 | TCP | 0.0.0.0/0 | FastAPI HTTPS |
| 18083 | TCP | Your IP/32 | EMQX Dashboard (restrict to your IP) |

### Step 3.6: Set Up Automatic Updates

```bash
# Install unattended-upgrades for security patches
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades
```

### Step 3.7: Set Up Docker Auto-Restart

```bash
# Create systemd service for Docker Compose
sudo tee /etc/systemd/system/aai-haproxy.service << 'EOF'
[Unit]
Description=AAI HAProxy Docker Stack
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/aai-haproxy/aai-wms-backend
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

# Enable the service
sudo systemctl enable aai-haproxy.service

# Start the service
sudo systemctl start aai-haproxy.service
```

---

## 4. WMS Backend Code Changes

### 4.1: `app/core/config.py` — Remove Docker Secrets Dependency

**Current Problem:** The `get_secret()` function tries to read from files first (`_FILE` env var, then `/run/secrets/`). On Render, neither exists. It should fall back to direct env vars.

**File:** `aai-wms-backend/app/core/config.py`

**Change:** Modify `get_secret()` to prioritize direct environment variables when not in Docker:

```python
def get_secret(name: str, default: str | None = None) -> str | None:
    """
    3-tier secret resolution:
    1. {NAME}_FILE env var → read file contents
    2. /run/secrets/{name} (Docker secrets)
    3. Direct {NAME} env var
    4. Default value
    """
    import os

    # Tier 1: _FILE env var (Docker secrets pattern)
    file_env = os.getenv(f"{name.upper()}_FILE")
    if file_env and os.path.isfile(file_env):
        with open(file_env, "r") as f:
            return f.read().strip()

    # Tier 2: Docker secrets default path
    docker_secret_path = f"/run/secrets/{name}"
    if os.path.isfile(docker_secret_path):
        with open(docker_secret_path, "r") as f:
            return f.read().strip()

    # Tier 3: Direct environment variable
    direct_env = os.getenv(name.upper()) or os.getenv(name)
    if direct_env:
        return direct_env

    return default
```

**Note:** This already works! The existing code has all 3 tiers. Verify by testing with direct env vars on Render.

---

### 4.2: `app/db/redis.py` — Make Redis URL Work with Upstash TLS

**Current Problem:** The `redis_connection_url` property already handles `rediss://` URLs. But we need to verify it passes TLS correctly to the Redis client.

**File:** `aai-wms-backend/app/db/redis.py`

**Change:** Ensure TLS is handled for Upstash connections:

```python
# In redis.py, update the connection setup
import ssl

async def connect(self):
    url = settings.redis_connection_url
    kwargs = {"decode_responses": True}

    # Upstash requires TLS
    if url.startswith("rediss://"):
        kwargs["ssl"] = ssl.create_default_context()

    pool = ConnectionPool.from_url(url, **kwargs)
    self._redis = Redis(connection_pool=pool)
```

---

### 4.3: `app/services/mqtt.py` — Point to EMQX Cloud

**Current Problem:** MQTT connects to `172.20.1.10:8883` (Docker VIP). For cloud, it should connect to EMQX Cloud.

**File:** `aai-wms-backend/app/services/mqtt.py`

**Changes:**

1. **Update TLS setup** — EMQX Cloud may not require client certificates (mTLS), just CA verification:

```python
# Current code expects client certs for mTLS
# For EMQX Cloud, we may only need CA cert or no verification

import ssl

def _setup_tls(self) -> ssl.SSLContext:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False  # Keep False for cloud endpoints

    ca_path = settings.MQTT_CA_CERT_PATH
    if ca_path and os.path.isfile(ca_path):
        ctx.load_verify_locations(ca_path)
    else:
        # EMQX Cloud: use system certs or disable verification
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE

    # Only load client certs if configured
    client_cert = settings.MQTT_CLIENT_CERT_PATH
    client_key = settings.MQTT_CLIENT_KEY_PATH
    if client_cert and client_key and os.path.isfile(client_cert):
        ctx.load_cert_chain(client_cert, client_key)

    return ctx
```

2. **Update MQTT settings defaults** in `config.py`:

```python
class Settings(BaseSettings):
    MQTT_HOST: str = "ke1040ef.ala.us-east-1.emqxsl.com"
    MQTT_PORT: int = 8883
    MQTT_USE_TLS: bool = True
    MQTT_USER: str = "aai-backend"
    MQTT_PASSWORD: str = ""
    MQTT_CA_CERT_PATH: str = ""  # Empty = no CA verification
    MQTT_CLIENT_CERT_PATH: str = ""  # Empty = no client cert
    MQTT_CLIENT_KEY_PATH: str = ""  # Empty = no client key
```

---

### 4.4: `app/main.py` — Make CORS Configurable

**Current Problem:** CORS is hardcoded to `allow_origins=["*"]`. Should be configurable for production.

**File:** `aai-wms-backend/app/main.py`

**Change:** Read CORS origins from environment variable:

```python
# Current (line ~136):
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    ...
)

# Change to:
import os

cors_origins = os.getenv("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "OPTIONS", "DELETE"],
    allow_headers=[
        "Authorization", "Content-Type", "X-Mock-Time",
        "Upgrade", "Connection",
        "Sec-WebSocket-Key", "Sec-WebSocket-Version",
        "Sec-WebSocket-Extensions", "Sec-WebSocket-Protocol"
    ],
)
```

---

### 4.5: `app/db/postgres.py` — Ensure SSL Works with NeonDB

**Current Problem:** The code detects `sslmode=require` in the URL and passes `ssl="require"` to asyncpg. NeonDB URLs already include `?sslmode=require`, so this should work.

**File:** `aai-wms-backend/app/db/postgres.py`

**No change needed** — the existing logic handles this:
```python
ssl_mode = "require" if "sslmode=require" in self.url else None
self.pool = await asyncpg.create_pool(self.url, ssl=ssl_mode, ...)
```

**Verify:** Test that NeonDB connection works with the full URL including `?sslmode=require`.

---

### 4.6: Dockerfile Updates for Render

**File:** `aai-wms-backend/Dockerfile`

**Changes:** Ensure the Dockerfile works on Render:

```dockerfile
FROM python:3.13-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Render uses PORT env var
ENV PORT=8000

# Run with uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**Note:** Render assigns a dynamic port via `PORT` env var. The current Dockerfile may need to use `$PORT` instead of hardcoded `8000`.

---

## 5. DA Engine Code Changes

### 5.1: `app/services/telemetry_bridge.py` — Add SSL Support for NeonDB

**Current Problem:** The PostgreSQL DSN is constructed without SSL parameters. NeonDB requires `sslmode=require`.

**File:** `da-engine/app/services/telemetry_bridge.py`

**Change:** Add SSL support to the DSN construction:

```python
import os

async def connect(self):
    host = os.environ.get("WMS_PG_HOST", "localhost")
    port = os.environ.get("WMS_PG_PORT", "5433")
    db = os.environ.get("WMS_PG_DB", "washroom_db")
    user = os.environ.get("WMS_PG_USER", "postgres")
    password = os.environ.get("WMS_PG_PASSWORD", "")

    # Build DSN with SSL for NeonDB
    ssl_mode = os.environ.get("WMS_PG_SSLMODE", "require")
    dsn = f"postgresql://{user}:{password}@{host}:{port}/{db}?sslmode={ssl_mode}"

    self.pool = await asyncpg.create_pool(dsn=dsn, min_size=1, max_size=3)
```

---

### 5.2: `app/config/settings.py` — Add REDIS_URL Support

**Current Problem:** The `Settings` class has `REDIS_URL` as optional. On Render, we'll use the `rediss://` URL from Upstash.

**File:** `da-engine/app/config/settings.py`

**Change:** Ensure `REDIS_URL` is prioritized:

```python
class Settings(BaseSettings):
    REDIS_URL: str | None = None  # Will be set from env var
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0
    REDIS_PASSWORD: str = ""

    @property
    def redis_url(self) -> str:
        if self.REDIS_URL:
            return self.REDIS_URL  # Use full URL (supports rediss://)
        auth = f":{self.REDIS_PASSWORD}@" if self.REDIS_PASSWORD else ""
        return f"redis://{auth}{self.REDIS_HOST}:{self.REDIS_PORT}/{self.REDIS_DB}"
```

**Note:** This already works! The `.env2` file has `REDIS_URL=rediss://...` which will be picked up by Pydantic BaseSettings.

---

### 5.3: `app/main.py` — Make CORS Configurable

**File:** `da-engine/app/main.py`

**Change:** Update CORS to use environment variable:

```python
import os

cors_origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

### 5.4: `app/storage/cache.py` — Verify TLS Connection

**File:** `da-engine/app/storage/cache.py`

**No change needed** — the `aioredis.from_url()` already supports `rediss://` URLs and handles TLS automatically.

**Verify:** Test that Upstash connection works with `REDIS_URL=rediss://...`.

---

### 5.5: Dockerfile Updates for Render

**File:** `da-engine/Dockerfile`

**Changes:** Same as WMS Backend — ensure it works on Render with dynamic port.

```dockerfile
FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV DA_ENGINE_PORT=8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
```

---

## 6. Portal Code Changes

### 6.1: Remove Custom Server for Vercel

**Current Problem:** `server.ts` is a custom Node.js server using `http-proxy` for WebSocket connections. Vercel doesn't support custom servers — it uses serverless functions.

**File:** `aai-unified-portal/server.ts`

**Change:** For Vercel deployment, we need to:

1. **Remove the custom server** from Vercel deployment (it won't work)
2. **Update client-side WebSocket URLs** to connect directly to backends

**Option A (Recommended): Direct WebSocket Connection**

Update `src/hooks/useRealtime.ts` to connect directly to backends:

```typescript
// Current:
const WS_URL = "ws://localhost:3000/ws"
const WMS_WS_URL = "ws://localhost:3000/wms/ws"

// Change to:
const DA_WS_URL = process.env.NEXT_PUBLIC_DA_ENGINE_URL?.replace("https://", "wss://").replace("http://", "ws://") || "ws://localhost:8001"
const WMS_WS_URL = process.env.NEXT_PUBLIC_WMS_API_URL?.replace("https://", "wss://") || "wss://localhost:443"
```

**Option B: Deploy WebSocket Proxy Separately**

If direct connection doesn't work (CORS issues), deploy `server.ts` on a separate service (Railway) as a WebSocket proxy.

---

### 6.2: `src/hooks/useRealtime.ts` — Update WebSocket URLs

**File:** `aai-unified-portal/src/hooks/useRealtime.ts`

**Change:** Update WebSocket connection URLs:

```typescript
// Find the WebSocketManager class and update URLs:

class WebSocketManager {
  private daWs: WebSocket | null = null;
  private wmsWs: WebSocket | null = null;

  connect() {
    // DA Engine WebSocket
    const daBase = process.env.NEXT_PUBLIC_DA_ENGINE_URL || "http://localhost:8001";
    const daWsUrl = daBase.replace("https://", "wss://").replace("http://", "ws://");
    this.daWs = new WebSocket(`${daWsUrl}/ws`);

    // WMS Backend WebSocket
    const wmsBase = process.env.NEXT_PUBLIC_WMS_API_URL || "https://localhost:443";
    const wmsWsUrl = wmsBase.replace("https://", "wss://").replace("http://", "ws://");
    this.wmsWs = new WebSocket(`${wmsWsUrl}/ws`);
  }
}
```

---

### 6.3: `src/lib/wmsClient.ts` — Remove Self-Signed Cert Bypass

**Current Problem:** Uses `rejectUnauthorized: false` to accept self-signed certs. On Render, TLS is valid (Let's Encrypt).

**File:** `aai-unified-portal/src/lib/wmsClient.ts`

**Change:** Make TLS verification configurable:

```typescript
// Current:
const agent = new https.Agent({
  rejectUnauthorized: false,  // Accepts self-signed certs
  keepAlive: true,
});

// Change to:
const isProduction = process.env.NODE_ENV === "production";
const agent = new https.Agent({
  rejectUnauthorized: !isProduction,  // Verify certs in production
  keepAlive: true,
});
```

**Also update** the WMS Backend URL to use the Render endpoint:

```typescript
const WMS_BASE_URL = process.env.WMS_BACKEND_URL || "https://localhost:443";
```

---

### 6.4: `src/lib/daClient.ts` — Update DA Engine URL

**File:** `aai-unified-portal/src/lib/daClient.ts`

**Change:** Ensure it uses the correct environment variable:

```typescript
const DA_BASE = process.env.NEXT_PUBLIC_DA_ENGINE_URL || "http://localhost:8001";
```

**No change needed** — this already reads from the env var.

---

### 6.5: `src/app/api/da/[...path]/route.ts` — Update Proxy URL

**File:** `aai-unified-portal/src/app/api/da/[...path]/route.ts`

**Change:** Ensure the proxy URL is correct:

```typescript
const DA_BASE = process.env.NEXT_PUBLIC_DA_ENGINE_URL || "http://localhost:8001";
```

**No change needed** — already configurable.

---

### 6.6: `src/app/api/wms/*/route.ts` — Update All WMS Proxy Routes

**Files:** All files in `src/app/api/wms/`

**Change:** Each WMS proxy route needs to use the correct backend URL:

```typescript
// In each WMS route file, update:
const WMS_BASE = process.env.WMS_BACKEND_URL || "https://localhost:443";
```

**Files to update:**
- `src/app/api/wms/status/route.ts`
- `src/app/api/wms/devices/[id]/route.ts`
- `src/app/api/wms/analytics/heatmap/route.ts`
- `src/app/api/wms/incidents/[id]/[action]/route.ts`
- `src/app/api/wms/admin/users/[username]/route.ts`
- `src/app/api/wms/audit/raw-telemetry/route.ts`
- `src/app/api/wms/audit/incident-events/route.ts`
- `src/app/api/wms/audit/floor-escalations/route.ts`

---

### 6.7: `next.config.ts` — Add Vercel Rewrites (Optional)

**File:** `aai-unified-portal/next.config.ts`

**Change:** Add rewrites for WebSocket if needed:

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Proxy DA Engine API calls (backup for direct connection)
      {
        source: "/api/da-proxy/:path*",
        destination: `${process.env.NEXT_PUBLIC_DA_ENGINE_URL}/api/:path*`,
      },
      // Proxy WMS Backend API calls
      {
        source: "/api/wms-proxy/:path*",
        destination: `${process.env.WMS_BACKEND_URL}/:path*`,
      },
    ];
  },
};

export default nextConfig;
```

---

## 7. Environment Variables Setup

### 7.1: WMS Backend (Render)

Set these in Render Dashboard → Environment:

```bash
# Application
APP_ENV=production
PORT=8000

# PostgreSQL (NeonDB)
DATABASE_URL=postgresql://neondb_owner:npg_cSwQX39dFCUP@ep-nameless-brook-ah66rf6f-pooler.c-3.us-east-1.aws.neon.tech/timescaledb?sslmode=require
POSTGRES_URL=postgresql://neondb_owner:npg_cSwQX39dFCUP@ep-nameless-brook-ah66rf6f-pooler.c-3.us-east-1.aws.neon.tech/timescaledb?sslmode=require
POSTGRES_SUPERUSER_URL=postgresql://neondb_owner:npg_cSwQX39dFCUP@ep-nameless-brook-ah66rf6f-pooler.c-3.us-east-1.aws.neon.tech/timescaledb?sslmode=require

# Redis (Upstash)
REDIS_URL=rediss://default:gQAAAAAAAz7LAAIgcDI0N2I3YTIzNzY3NDM0NjgzOThhMzAwMmZjYzZiNDk1OQ@ready-monkey-212683.upstash.io:6379/0
REDIS_HOST=ready-monkey-212683.upstash.io
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=gQAAAAAAAz7LAAIgcDI0N2I3YTIzNzY3NDM0NjgzOThhMzAwMmZjYzZiNDk1OQ

# MQTT (EMQX Cloud)
MQTT_HOST=ke1040ef.ala.us-east-1.emqxsl.com
MQTT_PORT=8883
MQTT_USE_TLS=true
MQTT_USER=aai-backend
MQTT_PASSWORD=AaiBackend@2026!
MQTT_CA_CERT_PATH=
MQTT_CLIENT_CERT_PATH=
MQTT_CLIENT_KEY_PATH=

# EMQX API
EMQX_API_ENDPOINT=https://ke1040ef.ala.us-east-1.emqxsl.com:8443/api/v5
EMQX_API_KEY=i0ee1696
EMQX_API_SECRET=XZMMg0S7pJx_8lkA

# Secrets (direct values, not file paths)
AAI_APP_WORKER_PASSWORD=<from secrets/aai_app_worker_password.txt>
POSTGRES_PASSWORD=<from secrets/postgres_password.txt>
REDIS_PASSWORD=gQAAAAAAAz7LAAIgcDI0N2I3YTIzNzY3NDM0NjgzOThhMzAwMmZjYzZiNDk1OQ
JWT_SECRET_KEY=<from secrets/jwt_secret_key.txt>
OPERATOR_PASSWORD=<from secrets/operator_password.txt>
SUPERVISOR_PASSWORD=<from secrets/supervisor_password.txt>

# CORS
CORS_ORIGINS=https://your-app.vercel.app

# Rate Limiting
RATE_LIMIT_MESSAGES=10
RATE_LIMIT_WINDOW_SECONDS=60

# WHI Thresholds
WHI_CRITICAL_THRESHOLD=30.0
WHI_WARNING_THRESHOLD=50.0

# Incident Debouncer
DEBOUNCE_THRESHOLD=3
```

---

### 7.2: DA Engine (Render)

Set these in Render Dashboard → Environment:

```bash
# Application
APP_ENV=production
ENVIRONMENT=production
LOG_LEVEL=INFO
DA_ENGINE_HOST=0.0.0.0
DA_ENGINE_PORT=8001

# PostgreSQL (NeonDB)
DATABASE_URL=postgresql://neondb_owner:npg_cSwQX39dFCUP@ep-nameless-brook-ah66rf6f-pooler.c-3.us-east-1.aws.neon.tech/timescaledb?sslmode=require
WMS_PG_HOST=ep-nameless-brook-ah66rf6f-pooler.c-3.us-east-1.aws.neon.tech
WMS_PG_PORT=5432
WMS_PG_DB=timescaledb
WMS_PG_USER=neondb_owner
WMS_PG_PASSWORD=npg_cSwQX39dFCUP
WMS_PG_SSLMODE=require

# Redis (Upstash)
REDIS_URL=rediss://default:gQAAAAAAAz7LAAIgcDI0N2I3YTIzNzY3NDM0NjgzOThhMzAwMmZjYzZiNDk1OQ@ready-monkey-212683.upstash.io:6379/0
REDIS_HOST=ready-monkey-212683.upstash.io
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=gQAAAAAAAz7LAAIgcDI0N2I3YTIzNzY3NDM0NjgzOThhMzAwMmZjYzZiNDk1OQ
REDIS_CACHE_TTL=300

# NSCBI Airport API
NSCBI_API_BASE_URL=https://api.nscbiairport.com/api
NSCBI_API_KEY=EY9kocR7OOFfkJBXXLYrQFs84HEyI1OJDUjJcbwfsDVOqXvcFau3eqBdG6ZHZ2Fe
NSCBI_DEVICE_IDS=T1-L1-PPM-002,T1-L1-PPF-003,...

# Polling
POLLING_INTERVAL_SECONDS=30
SCHEDULER_ENABLED=true

# CORS
CORS_ORIGINS=https://your-app.vercel.app
CORS_ALLOW_ORIGIN=https://your-app.vercel.app
```

---

### 7.3: Portal (Vercel)

Set these in Vercel Dashboard → Settings → Environment Variables:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_anVzdC1qYXZlbGluLTIxLmNsZXJrLmFjY291bnRzLmRldiQ
CLERK_SECRET_KEY=sk_test_F0q13PIgh1w9vZmtV43v4fjtENW7TgB4rR1YiZ7crJ
CLERK_WEBHOOK_SECRET=whsec_5q0Ek14eBBKUSYq21F3QQJHPpYyqwkLY
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/api/auth/redirect

# Neon PostgreSQL
DATABASE_URL=postgresql://neondb_owner:npg_cSwQX39dFCUP@ep-nameless-brook-ah66rf6f.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require
POSTGRES_URL=postgresql://neondb_owner:npg_cSwQX39dFCUP@ep-nameless-brook-ah66rf6f.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require

# Backend URLs (Render endpoints)
NEXT_PUBLIC_DA_ENGINE_URL=https://your-da-engine.onrender.com
DA_ENGINE_URL=https://your-da-engine.onrender.com
NEXT_PUBLIC_WMS_API_URL=https://your-wms-backend.onrender.com
WMS_BACKEND_URL=https://your-wms-backend.onrender.com

# WMS Backend Auth
WMS_JWT_OPERATOR_USER=operator
WMS_JWT_OPERATOR_PASS=N3fc/fiIi55E3+O4qr4FRw==

# App
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NODE_ENV=production

# Upstash Redis
UPSTASH_REDIS_REST_URL="https://ready-monkey-212683.upstash.io"
UPSTASH_REDIS_REST_TOKEN="gQAAAAAAAz7LAAIgcDI0N2I3YTIzNzY3NDM0NjgzOThhMzAwMmZjYzZiNDk1OQ"
```

---

## 8. Dockerfile Updates

### 8.1: WMS Backend Dockerfile

**File:** `aai-wms-backend/Dockerfile`

```dockerfile
FROM python:3.13-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create non-root user
RUN useradd --create-home --shell /bin/bash appuser
USER appuser

# Render assigns port via PORT env var
ENV PORT=8000

EXPOSE ${PORT}

CMD uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
```

### 8.2: DA Engine Dockerfile

**File:** `da-engine/Dockerfile`

```dockerfile
FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV DA_ENGINE_PORT=8001

EXPOSE ${DA_ENGINE_PORT}

CMD uvicorn app.main:app --host 0.0.0.0 --port ${DA_ENGINE_PORT}
```

---

## 9. WebSocket Strategy for Vercel

### Problem

Vercel uses serverless functions — no persistent connections. The current `server.ts` custom server won't work on Vercel.

### Solution: Direct WebSocket Connection

Update the client-side code to connect directly to the backend WebSocket endpoints:

**File:** `aai-unified-portal/src/hooks/useRealtime.ts`

```typescript
// Replace localhost URLs with cloud endpoints
const getWsUrl = (baseUrl: string): string => {
  return baseUrl
    .replace("https://", "wss://")
    .replace("http://", "ws://");
};

class WebSocketManager {
  connect() {
    const daUrl = getWsUrl(process.env.NEXT_PUBLIC_DA_ENGINE_URL || "http://localhost:8001");
    const wmsUrl = getWsUrl(process.env.NEXT_PUBLIC_WMS_API_URL || "https://localhost:443");

    this.daWs = new WebSocket(`${daUrl}/ws`);
    this.wmsWs = new WebSocket(`${wmsUrl}/ws`);
  }
}
```

### Fallback: SSE (Server-Sent Events)

If WebSocket connections fail due to CORS, use the existing SSE endpoint:

**File:** `aai-unified-portal/src/hooks/useSSEFallback.ts`

```typescript
// Already implemented! Use as fallback
const eventSource = new EventSource(
  `${process.env.NEXT_PUBLIC_DA_ENGINE_URL}/api/sse/telemetry`
);
```

---

## 10. Deployment Steps

### Step 1: Push Code Changes to GitHub

```bash
cd C:\INTERNSHIP_TASK\TASK16\Fullstack_Unification
git add .
git commit -m "Cloud deployment: update configs for Render + Vercel + Oracle Cloud"
git push origin main
```

### Step 2: Create Oracle Cloud Free Tier VM (HAProxy)

1. Go to https://cloud.oracle.com
2. Sign up for Always Free tier
3. Create VM instance:
   - Name: `aai-haproxy`
   - Shape: VM.Standard.A1.Flex (4 OCPUs, 24GB RAM)
   - Image: Ubuntu 22.04
   - VCN: Create new with internet connectivity
   - Public IP: Assign
4. Download SSH key
5. Wait for VM to be provisioned (~5 minutes)
6. Note the public IP address

### Step 3: Deploy HAProxy to Oracle Cloud VM

```bash
# SSH into the VM
ssh -i ~/.ssh/your-key ubuntu@YOUR_VM_IP

# Install Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
sudo apt install docker-compose-plugin -y

# Log out and back in for group changes
exit

# SSH back in
ssh -i ~/.ssh/your-key ubuntu@YOUR_VM_IP

# Clone repository
git clone https://github.com/your-repo/Fullstack_Unification.git /opt/aai-haproxy
cd /opt/aai-haproxy/aai-wms-backend

# Deploy HAProxy stack
docker compose -f docker-compose.cloud.yml up -d

# Verify
docker compose ps
docker compose logs -f
```

### Step 4: Open Firewall Ports on Oracle Cloud

1. Oracle Cloud Console → Networking → Virtual Cloud Networks
2. Click your VCN → Public Subnet → Security Lists
3. Add Ingress Rules:
   - Port 22 (SSH) - Your IP only
   - Port 8883 (MQTT SSL) - 0.0.0.0/0
   - Port 443 (FastAPI) - 0.0.0.0/0
   - Port 18083 (EMQX Dashboard) - Your IP only

### Step 5: Deploy WMS Backend to Render

1. Go to https://render.com
2. Click "New" → "Web Service"
3. Connect GitHub repo
4. Set:
   - **Name:** `aai-wms-backend`
   - **Root Directory:** `aai-wms-backend`
   - **Runtime:** Docker
5. Add all environment variables from Section 7.1
6. Click "Create Web Service"
7. Wait for deployment, note the URL (e.g., `https://aai-wms-backend.onrender.com`)

### Step 6: Deploy DA Engine to Render

1. Click "New" → "Web Service"
2. Connect GitHub repo
3. Set:
   - **Name:** `aai-da-engine`
   - **Root Directory:** `da-engine`
   - **Runtime:** Docker
4. Add all environment variables from Section 7.2
5. Click "Create Web Service"
6. Wait for deployment, note the URL (e.g., `https://aai-da-engine.onrender.com`)

### Step 7: Deploy Portal to Vercel

1. Go to https://vercel.com
2. Click "Add New Project"
3. Import GitHub repo
4. Set:
   - **Root Directory:** `aai-unified-portal`
   - **Framework:** Next.js
5. Add all environment variables from Section 7.3
6. Click "Deploy"
7. Wait for deployment, note the URL (e.g., `https://your-app.vercel.app`)

### Step 8: Update Clerk Webhook

1. Go to Clerk Dashboard → Webhooks
2. Update endpoint to: `https://your-app.vercel.app/api/webhooks/clerk`
3. Save

### Step 9: Run Database Migrations

```bash
# On local machine
cd aai-unified-portal
npx drizzle-kit push

# For TimescaleDB schema on NeonDB
psql "postgresql://neondb_owner:npg_...@ep-nameless-brook-.../timescaledb?sslmode=require" -f ../aai-wms-backend/db_init/01-init.sql
```

### Step 10: Update HAProxy Configuration

On the Oracle Cloud VM, update `haproxy-cloud.cfg` with your actual backend URLs:

```bash
ssh -i ~/.ssh/your-key ubuntu@YOUR_VM_IP

# Edit HAProxy config
nano /opt/aai-haproxy/aai-wms-backend/haproxy/haproxy-cloud.cfg

# Update these lines:
# server fastapi your-wms-backend.onrender.com:443 check ssl verify none
# server da-engine your-da-engine.onrender.com:443 check ssl verify none

# Restart HAProxy
cd /opt/aai-haproxy/aai-wms-backend
docker compose restart haproxy1 haproxy2
```

---

## 11. Testing Checklist

### WMS Backend

- [ ] Health endpoint responds: `GET /health`
- [ ] Login works: `POST /auth/login`
- [ ] Dashboard status: `GET /dashboard/status`
- [ ] MQTT connection established (check logs)
- [ ] Redis connection established (check logs)
- [ ] PostgreSQL connection established (check logs)

### DA Engine

- [ ] Health endpoint responds: `GET /api/health`
- [ ] Dashboard summary: `GET /api/dashboard/summary`
- [ ] Terminals list: `GET /api/terminals`
- [ ] Telemetry polling active (check logs)
- [ ] Redis cache working (check logs)
- [ ] PostgreSQL bridge working (check logs)

### Portal

- [ ] Sign in with Clerk works
- [ ] Dashboard loads with data
- [ ] Real-time WebSocket updates work
- [ ] All API routes proxy correctly
- [ ] No CORS errors in browser console

### End-to-End

- [ ] MQTT messages flow from EMQX Cloud → WMS Backend
- [ ] Telemetry data stored in NeonDB
- [ ] DA Engine polls NSCBI API successfully
- [ ] Portal displays live data
- [ ] WebSocket updates push in real-time
- [ ] All services communicate correctly

---

## Appendix: File Change Summary

| File | Change | Priority |
|------|--------|----------|
| `aai-wms-backend/app/core/config.py` | Verify `get_secret()` works without files | HIGH |
| `aai-wms-backend/app/db/redis.py` | Add TLS support for Upstash | HIGH |
| `aai-wms-backend/app/services/mqtt.py` | Update TLS for EMQX Cloud | HIGH |
| `aai-wms-backend/app/main.py` | Make CORS configurable | MEDIUM |
| `aai-wms-backend/Dockerfile` | Update for Render | HIGH |
| `da-engine/app/services/telemetry_bridge.py` | Add SSL to PostgreSQL DSN | HIGH |
| `da-engine/app/main.py` | Make CORS configurable | MEDIUM |
| `da-engine/Dockerfile` | Update for Render | HIGH |
| `aai-unified-portal/src/hooks/useRealtime.ts` | Update WebSocket URLs | HIGH |
| `aai-unified-portal/src/lib/wmsClient.ts` | Remove self-signed cert bypass | MEDIUM |
| `aai-unified-portal/src/app/api/wms/*/route.ts` | Update WMS backend URLs | HIGH |
| `aai-unified-portal/next.config.ts` | Add rewrites (optional) | LOW |

---

**Document Version:** 1.0
**Last Updated:** August 2026
