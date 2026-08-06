# AAI Smart Washroom System — Cloud Deployment Guide (Free Tier)

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TIER 1 — FRONTEND                           │
│                                                                     │
│   Vercel (Next.js 16 + Clerk Auth + Drizzle ORM)                   │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐     │
│   │  React SSR   │───▶│  API Routes  │───▶│  Neon PostgreSQL  │     │
│   │  Dashboard   │    │  (Proxy)     │    │  (Serverless PG)  │     │
│   └──────┬───────┘    └──────┬───────┘    └──────────────────┘     │
│          │ WSS               │ HTTPS                                │
└──────────┼───────────────────┼──────────────────────────────────────┘
           │                   │
           ▼                   ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     TIER 2 — BACKEND ENGINES                        │
│                                                                     │
│  ┌─────────────────────┐         ┌─────────────────────────┐       │
│  │  Railway / Render   │         │  Railway / Render        │       │
│  │  WMS Backend        │         │  DA Engine               │       │
│  │  (FastAPI + MQTT)   │◀───────▶│  (FastAPI + APScheduler) │       │
│  │  Port 8000          │  data   │  Port 8001               │       │
│  │  + 4 Workers        │  net    │  + Telemetry Bridge      │       │
│  │  + Batcher          │         │  + NSCBI API Polling     │       │
│  │  + Audit Service    │         │  + Analytics Pipeline    │       │
│  └────────┬────────────┘         └────────┬────────────────┘       │
│           │                               │                         │
│  ┌────────▼───────────────────────────────▼────────────────┐       │
│  │              EMQX MQTT Broker (Cloud IoT Core)          │       │
│  │              or HiveMQ Cloud Free Tier                   │       │
│  └─────────────────────────────────────────────────────────┘       │
└──────────┬──────────────────────────────────────┬───────────────────┘
           │                                      │
           ▼                                      ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      TIER 3 — DATABASES                             │
│                                                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐   │
│  │ Upstash      │  │ Neon         │  │ Timescale Cloud         │   │
│  │ Redis        │  │ PostgreSQL   │  │ (or self-hosted PG)     │   │
│  │ (Free Tier)  │  │ (Free Tier)  │  │ (Free Tier / $0)       │   │
│  │              │  │              │  │                         │   │
│  │ • JWT tokens │  │ • app_users  │  │ • washroom_telemetry   │   │
│  │ • Rate limit │  │ • audit_logs │  │ • incident_events      │   │
│  │ • DA cache   │  │ • settings   │  │ • floor_escalation     │   │
│  │ • Queue state│  │ • fallback   │  │ • raw_telemetry_audit  │   │
│  │ • Session    │  │   data       │  │ • continuous aggregates │   │
│  └──────────────┘  └──────────────┘  └────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Service Selection — Free Tier Summary

| Component | Service | Free Tier Limits | Monthly Cost |
|---|---|---|---|
| **Frontend (Next.js)** | Vercel | 100GB bandwidth, 1000 build min | $0 |
| **WMS Backend** | Railway | $5 credit/mo (500 hrs) | $0 |
| **DA Engine** | Railway | Shared $5 credit/mo | $0 |
| **MQTT Broker** | HiveMQ Cloud Free | 100 connections, 1GB storage | $0 |
| **TimescaleDB** | Timescale Cloud | 1 node, 1GB storage | $0 |
| **Redis** | Upstash | 10K commands/day, 256MB | $0 |
| **PostgreSQL (Portal)** | Neon | 0.5GB storage, 24/7 compute | $0 |
| **Authentication** | Clerk | 10K MAU | $0 |
| **DNS / Domain** | Cloudflare | Free plan | $0 |
| **SSL Certificates** | Let's Encrypt | Unlimited | $0 |
| **Monitoring** | UptimeRobot | 50 monitors | $0 |

**Total estimated monthly cost: $0**

---

## TIER 1 — Frontend Deployment (Vercel)

### Prerequisites
- GitHub repository connected to Vercel
- Clerk account (just-javilin-21.clerk.accounts.dev)
- Neon PostgreSQL database

### Step 1: Import Project to Vercel

1. Go to [vercel.com](https://vercel.com) → Sign in with GitHub
2. Click **"Add New Project"** → Import `aai-unified-portal/` directory
3. Framework Preset: **Next.js**
4. Root Directory: `aai-unified-portal/`
5. Build Command: `npm run build`
6. Output Directory: `.next`

### Step 2: Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/admin/dashboard
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/admin/dashboard
CLERK_WEBHOOK_SECRET=whsec_...

# Neon PostgreSQL (Portal Database)
DATABASE_URL=postgresql://neondb_owner:...@ep-nameless-brook-ah66rf6f.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require
DIRECT_URL=postgresql://neondb_owner:...@ep-nameless-brook-ah66rf6f.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require

# Backend API URLs (Railway endpoints)
NEXT_PUBLIC_API_URL=https://wms-backend-production.up.railway.app
NEXT_PUBLIC_DA_ENGINE_URL=https://da-engine-production.up.railway.app

# WebSocket URLs (wss through Vercel rewrites or Railway)
NEXT_PUBLIC_WS_URL=wss://wms-backend-production.up.railway.app
NEXT_PUBLIC_DA_WS_URL=wss://da-engine-production.up.railway.app
```

### Step 3: WebSocket Configuration (Important)

Vercel serverless functions do **not** support WebSockets. You have two options:

**Option A: Use Railway as WebSocket Endpoint (Recommended)**

Update `server.ts` to work as a standalone WebSocket proxy, deployed separately on Railway:

```
Browser → Vercel (HTTP/SSR) → Railway WS Proxy → DA Engine / WMS Backend
```

**Option B: Use Vercel Rewrite + Railway Direct**

Add to `next.config.ts`:
```typescript
async rewrites() {
  return [
    { source: '/ws', destination: 'https://wms-backend-production.up.railway.app/ws' },
    { source: '/wms/ws', destination: 'https://wms-backend-production.up.railway.app/wms/ws' },
    { source: '/da/api/:path*', destination: 'https://da-engine-production.up.railway.app/api/:path*' },
    { source: '/wms/api/:path*', destination: 'https://wms-backend-production.up.railway.app/api/:path*' },
  ];
}
```

### Step 4: Deploy

```bash
# Connect to Vercel CLI
npm i -g vercel
cd aai-unified-portal
vercel --prod
```

Or push to GitHub — Vercel auto-deploys on push.

### Step 5: Run Database Migrations

```bash
cd aai-unified-portal
npx drizzle-kit push
# or
npx drizzle-kit migrate
```

---

## TIER 2A — WMS Backend Deployment (Railway)

### Prerequisites
- Railway account ([railway.app](https://railway.app))
- Upstash Redis (see Tier 3)
- HiveMQ Cloud MQTT broker (see Tier 3)

### Step 1: Create New Project

1. Railway Dashboard → **New Project** → **Deploy from GitHub Repo**
2. Select the monorepo → Set Root Directory: `aai-wms-backend/`
3. Railway auto-detects the `Dockerfile`

### Step 2: Environment Variables

Set in Railway → Variables:

```bash
# Application
APP_ENV=production
APP_PORT=8000
APP_HOST=0.0.0.0
LOG_LEVEL=info

# PostgreSQL (TimescaleDB — see Tier 3)
DATABASE_URL=postgresql://aai_app_worker:...@your-timescaledb-host:5432/aai_washroom?sslmode=require

# Redis (Upstash)
REDIS_URL=rediss://default:...@your-upstash-redis.upstash.io:6379

# MQTT Broker (HiveMQ Cloud)
MQTT_BROKER_URL=mqtt://your-broker.hivemq.cloud:1883
MQTT_USERNAME=aai-backend
MQTT_PASSWORD=...
MQTT_CA_CERT_PATH=/app/certs/ca.crt

# JWT Configuration
JWT_SECRET_KEY=<auto-generate-64-char-hex>
JWT_ACCESS_TOKEN_EXPIRY_MINUTES=15
JWT_REFRESH_TOKEN_EXPIRY_DAYS=7

# CORS
CORS_ORIGINS=https://your-app.vercel.app

# Worker Configuration
PRIORITY_WORKER_COUNT=1
NORMAL_WORKER_COUNT=3
BATCH_FLUSH_INTERVAL_SECONDS=5
BATCH_FLUSH_SIZE=100

# Rate Limiting
RATE_LIMIT_REQUESTS_PER_MINUTE=60
RATE_LIMIT_BURST_SIZE=10
```

### Step 3: Add Persistent Volume (for Certs)

Railway → Service → Settings → Volumes:
- Mount Path: `/app/certs`
- Size: 100MB

Upload your PKI certificates to the volume, or generate them at startup.

### Step 4: Deploy

```bash
# Railway auto-deploys on push
# Or manually:
railway up
```

### Step 5: Verify Health

```bash
curl https://wms-backend-production.up.railway.app/api/health
```

---

## TIER 2B — DA Engine Deployment (Railway)

### Step 1: Create New Project

1. Railway Dashboard → **New Project** → **Deploy from GitHub Repo**
2. Set Root Directory: `da-engine/`
3. Railway detects `Dockerfile`

### Step 2: Environment Variables

```bash
# Application
APP_ENV=production
APP_PORT=8001
APP_HOST=0.0.0.0
LOG_LEVEL=info

# TimescaleDB (same instance or separate)
DATABASE_URL=postgresql://aai_app_worker:...@your-timescaledb-host:5432/aai_washroom?sslmode=require

# Redis (Upstash — use DB 1 for DA Engine)
REDIS_URL=rediss://default:...@your-upstash-redis.upstash.io:6379
REDIS_DB=1

# NSCBI Airport API (external data source)
NSCBI_API_BASE_URL=https://api.nscbi.example.com
NSCBI_API_KEY=...
NSCBI_POLLING_INTERVAL_SECONDS=30

# CORS
CORS_ORIGINS=https://your-app.vercel.app

# WebSocket
WS_HOST=0.0.0.0
WS_PORT=8001

# APScheduler
SCHEDULER_ENABLED=true
```

### Step 3: Deploy

```bash
railway up
```

### Step 4: Verify

```bash
curl https://da-engine-production.up.railway.app/api/health
```

---

## TIER 3 — Database Layer

### 3A: TimescaleDB (Time-Series Database)

#### Option 1: Timescale Cloud Free (Recommended)

1. Sign up at [timescale.com](https://timescale.com)
2. Create a free-tier service (1 node, 1GB)
3. Connection string format:
   ```
   postgresql://tsdb_owner:password@host.aivencloud.com:14958/aai_washroom?sslmode=require
   ```
4. Note: Timescale Cloud free tier has limited retention. For production, consider a $0 hobby tier.

#### Option 2: Neon PostgreSQL (Serverless, for WMS data)

If TimescaleDB-specific features (hypertables, continuous aggregates) are not critical:
1. Use Neon's paid tier ($19/mo) for the WMS database
2. Neon supports `pg_cron` extension for scheduled tasks

#### Initialize Schema

```bash
psql "postgresql://..." -f aai-wms-backend/db_init/01-init.sql
```

This creates:
- 4 hypertables with compression and retention policies
- 2 continuous aggregates (hourly/daily WHI summaries)
- Freeze triggers on audit tables
- Least-privilege role `aai_app_worker`

---

### 3B: Redis (Upstash — Serverless)

1. Sign up at [upstash.com](https://upstash.com)
2. Create a Redis instance (Global / Region)
3. Copy the `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`
4. For Railway/Renders, use the `rediss://` connection string

#### Usage Split

| DB | Consumer | Purpose |
|---|---|---|
| DB 0 | WMS Backend | JWT tokens, incident state, rate limits, floor status |
| DB 1 | DA Engine | Telemetry cache persistence (60s interval, 5-min TTL) |

> **Note:** Upstash free tier = 10K commands/day. For production, upgrade to Pay-As-You-Go.

---

### 3C: Neon PostgreSQL (Portal Auth + Fallback)

1. Sign up at [neon.tech](https://neon.tech)
2. Create a project → Copy connection string
3. Run Drizzle migrations:

```bash
cd aai-unified-portal
DATABASE_URL="postgresql://..." npx drizzle-kit push
```

Tables created (16 total):
- `app_users` — Clerk-synced user profiles
- `audit_logs` — Portal audit trail
- `system_logs` — System events
- `system_settings` — Configuration
- `terminals`, `levels`, `washroom_units`, etc. — Fallback data tables

---

### 3D: MQTT Broker (HiveMQ Cloud Free)

1. Sign up at [hivemq.com/cloud](https://www.hivemq.com/cloud/)
2. Create a free cluster (100 connections, 1GB storage)
3. Create credentials: Username `aai-backend`, Password `...`
4. Download the cluster CA certificate

#### MQTT Topic Structure
```
washroom/{terminal}/{level}/telemetry    # Sensor data
washroom/{terminal}/{level}/alerts       # Device alerts
```

#### Connect from WMS Backend
The MQTT subscriber in `app/services/mqtt.py` subscribes to:
- `washroom/+/+/telemetry` — all telemetry
- `washroom/+/+/alerts` — all alerts

Update `MQTT_BROKER_URL` to point to HiveMQ Cloud endpoint.

---

## Docker Compose (Alternative: Single VM Deployment)

If you prefer running all services on a single VPS (e.g., Oracle Cloud Free Tier — 4 ARM cores, 24GB RAM):

### Step 1: Create Root `docker-compose.yml`

```yaml
version: "3.8"

services:
  # ─── TIER 2: WMS Backend ───────────────────────────────
  wms-backend:
    build:
      context: ./aai-wms-backend
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://aai_app_worker:${POSTGRES_PASSWORD}@timescaledb:5432/aai_washroom?sslmode=require
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/0
      - MQTT_BROKER_URL=tcp://emqx1:1883
      - JWT_SECRET_KEY=${JWT_SECRET_KEY}
      - APP_ENV=production
    depends_on:
      - timescaledb
      - redis
      - emqx1
    networks:
      - backend-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ─── TIER 2: DA Engine ─────────────────────────────────
  da-engine:
    build:
      context: ./da-engine
      dockerfile: Dockerfile
    ports:
      - "8001:8001"
    environment:
      - DATABASE_URL=postgresql://aai_app_worker:${POSTGRES_PASSWORD}@timescaledb:5432/aai_washroom?sslmode=require
      - REDIS_URL=redis://:${REDIS_PASSWORD}@redis:6379/1
      - NSCBI_API_BASE_URL=${NSCBI_API_BASE_URL}
      - NSCBI_API_KEY=${NSCBI_API_KEY}
      - APP_ENV=production
    depends_on:
      - timescaledb
      - redis
    networks:
      - backend-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8001/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ─── TIER 3: TimescaleDB ───────────────────────────────
  timescaledb:
    image: timescale/timescaledb:latest-pg16
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=aai_washroom
      - POSTGRES_USER=aai_admin
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - timescaledb_data:/var/lib/postgresql/data
      - ./aai-wms-backend/db_init:/docker-entrypoint-initdb.d
    networks:
      - backend-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aai_admin -d aai_washroom"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── TIER 3: Redis ─────────────────────────────────────
  redis:
    image: redis:7.2-alpine
    ports:
      - "6379:6379"
    command: redis-server --requirepass ${REDIS_PASSWORD} --maxmemory 256mb --maxmemory-policy allkeys-lru
    volumes:
      - redis_data:/data
    networks:
      - backend-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ─── MQTT: EMQX (Single Node for Free Tier) ────────────
  emqx1:
    image: emqx/emqx:5.8
    ports:
      - "1883:1883"    # MQTT
      - "8083:8083"    # WebSocket
      - "8883:8883"    # MQTT/TLS
      - "18083:18083"  # Dashboard
    environment:
      - EMQX_NAME=aai-emqx
      - EMQX_HOST=emqx1
    volumes:
      - emqx_data:/opt/emqx/data
      - emqx_log:/opt/emqx/log
    networks:
      - backend-net
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "emqx", "ctl", "status"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ─── NGINX Reverse Proxy (TLS Termination) ─────────────
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - wms-backend
      - da-engine
    networks:
      - backend-net
    restart: unless-stopped

volumes:
  timescaledb_data:
  redis_data:
  emqx_data:
  emqx_log:

networks:
  backend-net:
    driver: bridge
```

### Step 2: Nginx Configuration

Create `nginx/nginx.conf`:

```nginx
events {
    worker_connections 1024;
}

http {
    # Rate limiting
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;

    upstream wms_backend {
        server wms-backend:8000;
    }

    upstream da_engine {
        server da-engine:8001;
    }

    # HTTP → HTTPS redirect
    server {
        listen 80;
        server_name your-domain.com;
        return 301 https://$host$request_uri;
    }

    # HTTPS server
    server {
        listen 443 ssl;
        server_name your-domain.com;

        ssl_certificate /etc/nginx/certs/fullchain.pem;
        ssl_certificate_key /etc/nginx/certs/privkey.pem;

        # API proxy
        location /wms/api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://wms_backend/api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }

        location /da/api/ {
            limit_req zone=api burst=20 nodelay;
            proxy_pass http://da_engine/api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        # WebSocket: DA Engine
        location /ws {
            proxy_pass http://da_engine/ws;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_read_timeout 86400;
        }

        # WebSocket: WMS Backend
        location /wms/ws {
            proxy_pass http://wms_backend/ws;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
            proxy_set_header Host $host;
            proxy_read_timeout 86400;
        }
    }
}
```

### Step 3: Deploy

```bash
# Set secrets
export POSTGRES_PASSWORD=$(openssl rand -base64 32)
export REDIS_PASSWORD=$(openssl rand -base64 32)
export JWT_SECRET_KEY=$(openssl rand -hex 32)

# Start everything
docker-compose up -d --build

# Check status
docker-compose ps
docker-compose logs -f
```

---

## Background Jobs & Cron Configuration

### DA Engine — APScheduler Jobs

The DA Engine runs these background tasks automatically:

| Job | Interval | Description |
|---|---|---|
| NSCBI API Polling | 30s (configurable) | Fetches latest telemetry from airport API |
| Redis Persistence | 60s | Persists in-memory cache to Redis for crash recovery |
| Telemetry Bridge | 30s | Syncs DA Engine cache to TimescaleDB via COPY |

No external cron setup needed — APScheduler runs inside the FastAPI process.

### WMS Backend — Async Workers

| Worker | Count | Description |
|---|---|---|
| Priority Worker | 1 | Processes alert/critical MQTT messages first |
| Normal Workers | 3 | Processes regular telemetry messages |
| Batcher Monitor | 1 | Flushes Redis buffer → TimescaleDB (5s or 100 items) |
| Audit Batcher | 1 | Captures raw MQTT for audit trail |
| MQTT Subscriber | 1 | Long-running connection to EMQX |

All workers run as asyncio tasks within the FastAPI lifespan — no separate process management needed.

---

## Sync & Real-Time Integration

### How All Tiers Stay in Sync

```
┌─────────────┐     MQTT      ┌──────────────┐    PostgreSQL    ┌──────────────┐
│ IoT Sensors │──────────────▶│  EMQX Broker │────────────────▶│ TimescaleDB  │
│ (Pico W)    │               └──────┬───────┘                 └──────┬───────┘
└─────────────┘                      │                                │
                                     │ MQTT Subscription              │
                                     ▼                                │
                              ┌──────────────┐                       │
                              │ WMS Backend  │◀──────────────────────┘
                              │ (FastAPI)    │     Telemetry Bridge
                              └──────┬───────┘
                                     │
                    ┌────────────────┼────────────────┐
                    │ WebSocket      │ REST API        │ HTTP
                    │ Fan-out        │ (Proxy)         │ Proxy
                    ▼                ▼                 ▼
              ┌──────────┐   ┌──────────┐   ┌──────────────┐
              │ Browser  │   │ Browser  │   │  DA Engine   │
              │ WS Client│   │ HTTP     │   │  (Analytics) │
              └──────────┘   └──────────┘   └──────┬───────┘
                                                   │
                                                   │ PostgreSQL
                                                   ▼
                                            ┌──────────────┐
                                            │ TimescaleDB  │
                                            └──────────────┘
```

### Data Flow Summary

1. **IoT sensors** → MQTT → **EMQX** → **WMS Backend** subscriber
2. **WMS Backend** processes → stores in **TimescaleDB** + pushes to **Redis**
3. **DA Engine** polls NSCBI API → enriches → stores in **TimescaleDB** + **Redis**
4. **DA Engine** bridges telemetry to TimescaleDB (COPY protocol, 30s)
5. **WebSocket hubs** in both backends fan-out updates to connected browsers
6. **Next.js portal** proxies API requests and WebSocket connections
7. **Neon PostgreSQL** stores auth data and serves as fallback when backends are down

---

## Deployment Checklist

### Pre-Deployment

- [ ] All environment variables documented and ready
- [ ] Clerk webhook endpoint registered for production URL
- [ ] Neon database migrations run (`npx drizzle-kit push`)
- [ ] TimescaleDB schema initialized (`01-init.sql`)
- [ ] HiveMQ MQTT credentials created
- [ ] Upstash Redis instance created (2 databases)
- [ ] SSL certificates generated (if self-hosting)
- [ ] GitHub repository pushed with all code

### Tier 1 — Vercel

- [ ] Project imported and linked
- [ ] Environment variables set (all 3 categories)
- [ ] Build succeeds (`npm run build`)
- [ ] Clerk auth working (sign-in, sign-up, role detection)
- [ ] Neon database connected
- [ ] API proxy routes working
- [ ] WebSocket rewrite/redirect configured

### Tier 2 — Railway (WMS Backend)

- [ ] Docker build succeeds
- [ ] Health check endpoint responds (`/api/health`)
- [ ] TimescaleDB connection verified
- [ ] Redis (Upstash) connection verified
- [ ] MQTT subscriber connected to HiveMQ
- [ ] WebSocket endpoint accessible (`/ws`)
- [ ] JWT auth working (login → access + refresh tokens)
- [ ] Background workers running (check logs)

### Tier 2 — Railway (DA Engine)

- [ ] Docker build succeeds
- [ ] Health check endpoint responds (`/api/health`)
- [ ] NSCBI API polling active
- [ ] Telemetry Bridge syncing to TimescaleDB
- [ ] Redis cache persistence running
- [ ] WebSocket endpoint accessible (`/ws`)
- [ ] APScheduler jobs running

### Tier 3 — Databases

- [ ] TimescaleDB: hypertables created, retention policies active
- [ ] TimescaleDB: continuous aggregates refreshing
- [ ] Redis: both DB 0 and DB 1 accessible
- [ ] Neon: all 16 tables created
- [ ] Connection pooling configured (if using PgBouncer)

### Integration

- [ ] Portal → WMS Backend API calls working
- [ ] Portal → DA Engine API calls working
- [ ] Portal WebSocket → DA Engine real-time updates
- [ ] Portal WebSocket → WMS Backend real-time updates
- [ ] MQTT telemetry flowing end-to-end
- [ ] Incident detection and alerting working
- [ ] Floor escalation logic working

---

## Troubleshooting

### Common Issues

| Issue | Cause | Fix |
|---|---|---|
| WebSocket connection refused | Vercel doesn't support WS | Use Railway direct or separate WS proxy |
| MQTT connection timeout | HiveMQ firewall | Check port 1883/8883 is open, verify credentials |
| TimescaleDB connection refused | SSL mode required | Add `?sslmode=require` to DATABASE_URL |
| Redis `WRONGTYPE` error | DB index conflict | Set `REDIS_DB=1` for DA Engine |
| Clerk webhook 400 | Wrong secret | Verify `CLERK_WEBHOOK_SECRET` matches Clerk dashboard |
| 502 Bad Gateway on Railway | Cold start | Railway free tier sleeps after inactivity; add a keep-alive ping |
| `ECONNREFUSED` to backend | Backend not healthy | Check Railway service logs, verify health endpoint |

### Health Check Endpoints

```bash
# WMS Backend
curl https://wms-backend-production.up.railway.app/api/health

# DA Engine
curl https://da-engine-production.up.railway.app/api/health

# TimescaleDB
psql "postgresql://..." -c "SELECT version();"

# Redis
redis-cli -u "rediss://..." ping

# Neon PostgreSQL
psql "postgresql://..." -c "SELECT 1;"
```

---

## Scaling Path (When Free Tier Isn't Enough)

| Component | Free Tier Limit | Upgrade Path | Cost |
|---|---|---|---|
| Vercel | 100GB bandwidth | Pro plan | $20/mo |
| Railway | $5 credit | Developer plan | $5/mo + usage |
| Upstash | 10K commands/day | Pay-As-You-Go | ~$0.2/100K cmds |
| Neon | 0.5GB storage | Launch plan | $19/mo |
| Timescale Cloud | 1GB storage | 1-node plan | $29/mo |
| HiveMQ Cloud | 100 connections | Essential plan | $0.025/hr |

### Alternative: Oracle Cloud Free Tier (All-in-One)

Oracle Cloud offers **永久免费 (Always Free)** resources:
- 4 ARM OCPUs + 24GB RAM
- 200GB block storage
- 10GB object storage
- 2 AMD instances (1/8 OPU each)

Deploy all Docker containers on a single Oracle Cloud VM:
```bash
# SSH into Oracle Cloud VM
ssh -i key.pem opc@your-ip

# Clone repo
git clone https://github.com/your-repo/Fullstack_Unification.git
cd Fullstack_Unification

# Deploy with root docker-compose
docker-compose up -d --build
```

This gives you full control, no cold starts, and $0/month cost.

---

## Security Checklist

- [ ] All secrets stored in environment variables (never in code)
- [ ] TLS enabled on all public endpoints
- [ ] CORS restricted to your domain only
- [ ] Rate limiting configured on all API endpoints
- [ ] JWT access token expiry ≤ 15 minutes
- [ ] Refresh token rotation enabled
- [ ] MQTT mTLS configured for device authentication
- [ ] Database connections use SSL mode
- [ ] Redis connections use TLS (`rediss://`)
- [ ] Audit logging enabled on all write operations
- [ ] Wazuh SIEM monitoring active (if self-hosting)
- [ ] Docker secrets used for sensitive values (if self-hosting)

---

## Quick Start Commands

```bash
# ─── Clone & Setup ──────────────────────────────────────
git clone https://github.com/your-repo/Fullstack_Unification.git
cd Fullstack_Unification

# ─── Frontend (Vercel) ──────────────────────────────────
cd aai-unified-portal
npm install
npm run build          # Verify build works
vercel --prod          # Deploy

# ─── WMS Backend (Railway) ─────────────────────────────
cd ../aai-wms-backend
pip install -r requirements.txt
railway up

# ─── DA Engine (Railway) ────────────────────────────────
cd ../da-engine
pip install -r requirements.txt
railway up

# ─── All-in-One (Docker on VPS) ────────────────────────
cd ..
docker-compose up -d --build
docker-compose ps     # Check all services
docker-compose logs -f  # Watch logs
```
