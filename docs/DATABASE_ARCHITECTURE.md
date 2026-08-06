# Database Architecture — 3-DB Design

## Overview

The system uses **3 separate databases** across 3 subsystems:

```
┌─────────────────────────────────────────────────────────────┐
│                     NEON POSTGRESQL                          │
│                  (Cloud — Serverless)                        │
│                                                             │
│  Auth & Config (source of truth):                           │
│    app_users, audit_logs, system_logs,                      │
│    system_settings, reports                                 │
│                                                             │
│  Fallback Data (read-only when DA Engine offline):          │
│    terminals, levels, washroom_units,                       │
│    washroom_state, incidents, incident_timeline,            │
│    whi_history, maintenance_issues                          │
│                                                             │
│  Legacy Tables (old schema):                                │
│    washrooms, stalls, devices, whi_snapshots,               │
│    heatmap_zones                                            │
└───────────────────────┬─────────────────────────────────────┘
                        │ Direct SQL (Drizzle ORM)
                        │ from Next.js Server
┌───────────────────────▼─────────────────────────────────────┐
│                 NEXT.JS PORTAL (Port 3000)                   │
│                                                             │
│  Primary: DA Engine API  ──────┐                            │
│  Fallback: Neon PostgreSQL     │  ┌─── WMS Backend API      │
│  Auth: Clerk + Neon            ├──┤   (JWT auth)            │
│  WebSocket: DA Engine + WMS    │  └─────────────────        │
└────────────────────────────────┼────────────────────────────┘
                                 │
    ┌────────────────────────────┼────────────────────────────┐
    │                            │                            │
    ▼                            ▼                            ▼
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ DA ENGINE   │     │  TIMESCALEDB     │     │  REDIS           │
│ (Port 8001) │────▶│  (Docker)        │     │  (Docker)        │
│             │     │  Port 5433:5432  │     │  Port 6389:6379  │
│ In-memory   │     │                  │     │                  │
│ cache +     │     │  4 hypertables:  │     │  Token buckets,  │
│ Redis cache │     │  - telemetry     │     │  state machines, │
│             │     │  - incidents     │     │  floor status,   │
│ Writes via  │     │  - escalations   │     │  JWT refresh     │
│ Telemetry   │     │  - audit         │     │  tokens          │
│ Bridge      │     │                  │     │                  │
│ (COPY       │     │  2 continuous    │     │  DA Engine:      │
│  protocol)  │     │  aggregates:     │     │  DB 1 (cache)    │
│             │     │  - hourly WHI    │     │                  │
└──────┬──────┘     │  - daily WHI     │     └──────────────────┘
       │            └──────────────────┘
       │            ┌──────────────────┐
       │            │  WMS BACKEND     │
       │            │  (Port 443)      │
       └───────────▶│  FastAPI +       │
                    │  MQTT + Workers  │
                    └──────────────────┘
```

## How the 3 DBs Connect

### 1. Neon PostgreSQL (Frontend)
- **Connection**: Direct HTTP via `@neondatabase/serverless` driver
- **URL**: `postgresql://neondb_owner:...@ep-nameless-brook-....us-east-1.aws.neon.tech/neondb?sslmode=require`
- **Used by**: Next.js server-side API routes (Drizzle ORM)
- **Data**: Auth (app_users), config, fallback telemetry, incidents, reports

### 2. TimescaleDB (WMS Backend — Docker)
- **Connection**: `asyncpg` connection pool via `aai_app_worker` role
- **Docker URL**: `postgresql://postgres:6cdab6f3d5270c9739ba920d3e0b2016@washroom-timescaledb:5432/washroom_db`
- **Host access**: `localhost:5433` (mapped from container port 5432)
- **Used by**: WMS Backend (writes), DA Engine TelemetryBridge (writes)
- **Data**: Time-series telemetry, incidents, escalations, audit trail

### 3. Redis (WMS Backend — Docker)
- **Connection**: `redis://washroom-redis:6379/1` (Docker) or `redis://localhost:6389/1` (host)
- **Used by**: WMS Backend (state machines, rate limiting), DA Engine (cache persistence)
- **Data**: Incident states, floor status, rate limiters, JWT tokens, DA Engine cache

## Data Flow: How Data Moves

### Primary Flow (Normal Operation)
```
IoT Sensors → MQTT → WMS Backend → TimescaleDB
                                       ↓
DA Engine TelemetryBridge (30s sync) → Reads TimescaleDB
                                       ↓
DA Engine Cache → WebSocket → Next.js Server → Browser
```

### DA Engine → Next.js (REST)
```
Browser → /api/da/summary → Next.js Server → http://localhost:8001/api/dashboard/summary
                                              (DA Engine reads from in-memory cache)
```

### WMS Backend → Next.js (REST + JWT)
```
Browser → /api/wms/status → Next.js Server → wmsClient.ts → https://localhost:443/dashboard/status
                                                (JWT auth with operator credentials)
```

### Direct DB Fallback (When DA Engine is offline)
```
Browser → /api/terminals → Next.js Server → Drizzle ORM → Neon PostgreSQL
                                                            (read from fallback tables)
```

## Docker Networking

The WMS Backend runs 10 containers on 3 Docker networks:

| Network | Subnet | Containers |
|---------|--------|-----------|
| `frontend` | 172.20.1.0/24 | EMQX (x3), HAProxy (x2), Keepalived (x2) |
| `backend` | 172.20.2.0/24 | EMQX (x3), HAProxy (x2), FastAPI |
| `data` | 172.20.3.0/24 | FastAPI, Redis, TimescaleDB, DA Engine |

**DA Engine** joins the `data` network as an external container to access:
- `washroom-timescaledb:5432` (PostgreSQL)
- `washroom-redis:6379` (Redis)

**From host machine:**
- TimescaleDB: `localhost:5433` → container `5432`
- Redis: `localhost:6389` → container `6379`
- WMS API: `localhost:443` → HAProxy → FastAPI `8000`

## Port Map

| Port | Service | Protocol | Access From |
|------|---------|----------|-------------|
| 3000 | Next.js Portal | HTTP | Browser |
| 443 | WMS Backend (HAProxy) | HTTPS | Next.js server |
| 5433 | TimescaleDB | PostgreSQL | DA Engine (Docker), host |
| 6389 | Redis | Redis | DA Engine (Docker), host |
| 8001 | DA Engine | HTTP | Next.js server |
| 8883 | MQTT (mTLS) | MQTT/TLS | IoT devices |
| 18083 | EMQX Dashboard | HTTPS | Browser |
