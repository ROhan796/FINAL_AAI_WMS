# Makefile.md — 3DB Cloud Architecture & Deployment Guide

## Table of Contents

- [1. Architecture Overview](#1-architecture-overview)
- [2. 3DB Architecture Design](#2-3db-architecture-design)
- [3. Cloud Project Organization](#3-cloud-project-organization)
- [4. Cloud Hosting Strategy](#4-cloud-hosting-strategy)
- [5. Component Wiring & Connections](#5-component-wiring--connections)
- [6. Webhook Flow](#6-webhook-flow)
- [7. Feature-to-Engine Mapping](#7-feature-to-engine-mapping)
- [8. Environment Variables Reference](#8-environment-variables-reference)
- [9. Deployment Commands](#9-deployment-commands)
- [10. Port Map & Network Topology](#10-port-map--network-topology)
- [11. Verification & Health Checks](#11-verification--health-checks)
- [12. Automation vs Manual Configuration](#12-automation-vs-manual-configuration)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AAI Smart Washroom — 3DB Cloud Architecture              │
│                                                                             │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────────────────┐   │
│  │  IoT Sensors  │    │ NSCBI API    │    │ Clerk Authentication        │   │
│  │  (Pico W)     │    │ (External)   │    │ (Svix Webhooks)             │   │
│  └──────┬───────┘    └──────┬───────┘    └──────────────┬───────────────┘   │
│         │ MQTT mTLS         │ HTTP/REST                 │ Webhook POST      │
│         ▼                   ▼                           ▼                   │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     EMQX Cloud (emqx.com)                            │   │
│  │                  Managed MQTT Cluster + ENV vars                     │   │
│  └──────────────────────────────┬───────────────────────────────────────┘   │
│                                 │                                           │
│  ┌──────────────────────────────▼───────────────────────────────────────┐   │
│  │                    HAProxy (Local Docker)                             │   │
│  │                  SSL Termination + Load Balancing                     │   │
│  │                  Ports: 8883 (MQTT) | 443 (API) | 18083 (Dash)      │   │
│  └──────────────────────────────┬───────────────────────────────────────┘   │
│                                 │                                           │
│  ┌──────────────────────────────▼───────────────────────────────────────┐   │
│  │                     WMS Backend (FastAPI)                             │   │
│  │                  Incident Engine + Escalation + MQTT Worker           │   │
│  └────────────┬────────────────────────────────────┬────────────────────┘   │
│               │                                    │                        │
│  ┌────────────▼────────────┐        ┌──────────────▼──────────────────┐    │
│  │   NeonDB (Cloud)        │        │   TimescaleDB (NeonDB)           │    │
│  │   PostgreSQL             │        │   + TimescaleDB Extension        │    │
│  │                         │        │                                  │    │
│  │  PRIMARY:               │        │  HYPERTABLES:                    │    │
│  │  - app_users            │        │  - washroom_telemetry (90d)      │    │
│  │  - audit_logs           │        │  - incident_events (1y)          │    │
│  │  - system_logs          │        │  - floor_escalation_events (1y)  │    │
│  │  - system_settings      │        │  - raw_telemetry_audit (14d)     │    │
│  │                         │        │  - users (unlimited)             │    │
│  │  FALLBACK:              │        │                                  │    │
│  │  - terminals            │        │  CONTINUOUS AGGREGATES:           │    │
│  │  - levels               │        │  - whi_hourly_summary (5min)     │    │
│  │  - washroom_units       │        │  - whi_daily_summary (10min)     │    │
│  │  - washroom_state       │        │                                  │    │
│  │  - incidents            │        │  Connection: asyncpg pool         │    │
│  │  - incident_timeline    │        │  Role: aai_app_worker             │    │
│  │  - whi_history          │        │                                  │    │
│  │  - maintenance_issues   │        │                                  │    │
│  │                         │        │                                  │    │
│  │  Connection: Neon       │        │                                  │    │
│  │  serverless driver      │        │                                  │    │
│  └────────────┬────────────┘        └──────────────┬──────────────────┘    │
│               │                                    │                        │
│  ┌────────────▼────────────┐        ┌──────────────▼──────────────────┐    │
│  │   Upstash Redis          │        │   Next.js Portal (Vercel)        │    │
│  │   (Cloud)                │        │   Port 3000                      │    │
│  │                         │        │                                  │    │
│  │  DB 0:                   │        │  Dual WebSocket Proxy:           │    │
│  │  - State machines        │        │  - /ws -> DA Engine (8001)       │    │
│  │  - Rate limiters         │        │  - /wms/ws -> WMS Backend (443)  │    │
│  │  - JWT refresh tokens    │        │                                  │    │
│  │  - Floor status          │        │  ISR-cached proxy routes:        │    │
│  │                         │        │  - /api/da/* (30s revalidate)     │    │
│  │  DB 1:                   │        │  - /api/wms/* (JWT auth)         │    │
│  │  - Telemetry cache       │        │                                  │    │
│  │  - Active incidents      │        │  Clerk Webhook Handler:          │    │
│  │  - Airport summary       │        │  - /api/webhooks/clerk           │    │
│  │                         │        │  - user.created/updated/deleted   │    │
│  │  Connection: Upstash     │        │  - session.created               │    │
│  │  REST API + Redis CLI    │        │                                  │    │
│  └─────────────────────────┘        └──────────────────────────────────┘    │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     DA Engine (FastAPI)                               │   │
│  │                  Port 8001 | APScheduler (30s poll)                  │   │
│  │                                                                     │   │
│  │  NSCBI API Client -> Normalize -> WHI Calculator -> Incident Det    │   │
│  │       -> TelemetryBridge (COPY protocol) -> TimescaleDB             │   │
│  │       -> Cache + Upstash Redis persistence                          │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                     Flask Authentication (Optional)                   │   │
│  │                  Lightweight auth microservice                        │   │
│  │                  JWT validation + Role-based access                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. 3DB Architecture Design

### DB1: NeonDB PostgreSQL (Cloud — Serverless)

| Aspect | Details |
|--------|---------|
| **Provider** | NeonDB (neon.tech) |
| **Driver** | `@neondatabase/serverless` (HTTP) |
| **ORM** | Drizzle ORM 0.45.2 |
| **Used By** | Next.js Portal (server-side API routes) |
| **Access** | Direct SQL over HTTPS (no TCP connection) |

**Primary Tables (Auth + Config):**
```
app_users          — User accounts (Clerk sync)
audit_logs         — System audit trail
system_logs        — Application logs
system_settings    — Runtime configuration
reports            — Generated reports
```

**Fallback Tables (DA Engine Mirror):**
```
terminals          — Airport terminal definitions
levels             — Floor level definitions
washroom_units     — Device registry (54 units)
washroom_state     — Last-known device state
incidents          — Active incident records
incident_timeline  — Incident history
whi_history        — WHI score history
maintenance_issues — Maintenance tickets
```

**Connection String:**
```
postgresql://neondb_owner:...@ep-XXXX.us-east-1.aws.neon.tech/neondb?sslmode=require
```

### DB2: TimescaleDB on NeonDB (Cloud — Managed)

| Aspect | Details |
|--------|---------|
| **Provider** | NeonDB with TimescaleDB extension |
| **Driver** | `asyncpg` (Python) |
| **Used By** | WMS Backend (writes), DA Engine TelemetryBridge (writes) |
| **Access** | TCP connection pool (aai_app_worker role) |

**Hypertables (Time-Partitioned):**
```
washroom_telemetry          — 90-day retention, time-partitioned sensor data
incident_events             — 1-year retention, immutable state transitions
floor_escalation_events     — 1-year retention, floor-level escalation log
raw_telemetry_audit         — 14-day retention, raw MQTT audit trail
users                       — Unlimited retention, auth credentials
```

**Continuous Aggregates:**
```
whi_hourly_summary          — Refreshed every 5 minutes, 1-year retention
whi_daily_summary           — Refreshed every 10 minutes, 2-year retention
```

**Connection String:**
```
postgresql://aai_app_worker:...@ep-XXXX.us-east-1.aws.neon.tech/timescaledb?sslmode=require
```

### DB3: Upstash Redis (Cloud — Serverless)

| Aspect | Details |
|--------|---------|
| **Provider** | Upstash (upstash.com) |
| **Protocol** | Redis CLI over TLS (REST API available) |
| **Used By** | WMS Backend (state machines), DA Engine (cache persistence) |
| **Access** | `rediss://default:...@xxxx.upstash.io:6379` |

**DB 0 — WMS Backend:**
```
Incident state machines     — NORMAL -> PENDING -> ACTIVE -> RESOLVED
Lua token bucket rate limit — 10 msgs/60s per device
JWT refresh tokens          — Rotation with expiry
Floor status cache          — FLOOR_NORMAL / FLOOR_CRITICAL
```

**DB 1 — DA Engine:**
```
Telemetry cache (300s TTL)  — In-memory backup for crash recovery
Active incidents            — Current incident set
Airport summary             — Rollup KPIs
```

**Connection String:**
```
rediss://default:...@xxxx.upstash.io:6379
```

---

## 3. Cloud Project Organization

### Core Principle: One Project Per Platform, Not Per Service

Each cloud **platform** gets exactly one project. Inside that project, you use databases, indexes, or services to separate concerns. You do **NOT** create a separate Neon project for WMS and another for DA Engine. You do **NOT** create separate Redis databases on different platforms.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CLOUD PROJECT ORGANIZATION MAP                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PLATFORM          PROJECT NAME           WHAT'S INSIDE                     │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  neon.tech         aai-washroom          ├── Database 1: neondb             │
│  (PostgreSQL)                              │   └── Portal auth, audit logs,  │
│                                           │       system settings, fallback  │
│                                           │       data tables (16 total)     │
│                                           │                                 │
│                                           └── Database 2: timescaledb       │
│                                               └── WMS backend data          │
│                                                   ├── Hypertables (4)       │
│                                                   ├── Continuous aggs (2)   │
│                                                   └── Users table           │
│                                                                             │
│  upstash.com        aai-washroom          ├── DB 0: WMS Backend             │
│  (Redis)                                      │   ├── JWT refresh tokens     │
│                                           │   ├── Incident state machines   │
│                                           │   ├── Rate limit token buckets  │
│                                           │   └── Floor status cache        │
│                                           │                                 │
│                                           └── DB 1: DA Engine               │
│                                               ├── Telemetry cache           │
│                                               ├── Active incidents          │
│                                               └── Airport summary           │
│                                                                             │
│  emqx.com           aai-washroom          ├── MQTT endpoint (1 cluster)     │
│  (MQTT Broker)                              ├── ACL rules for devices       │
│                                           ├── ACL rules for backend         │
│                                           └── Dashboard (admin)             │
│                                                                             │
│  clerk.com          aai-washroom          ├── Auth app (1 app)              │
│  (Authentication)                           ├── Webhook → Vercel URL        │
│                                           ├── Events: user.created, etc.    │
│                                           └── Roles: ADMIN, TERMINAL, AUDIT│
│                                                                             │
│  vercel.com         aai-washroom          ├── 1 project                     │
│  (Frontend)                                  └── aai-unified-portal/        │
│                                               (Next.js 16 + Clerk + Drizzle)│
│                                                                             │
│  railway.app        aai-washroom          ├── 1 project                     │
│  (Backend Hosting)                           ├── Service 1: wms-backend     │
│                                           │   └── FastAPI + MQTT + Workers  │
│                                           └── Service 2: da-engine         │
│                                               └── FastAPI + APScheduler     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Database Separation Within Platforms

#### Neon PostgreSQL — Two Databases, One Project

You do NOT need two Neon projects. Within your single Neon project:

```sql
-- Database 1: neondb (default, already created)
-- Used by: Next.js Portal via Drizzle ORM
-- Tables: app_users, audit_logs, system_logs, system_settings, + 12 fallback tables

-- Database 2: timescaledb (create within same Neon project)
-- Used by: WMS Backend + DA Engine via asyncpg
-- Tables: washroom_telemetry, incident_events, floor_escalation_events, raw_telemetry_audit, users

-- To create the second database, run in Neon SQL Console:
CREATE DATABASE timescaledb;

-- Then connect to timescaledb and enable the extension:
\c timescaledb
CREATE EXTENSION IF NOT EXISTS timescaledb;
```

#### Upstash Redis — Two DB Indexes, One Instance

You do NOT need two Redis instances. Within your single Upstash database:

| DB Index | Consumer | What It Stores |
|---|---|---|
| DB 0 | WMS Backend | JWT tokens, incident state, rate limits, floor status |
| DB 1 | DA Engine | Telemetry cache, active incidents, airport summary |

Connection strings:
```
# WMS Backend
REDIS_URL=rediss://default:...@xxxx.upstash.io/0

# DA Engine
REDIS_URL=rediss://default:...@xxxx.upstash.io/1
```

#### Railway — Two Services, One Project

Within your single Railway project `aai-washroom`:

```
aai-washroom (Railway Project)
├── wms-backend (Service)
│   ├── Source: aai-wms-backend/ directory
│   ├── Dockerfile: aai-wms-backend/Dockerfile
│   ├── Port: 8000
│   └── Env vars: DATABASE_URL, REDIS_URL (DB 0), MQTT_*, JWT_*
│
└── da-engine (Service)
    ├── Source: da-engine/ directory
    ├── Dockerfile: da-engine/Dockerfile
    ├── Port: 8001
    └── Env vars: DATABASE_URL, REDIS_URL (DB 1), NSCBI_*
```

Each service gets its own Railway subdomain:
- `wms-backend-production.up.railway.app`
- `da-engine-production.up.railway.app`

### Why NOT Separate Projects?

| Approach | Problem |
|---|---|
| Separate Neon projects for portal vs WMS | Wastes free tier quota (0.5GB each), harder to cross-query, double the billing dashboard |
| Separate Upstash databases | Double the connection overhead, double the free tier limit hit, harder to monitor |
| Separate Railway projects | Double the build minutes, no shared environment variables, harder to coordinate deploys |
| One giant Railway project for everything | Couples portal + backend deploys, one bad deploy kills everything |

### The 6 Dashboards You'll Touch (One-Time, ~18 minutes)

```
┌─────┬──────────────┬──────────────────────────────────────────────────────────┐
│  #  │ Platform     │ One-Time Action                                          │
├─────┼──────────────┼──────────────────────────────────────────────────────────┤
│  1  │ neon.tech    │ Create project → 2 databases → Enable TimescaleDB ext    │
│  2  │ upstash.com  │ Create 1 Redis DB → Note connection URL                  │
│  3  │ emqx.com     │ Create cluster → Configure ACL rules → Note MQTT endpoint│
│  4  │ clerk.com    │ Create app → Set webhook URL + events → Note secret      │
│  5  │ vercel.com   │ Import GitHub repo → Set env vars → Deploy               │
│  6  │ railway.app  │ Create project → Add 2 services → Set env vars           │
└─────┴──────────────┴──────────────────────────────────────────────────────────┘

TOTAL MANUAL TIME: ~18 minutes one-time
AFTER SETUP: git push → auto-deploy → done
```

### Environment Variable Summary Per Platform

#### Vercel (Frontend)
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY    → from Clerk
CLERK_SECRET_KEY                     → from Clerk
CLERK_WEBHOOK_SECRET                 → from Clerk
DATABASE_URL                         → from Neon (neondb)
NEXT_PUBLIC_DA_ENGINE_URL            → from Railway (da-engine service)
NEXT_PUBLIC_WMS_API_URL              → from Railway (wms-backend service)
```

#### Railway — WMS Backend Service
```
DATABASE_URL          → from Neon (timescaledb)
REDIS_URL             → from Upstash (DB 0)
MQTT_BROKER_URL       → from EMQX Cloud
JWT_SECRET_KEY        → auto-generate
CORS_ORIGINS          → Vercel URL
```

#### Railway — DA Engine Service
```
DATABASE_URL          → from Neon (timescaledb)
REDIS_URL             → from Upstash (DB 1)
NSCBI_API_BASE_URL    → external API
CORS_ORIGINS          → Vercel URL
```

---

## 4. Cloud Hosting Strategy

### Component Placement

| Component | Hosting | Why |
|-----------|---------|-----|
| **NeonDB PostgreSQL** | NeonDB Cloud | Already configured, serverless, auto-scaling |
| **TimescaleDB** | NeonDB + TimescaleDB Extension | Managed, no Docker needed |
| **Upstash Redis** | Upstash Cloud | Serverless, pay-per-command, global replication |
| **EMQX MQTT** | EMQX Cloud (emqx.com) | Managed MQTT, auto-clustering, ENV vars |
| **HAProxy** | Local Docker | SSL termination, mTLS for IoT devices |
| **WMS Backend** | Local Docker / Cloud VM | 10-container stack (simplified to FastAPI only) |
| **DA Engine** | Local Docker / Cloud VM | Single container |
| **Next.js Portal** | Vercel / Local | Serverless functions, ISR caching |
| **Flask Auth** | Local / Cloud Run | Lightweight microservice |

### Cloud vs Local Decision Matrix

```
┌─────────────────┬──────────────────┬──────────────────┬─────────────────────┐
│ Component       │ Cloud Mode       │ Local Mode       │ Switch Variable     │
├─────────────────┼──────────────────┼──────────────────┼─────────────────────┤
│ NeonDB PG       │ NeonDB URL       │ Docker PG        │ DATABASE_URL        │
│ TimescaleDB     │ NeonDB+Extension │ Docker TSDB      │ WMS_PG_HOST         │
│ Redis           │ Upstash URL      │ Docker Redis     │ REDIS_HOST          │
│ EMQX            │ emqx.com cluster │ Docker EMQX x3   │ MQTT_HOST           │
│ HAProxy         │ N/A (always local)│ Docker HAProxy   │ — (always Docker)   │
│ WMS Backend     │ Cloud VM / ECS   │ Docker Compose   │ DEPLOY_MODE         │
│ DA Engine       │ Railway / ECS    │ Docker / uvicorn │ DA_ENGINE_HOST       │
│ Next.js         │ Vercel           │ npm run dev      │ DEPLOY_MODE         │
│ Flask Auth      │ Cloud Run        │ Local venv       │ AUTH_MODE           │
└─────────────────┴──────────────────┴──────────────────┴─────────────────────┘
```

### EMQX Cloud Configuration

Instead of running 3 Docker EMQX containers, use EMQX Cloud:

```bash
# EMQX Cloud ENV Variables (from emqx.com dashboard)
EMQX_CLOUD_HOST=your-cluster.emqxsl.cn
EMQX_CLOUD_PORT=8883          # MQTT over TLS
EMQX_CLOUD_DASHBOARD_PORT=18083
EMQX_CLOUD_USERNAME=your_api_key
EMQX_CLOUD_PASSWORD=your_api_secret

# MQTT Topics (same as local)
MQTT_TOPIC_TELEMETRY=washroom/+/+/telemetry
MQTT_TOPIC_COMMAND=washroom/+/+/command
MQTT_TOPIC_STATUS=washroom/+/+/status
```

### Upstash Redis Configuration

```bash
# Upstash Redis ENV Variables (from upstash.com dashboard)
UPSTASH_REDIS_URL=rediss://default:...@xxxx.upstash.io:6379
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_rest_token

# For WMS Backend (DB 0)
REDIS_URL=rediss://default:...@xxxx.upstash.io/0

# For DA Engine (DB 1)
REDIS_HOST=xxxx.upstash.io
REDIS_PORT=6379
REDIS_DB=1
REDIS_PASSWORD=...
```

### NeonDB TimescaleDB Configuration

```bash
# NeonDB with TimescaleDB Extension (from neon.tech dashboard)
TIMESCALE_HOST=ep-XXXX.us-east-1.aws.neon.tech
TIMESCALE_PORT=5432
TIMESCALE_DB=timescaledb
TIMESCALE_USER=aai_app_worker
TIMESCALE_PASSWORD=...
TIMESCALE_SSLMODE=require

# Enable TimescaleDB extension (run once)
# ALTER DATABASE timescaledb SET timescaledb.enable_deprecation_warnings = off;
# CREATE EXTENSION IF NOT EXISTS timescaledb;
```

---

## 5. Component Wiring & Connections

### How Each Component Connects

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONNECTION MAP                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. IoT Sensors ──MQTT mTLS:8883──> EMQX Cloud ──> HAProxy (Docker)        │
│                                                         │                   │
│                                                         ▼                   │
│                                                   WMS Backend (FastAPI)     │
│                                                         │                   │
│                                            ┌────────────┼────────────┐      │
│                                            ▼            ▼            ▼      │
│                                     TimescaleDB    Upstash Redis    JWT     │
│                                     (NeonDB)       (Cloud)         Tokens  │
│                                                                             │
│  2. NSCBI API ──HTTP:30s poll──> DA Engine (FastAPI, Port 8001)            │
│                                            │                               │
│                                   ┌────────┼────────┐                      │
│                                   ▼        ▼        ▼                      │
│                            TelemetryBridge  Cache  WebSocket               │
│                                   │        │        │                      │
│                                   ▼        ▼        ▼                      │
│                            TimescaleDB  Upstash   Next.js Portal           │
│                            (NeonDB)     Redis     (Port 3000)              │
│                                                                             │
│  3. Clerk Auth ──Webhook POST──> Next.js /api/webhooks/clerk               │
│                                            │                               │
│                                            ▼                               │
│                                     NeonDB PostgreSQL                       │
│                                     (app_users table)                       │
│                                                                             │
│  4. Browser ──HTTPS──> Next.js Portal (Port 3000)                           │
│                           │                                                 │
│                    ┌──────┼──────────────────┐                             │
│                    ▼      ▼                  ▼                             │
│              Clerk Auth  DA Engine Proxy  WMS Backend Proxy                │
│              (Session)   (ISR cached)     (JWT auth)                       │
│                             │                  │                           │
│                             ▼                  ▼                           │
│                      DA Engine (8001)   WMS Backend (443)                   │
│                             │                  │                           │
│                             ▼                  ▼                           │
│                      Upstash Redis      TimescaleDB + Upstash              │
│                                                                             │
│  5. WebSocket Dual Connections:                                              │
│     /ws ──> DA Engine (8001) ──> Telemetry, Incidents, Summary             │
│     /wms/ws ──> WMS Backend (443) ──> MQTT, Floor Status, New Incidents    │
│                                                                             │
│  6. Flask Auth (Optional Microservice):                                      │
│     JWT validation ──> NeonDB app_users ──> Role-based access               │
│     ABAC constraints ──> Zone + Shift rules ──> WMS Backend                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Connection Strings Summary

| From | To | Protocol | Connection String |
|------|----|----------|-------------------|
| Next.js | NeonDB PG | HTTPS | `postgresql://neondb_owner:...@ep-XXXX.neon.tech/neondb?sslmode=require` |
| WMS Backend | TimescaleDB | TCP | `postgresql://aai_app_worker:...@ep-XXXX.neon.tech/timescaledb?sslmode=require` |
| DA Engine | TimescaleDB | TCP | `postgresql://aai_app_worker:...@ep-XXXX.neon.tech/timescaledb?sslmode=require` |
| WMS Backend | Upstash Redis | TLS | `rediss://default:...@xxxx.upstash.io/0` |
| DA Engine | Upstash Redis | TLS | `rediss://default:...@xxxx.upstash.io/1` |
| WMS Backend | EMQX Cloud | mTLS | `mqtts://your-cluster.emqxsl.cn:8883` |
| IoT Sensors | EMQX Cloud | mTLS | `mqtts://your-cluster.emqxsl.cn:8883` |
| Next.js | DA Engine | HTTP | `http://localhost:8001` (or Railway URL) |
| Next.js | WMS Backend | HTTPS | `https://localhost:443` (via HAProxy Docker) |
| Clerk | Next.js | HTTPS | `POST /api/webhooks/clerk` |

---

## 6. Webhook Flow

### Clerk Authentication Webhook

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    CLERK WEBHOOK FLOW                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 1: User Signs Up (Clerk Hosted UI)                                    │
│  ───────────────────────────────────────                                    │
│  Browser → clerk.accounts.dev → User creates account                        │
│  Username pattern: AP-xxx (Admin), TP-xxx (Terminal), ALP-xxx (Auditor)    │
│                                                                             │
│  STEP 2: Clerk Sends Webhook to Next.js                                     │
│  ───────────────────────────────────────                                    │
│  POST https://your-domain.com/api/webhooks/clerk                            │
│  Headers:                                                                   │
│    svix-id: msg_xxxxx                                                       │
│    svix-timestamp: 1700000000                                               │
│    svix-signature: v1,xxxxxx                                                │
│  Body: { type: "user.created", data: { id, username, email, ... } }        │
│                                                                             │
│  STEP 3: Signature Verification (Svix)                                      │
│  ───────────────────────────────────────                                    │
│  Next.js route.ts → new Webhook(CLERK_WEBHOOK_SECRET)                       │
│  → wh.verify(payload, headers)                                              │
│  → Reject if invalid (400 Bad Request)                                      │
│                                                                             │
│  STEP 4: Role Detection                                                     │
│  ───────────────────────────────────────                                    │
│  detectRole(username, email):                                               │
│    /^AP-\d{3,}$/i → 'ADMIN'                                                │
│    /^TP-\d{3,}$/i → 'TERMINAL'                                             │
│    /^ALP-\d{3,}$/i → 'AUDITOR'                                             │
│    Fallback: email pattern matching → 'TERMINAL' (default)                  │
│                                                                             │
│  STEP 5: Clerk Metadata Update                                              │
│  ───────────────────────────────────────                                    │
│  clerkClient.users.updateUserMetadata(clerkId, {                            │
│    publicMetadata: { role: 'ADMIN' | 'TERMINAL' | 'AUDITOR' }              │
│  })                                                                         │
│                                                                             │
│  STEP 6: NeonDB Upsert (app_users)                                          │
│  ───────────────────────────────────────                                    │
│  db.insert(appUsers).values({                                               │
│    id: username, name, email, role, clerkId,                                │
│    status: 'ACTIVE', lastLogin, createdAt                                  │
│  }).onConflictDoUpdate({ target: clerkId, set: { name, email, role } })    │
│                                                                             │
│  STEP 7: Redirect to Role-Based Dashboard                                   │
│  ───────────────────────────────────────                                    │
│  POST /api/auth/redirect → 3-tier detection:                               │
│    1. Clerk publicMetadata.role (primary)                                   │
│    2. NeonDB app_users.role (fallback)                                      │
│    3. Email pattern matching (last resort)                                   │
│  → /admin/dashboard | /terminal/dashboard | /audit/dashboard               │
│                                                                             │
│  EVENTS HANDLED:                                                            │
│  ┌─────────────────┬──────────────────────────────────────────────────┐     │
│  │ Event           │ Action                                           │     │
│  ├─────────────────┼──────────────────────────────────────────────────┤     │
│  │ user.created    │ Detect role, set metadata, upsert app_users     │     │
│  │ user.updated    │ Update name/email/role in app_users             │     │
│  │ session.created │ Update lastLogin timestamp                       │     │
│  │ user.deleted    │ Set status to INACTIVE                           │     │
│  └─────────────────┴──────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### MQTT IoT Webhook (EMQX → WMS Backend)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    MQTT TELEMETRY FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 1: IoT Sensor Publishes                                               │
│  ───────────────────────────────────────                                    │
│  Topic: washroom/{terminal}/{level}/telemetry                               │
│  Payload: { device_id, ammonia_ppm, occupancy, soap_pct, ... }             │
│  Protocol: MQTT over TLS (mTLS, port 8883)                                  │
│                                                                             │
│  STEP 2: EMQX Cloud Routes via ACL                                           │
│  ───────────────────────────────────────                                    │
│  ACL Rules (acl.json):                                                      │
│    - { allow: true, user: "device_*", topic: "washroom/+/+/telemetry" }    │
│    - { allow: true, user: "backend", topic: "washroom/#" }                 │
│    - { deny: true, topic: "#" }                                             │
│                                                                             │
│  STEP 3: HAProxy SSL Termination                                            │
│  ───────────────────────────────────────                                    │
│  Frontend: ssl bind *:8883                                                   │
│  Backend: emqx1:1883, emqx2:1883, emqx3:1883                               │
│  Balance: roundrobin                                                         │
│                                                                             │
│  STEP 4: WMS Backend MQTTSubscriber                                         │
│  ───────────────────────────────────────                                    │
│  aiomqtt client → subscribe to washroom/+/+/telemetry                       │
│  → Rate Limiter (Redis Lua token bucket: 10 msgs/60s)                      │
│  → DualQueueRouter (alert → priority queue, normal → normal queue)         │
│                                                                             │
│  STEP 5: Incident Engine                                                    │
│  ───────────────────────────────────────                                    │
│  State Machine: NORMAL → PENDING_ALERT → ACTIVE_INCIDENT → RESOLVED        │
│  Debouncer: 3 consecutive breaches before state transition                  │
│                                                                             │
│  STEP 6: Escalation Engine                                                  │
│  ───────────────────────────────────────                                    │
│  Floor-level: 2+ active incidents → FLOOR_CRITICAL                         │
│  Triggers alert cascade to terminal operator dashboard                      │
│                                                                             │
│  STEP 7: TelemetryBatcher → TimescaleDB                                     │
│  ───────────────────────────────────────                                    │
│  Buffer in Redis → flush every 100 records or 5s                           │
│  COPY protocol → washroom_telemetry hypertable                              │
│  Raw audit → raw_telemetry_audit (14-day retention)                         │
│                                                                             │
│  STEP 8: WebSocket Broadcast to Frontend                                    │
│  ───────────────────────────────────────                                    │
│  wms_realtime_hub.broadcast() → /wms/ws                                     │
│  Events: mqtt:telemetry, floor_status:update, incident:new                  │
│  useRealtime() hook → React Query cache invalidation → UI update            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### DA Engine Polling Webhook (NSCBI → DA Engine → Frontend)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    DA ENGINE POLLING FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  STEP 1: APScheduler (30s interval)                                         │
│  ───────────────────────────────────────                                    │
│  Triggers poll_telemetry() coroutine                                        │
│                                                                             │
│  STEP 2: Parallel API Fetch                                                  │
│  ───────────────────────────────────────                                    │
│  asyncio.gather(*[fetch_device(id) for id in device_ids])                   │
│  httpx.AsyncClient → NSCBI Airport API                                      │
│  Rate limit: 60 req/min (token bucket)                                      │
│  Retry: Tenacity decorator (3 attempts, exponential backoff)                │
│                                                                             │
│  STEP 3: Ingestion Pipeline                                                 │
│  ───────────────────────────────────────                                    │
│  Raw JSON → orjson parse → Normalize → Quality Check → Schema Map          │
│  Quality: staleness (30s), range validation, dedup                         │
│                                                                             │
│  STEP 4: Analytics Pipeline                                                 │
│  ───────────────────────────────────────                                    │
│  WHI Calculator → Incident Detection (7 breach types)                       │
│  Circular History Buffer (100 records per device)                           │
│  Airport Summary Rollup                                                     │
│                                                                             │
│  STEP 5: Cache + Redis Persistence                                          │
│  ───────────────────────────────────────                                    │
│  In-memory cache → thread-safe dict                                         │
│  Redis DB 1 → persist every 60s (crash recovery)                           │
│  TTL: 300 seconds                                                           │
│                                                                             │
│  STEP 6: TelemetryBridge → TimescaleDB                                      │
│  ───────────────────────────────────────                                    │
│  30s interval → COPY protocol → washroom_telemetry                         │
│  Updates continuous aggregates (hourly, daily)                              │
│                                                                             │
│  STEP 7: WebSocket Push to Frontend                                         │
│  ───────────────────────────────────────                                    │
│  RealtimeHub.broadcast() → /ws                                              │
│  Events: telemetry:update, incidents:update, summary:update                 │
│  useRealtime() hook → React Query invalidation → UI re-render              │
│                                                                             │
│  STEP 8: REST API (ISR Cached by Next.js)                                   │
│  ───────────────────────────────────────                                    │
│  /api/da/summary → DA Engine (30s revalidate)                               │
│  /api/da/incidents → DA Engine (30s revalidate)                             │
│  /api/da/live-whi → DA Engine (30s revalidate)                              │
│  /api/da/trends → DA Engine (30s revalidate)                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. Feature-to-Engine Mapping

| Feature | Data Source | Engine | DB | Real-time |
|---------|------------|--------|-----|-----------|
| Live WHI Score | NSCBI API | DA Engine | Upstash Redis | WebSocket /ws |
| WHI History | NSCBI API | DA Engine | TimescaleDB | ISR 30s |
| Terminal Overview | NSCBI API | DA Engine | Upstash Redis | WebSocket /ws |
| Floor Heatmap | NSCBI API | DA Engine | Upstash Redis | WebSocket /ws |
| Incident List | NSCBI + MQTT | DA Engine + WMS | TimescaleDB | WebSocket /ws + /wms/ws |
| Incident Actions | MQTT Command | WMS Backend | Upstash Redis + TimescaleDB | WebSocket /wms/ws |
| Device Status | NSCBI API | DA Engine | Upstash Redis | WebSocket /ws |
| Occupancy Map | NSCBI API | DA Engine | Upstash Redis | WebSocket /ws |
| Supply Levels | NSCBI API | DA Engine | Upstash Redis | WebSocket /ws |
| Air Quality | NSCBI API | DA Engine | Upstash Redis | WebSocket /ws |
| Audit Logs | Clerk + App | Next.js | NeonDB PostgreSQL | — |
| User Management | Clerk | Next.js | NeonDB PostgreSQL | Clerk Webhook |
| System Settings | App Config | Next.js | NeonDB PostgreSQL | — |
| Reports | Aggregated | Next.js | NeonDB PostgreSQL | — |
| MQTT Telemetry | IoT Sensors | WMS Backend | TimescaleDB | WebSocket /wms/ws |
| Floor Escalation | MQTT Events | WMS Backend | TimescaleDB | WebSocket /wms/ws |
| Rate Limiting | IoT Sensors | WMS Backend | Upstash Redis | — |
| JWT Auth | Login | Clerk + Flask | NeonDB PostgreSQL | — |
| Role-Based Access | Login | Clerk + Flask | NeonDB PostgreSQL | — |
| ABAC Constraints | Login | Flask Auth | NeonDB PostgreSQL | — |
| SSE Fallback | NSCBI API | DA Engine | Upstash Redis | SSE /api/sse |

---

## 8. Environment Variables Reference

### Next.js Portal (.env.local)

```bash
# ── Clerk Authentication ──
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/api/auth/redirect
CLERK_WEBHOOK_SECRET=whsec_...

# ── NeonDB PostgreSQL ──
DATABASE_URL=postgresql://neondb_owner:...@ep-XXXX.neon.tech/neondb?sslmode=require

# ── DA Engine ──
NEXT_PUBLIC_DA_ENGINE_URL=http://localhost:8001
DA_ENGINE_URL=http://localhost:8001

# ── WMS Backend (via HAProxy) ──
NEXT_PUBLIC_WMS_API_URL=https://localhost:443
WMS_JWT_OPERATOR_USER=operator
WMS_JWT_OPERATOR_PASS=...
NODE_EXTRA_CA_CERTS=/path/to/aai-wms-backend/certs/ca/ca.crt
```

### WMS Backend (Docker Secrets + ENV)

```bash
# ── MQTT (EMQX Cloud or Docker) ──
MQTT_HOST=your-cluster.emqxsl.cn    # Cloud
# MQTT_HOST=172.20.1.10              # Docker (HAProxy VIP)
MQTT_PORT=8883
MQTT_USE_TLS=true

# ── TimescaleDB (NeonDB or Docker) ──
WMS_PG_HOST=ep-XXXX.neon.tech       # Cloud
# WMS_PG_HOST=washroom-timescaledb   # Docker
WMS_PG_PORT=5432
WMS_PG_DB=timescaledb
WMS_PG_USER=aai_app_worker
WMS_PG_PASSWORD=...

# ── Redis (Upstash or Docker) ──
REDIS_URL=rediss://default:...@xxxx.upstash.io/0  # Cloud
# REDIS_URL=redis://washroom-redis:6379/0          # Docker

# ── JWT ──
JWT_SECRET_KEY=...

# ── Docker Secrets (files) ──
# secrets/postgres_password.txt
# secrets/redis_password.txt
# secrets/jwt_secret_key.txt
# secrets/operator_password.txt
```

### DA Engine (.env)

```bash
# ── NSCBI API ──
NSCBI_API_BASE_URL=https://api.nscbiairport.com/api
NSCBI_API_KEY=...
NSCBI_DEVICE_IDS=T1-L1-PPM-002,T1-L1-PPF-003,...

# ── Server ──
DA_ENGINE_HOST=0.0.0.0
DA_ENGINE_PORT=8001

# ── Redis (Upstash or Docker) ──
REDIS_HOST=xxxx.upstash.io          # Cloud
# REDIS_HOST=localhost               # Docker
REDIS_PORT=6379
REDIS_DB=1
REDIS_PASSWORD=...
REDIS_CACHE_TTL=300

# ── TimescaleDB (NeonDB or Docker) ──
WMS_PG_HOST=ep-XXXX.neon.tech       # Cloud
# WMS_PG_HOST=localhost              # Docker
WMS_PG_PORT=5432
WMS_PG_DB=timescaledb
WMS_PG_USER=aai_app_worker
WMS_PG_PASSWORD=...
```

### EMQX Cloud (emqx.com)

```bash
# ── From EMQX Cloud Dashboard ──
EMQX_CLOUD_API_KEY=your_api_key
EMQX_CLOUD_API_SECRET=your_api_secret
EMQX_CLOUD_ENDPOINT=your-cluster.emqxsl.cn
EMQX_CLOUD_PORT=8883
EMQX_CLOUD_DASHBOARD_URL=https://your-cluster.emqxsl.cn:18083

# ── MQTT Connection ──
MQTT_BROKER=mqtts://your-cluster.emqxsl.cn:8883
MQTT_USERNAME=device_001
MQTT_PASSWORD=...
```

### Upstash Redis (upstash.com)

```bash
# ── From Upstash Dashboard ──
UPSTASH_REDIS_URL=rediss://default:...@xxxx.upstash.io:6379
UPSTASH_REDIS_REST_URL=https://xxxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=...
```

---

## 9. Deployment Commands

### Local Development (Docker)

```bash
# 1. Start WMS Backend (TimescaleDB + Redis only, no EMQX)
cd aai-wms-backend
docker compose -f docker-compose.local.yml up -d

# 2. Start DA Engine
cd ../da-engine
docker compose up -d

# 3. Start Next.js Portal
cd ../aai-unified-portal
npm install
npm run dev:ws
```

### Cloud Deployment

```bash
# 1. Set up NeonDB (portal + TimescaleDB extension)
#    - Create project at neon.tech
#    - Enable TimescaleDB extension
#    - Run db_init/01-init.sql

# 2. Set up Upstash Redis
#    - Create database at upstash.com
#    - Note the connection URL

# 3. Set up EMQX Cloud
#    - Create cluster at emqx.com
#    - Configure ACL rules
#    - Note API credentials

# 4. Deploy WMS Backend (FastAPI only, no Docker EMQX)
cd aai-wms-backend
# Update .env with cloud URLs
docker compose -f docker-compose.cloud.yml up -d

# 5. Deploy DA Engine
cd ../da-engine
# Update .env with cloud URLs
docker compose up -d

# 6. Deploy Next.js Portal
cd ../aai-unified-portal
# Update .env.local with cloud URLs
npm run build
npm run start:ws
# Or deploy to Vercel
```

### Production Checklist

```bash
# □ NeonDB project created + TimescaleDB extension enabled
# □ Upstash Redis database created
# □ EMQX Cloud cluster created + ACL configured
# □ Clerk webhook endpoint configured (https://your-domain.com/api/webhooks/clerk)
# □ Environment variables set in all services
# □ TLS certificates configured (HAProxy for local MQTT)
# □ Docker secrets generated (setup_security.sh)
# □ Database schema applied (01-init.sql on TimescaleDB)
# □ Drizzle migrations applied (npx drizzle-kit push)
# □ Health checks passing (all endpoints)
# □ WebSocket connections verified (/ws and /wms/ws)
# □ Webhook signature verification working (Clerk)
# □ Role-based access control tested (ADMIN, TERMINAL, AUDITOR)
# □ Incident state machine tested (5 states)
# □ Floor escalation tested (2+ incidents → FLOOR_CRITICAL)
```

---

## 10. Port Map & Network Topology

### Port Map

| Port | Service | Protocol | Access From | Mode |
|------|---------|----------|-------------|------|
| 3000 | Next.js Portal | HTTP | Browser | Always |
| 443 | WMS Backend (HAProxy) | HTTPS | Next.js server | Docker |
| 5432 | TimescaleDB (NeonDB) | PostgreSQL | WMS Backend, DA Engine | Cloud |
| 5433 | TimescaleDB (Docker) | PostgreSQL | WMS Backend, DA Engine | Docker |
| 6379 | Upstash Redis | Redis TLS | WMS Backend, DA Engine | Cloud |
| 6389 | Redis (Docker) | Redis | WMS Backend, DA Engine | Docker |
| 8001 | DA Engine | HTTP | Next.js server | Docker/Cloud |
| 8883 | MQTT (mTLS) | MQTT/TLS | IoT Devices | Cloud/Docker |
| 18083 | EMQX Dashboard | HTTPS | Browser | Cloud/Docker |

### Docker Networks (Local Mode)

```
┌─────────────────────────────────────────────────────────────────┐
│ Docker Network Topology (Local Mode)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  frontend (172.20.1.0/24)                                        │
│  ├── emqx1 (172.20.1.11)                                         │
│  ├── emqx2 (172.20.1.12)                                         │
│  ├── emqx3 (172.20.1.13)                                         │
│  ├── haproxy1 (172.20.1.100)                                     │
│  ├── haproxy2 (172.20.1.101)                                     │
│  └── keepalived (VIP: 172.20.1.10)                               │
│                                                                   │
│  backend (172.20.2.0/24)                                         │
│  ├── emqx1 (172.20.2.11)                                         │
│  ├── emqx2 (172.20.2.12)                                         │
│  ├── emqx3 (172.20.2.13)                                         │
│  ├── haproxy1 (172.20.2.100)                                     │
│  ├── haproxy2 (172.20.2.101)                                     │
│  └── fastapi (dynamic)                                            │
│                                                                   │
│  data (172.20.3.0/24)                                            │
│  ├── fastapi (dynamic)                                            │
│  ├── washroom-redis (dynamic)                                     │
│  ├── washroom-timescaledb (dynamic)                               │
│  └── da-engine (external, joins data network)                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Cloud Network (Production)

```
┌─────────────────────────────────────────────────────────────────┐
│ Cloud Network Topology (Production)                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Browser ──HTTPS──> Vercel (Next.js)                             │
│     │                                                            │
│     ├── Clerk Auth (hosted)                                      │
│     ├── Clerk Webhook ──POST──> Vercel /api/webhooks/clerk       │
│     │                                                            │
│     └── API Routes:                                              │
│         ├── /api/da/* ──HTTP──> DA Engine (Railway/Fly.io)      │
│         ├── /api/wms/* ──HTTPS──> HAProxy (Docker) ──> FastAPI   │
│         └── Direct ──HTTPS──> NeonDB PostgreSQL                  │
│                                                                   │
│  DA Engine (Railway/Fly.io)                                      │
│     ├── NSCBI API (external, HTTP)                               │
│     ├── Upstash Redis (TLS)                                      │
│     ├── NeonDB TimescaleDB (TCP, SSL)                            │
│     └── WebSocket ──WS──> Vercel /ws (proxy)                    │
│                                                                   │
│  WMS Backend (Docker on VM or ECS)                               │
│     ├── HAProxy (Docker, SSL termination)                        │
│     ├── FastAPI (Docker)                                         │
│     ├── Upstash Redis (TLS)                                      │
│     ├── NeonDB TimescaleDB (TCP, SSL)                            │
│     ├── EMQX Cloud (mTLS)                                       │
│     └── WebSocket ──WSS──> Vercel /wms/ws (proxy)              │
│                                                                   │
│  IoT Sensors                                                     │
│     └── MQTT mTLS ──> EMQX Cloud ──> WMS Backend               │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 11. Verification & Health Checks

### Endpoint Health Checks

```bash
# Next.js Portal
curl http://localhost:3000                    # Should return 200

# DA Engine
curl http://localhost:8001/health             # Should return {"status": "healthy"}

# WMS Backend (via HAProxy)
curl -k https://localhost:443/health          # Should return 200

# EMQX Dashboard
curl -k https://localhost:18083               # Should return EMQX login

# NeonDB PostgreSQL
psql "postgresql://...@ep-XXXX.neon.tech/neondb?sslmode=require" -c "SELECT 1"

# Upstash Redis
redis-cli -u rediss://...@xxxx.upstash.io ping  # Should return PONG

# TimescaleDB (NeonDB)
psql "postgresql://...@ep-XXXX.neon.tech/timescaledb?sslmode=require" -c "SELECT * FROM timescaledb_information.hypertables"
```

### WebSocket Verification

```bash
# DA Engine WebSocket
wscat -c ws://localhost:8001/ws
# Expected: connection open, events: telemetry:update, incidents:update

# WMS Backend WebSocket
wscat -c ws://localhost:443/ws
# Expected: connection open, events: mqtt:telemetry, floor_status:update

# Via Next.js Proxy
wscat -c ws://localhost:3000/ws               # Proxied to DA Engine
wscat -c ws://localhost:3000/wms/ws           # Proxied to WMS Backend
```

### Webhook Verification

```bash
# Test Clerk Webhook (with Svix signature)
curl -X POST http://localhost:3000/api/webhooks/clerk \
  -H "Content-Type: application/json" \
  -H "svix-id: test_msg_001" \
  -H "svix-timestamp: 1700000000" \
  -H "svix-signature: v1,test_signature" \
  -d '{"type":"user.created","data":{"id":"user_123","username":"AP-001","email_addresses":[{"email_address":"admin@aai.gov.in"}]}}'

# Expected: 200 { success: true, event: "user.created" }
```

### Database Verification

```bash
# NeonDB - Check app_users table
psql "$DATABASE_URL" -c "SELECT id, name, role, status FROM app_users LIMIT 5"

# TimescaleDB - Check hypertables
psql "$TIMESCALE_URL" -c "SELECT hypertable_name, num_chunks FROM timescaledb_information.hypertables"

# TimescaleDB - Check continuous aggregates
psql "$TIMESCALE_URL" -c "SELECT view_name FROM timescaledb_information.continuous_aggregates"

# Upstash Redis - Check keys
redis-cli -u "$REDIS_URL" KEYS "*" | head -20
```

### Docker Container Status

```bash
# WMS Backend containers
docker compose ps

# Expected:
# emqx1      running (healthy)
# emqx2      running (healthy)
# emqx3      running (healthy)
# haproxy1   running
# haproxy2   running
# keepalived1 running
# keepalived2 running
# fastapi    running (healthy)
# redis      running (healthy)
# timescaledb running (healthy)
```

---

## Appendix: Quick Start Commands

```bash
# ── Full Local Start ──
cd aai-wms-backend && docker compose -f docker-compose.local.yml up -d
cd ../da-engine && docker compose up -d
cd ../aai-unified-portal && npm run dev:ws

# ── Full Cloud Start ──
# Set environment variables first, then:
cd aai-wms-backend && docker compose -f docker-compose.cloud.yml up -d
cd ../da-engine && docker compose up -d
cd ../aai-unified-portal && npm run build && npm run start:ws

# ── Stop All ──
cd aai-wms-backend && docker compose down
cd ../da-engine && docker compose down
# Next.js: Ctrl+C in terminal

# ── Verify ──
curl http://localhost:3000
curl http://localhost:8001/health
curl -k https://localhost:443/health
```

---

## 12. Automation vs Manual Configuration

### What Gets Automated via Code (Push Commands → Done)

Once all environment variables are set, the following are fully automated:

| What | Command / Mechanism | Status |
|------|---------------------|--------|
| Schema creation (NeonDB) | `npx drizzle-kit push` | Automated |
| Schema creation (TimescaleDB) | `db_init/01-init.sql` runs on Docker start | Automated |
| Drizzle migrations | `npx drizzle-kit generate && npx drizzle-kit push` | Automated |
| Database connections | Connection strings in code — already wired | Automated |
| Data insert/read | ORM queries — all 50+ endpoints built | Automated |
| Real-time WebSocket | `server.ts` proxy + `useRealtime()` hook — built | Automated |
| Redis caching | DA Engine + WMS Backend code — built | Automated |
| All API routes | 50+ REST endpoints across 3 services | Automated |
| Webhook handlers | Clerk webhook route at `/api/webhooks/clerk` | Automated |
| Docker containers | `docker compose up -d` | Automated |
| Hypertable creation | TimescaleDB SQL init script | Automated |
| Continuous aggregates | TimescaleDB SQL init script | Automated |
| Incident state machine | WMS Backend `services/incident.py` | Automated |
| Floor escalation | WMS Backend `services/escalation.py` | Automated |
| WHI calculation | DA Engine `analytics/whi/calculator.py` | Automated |
| Telemetry batching | DA Engine `services/telemetry_bridge.py` (COPY protocol) | Automated |
| ISR caching (Next.js) | `revalidate: 30` on all `/api/da/*` routes | Automated |
| Role detection (Clerk) | `detectRole()` in webhook handler | Automated |
| JWT refresh rotation | WMS Backend `core/auth.py` | Automated |
| Rate limiting (Lua) | Redis Lua token bucket script | Automated |

### What Needs Manual Configuration (Your Hands)

> **Organization guide:** See [Section 3: Cloud Project Organization](#3-cloud-project-organization) for how projects map across platforms.

These require logging into dashboards and clicking buttons:

| What | Where | Steps | One-Time? |
|------|-------|-------|-----------|
| Create NeonDB project | [neon.tech](https://neon.tech) | Sign up → Create 1 project → Create 2 databases (neondb + timescaledb) → Copy connection strings | Yes |
| Enable TimescaleDB extension | NeonDB SQL Console | Connect to timescaledb → `CREATE EXTENSION IF NOT EXISTS timescaledb;` | Yes |
| Create Upstash Redis DB | [upstash.com](https://upstash.com) | Sign up → Create 1 database → Note DB 0 (WMS) and DB 1 (DA Engine) → Copy REST URL + token | Yes |
| Create EMQX Cloud cluster | [emqx.com](https://emqx.com) | Sign up → Create 1 cluster → Configure ACL rules → Copy API key + MQTT endpoint | Yes |
| Create Clerk application | [clerk.com](https://clerk.com) | Sign up → Create 1 app → Copy publishable + secret keys | Yes |
| Set Clerk webhook URL | Clerk Dashboard → Webhooks | Add endpoint: `https://your-domain.com/api/webhooks/clerk` | Yes |
| Select Clerk webhook events | Clerk Dashboard → Webhooks | Enable: `user.created`, `user.updated`, `session.created`, `user.deleted` | Yes |
| Copy Clerk webhook secret | Clerk Dashboard → Webhooks | Copy `whsec_...` signing secret | Yes |
| Generate TLS certs (local) | Terminal | Run `cd aai-wms-backend && bash setup_security.sh` | Yes |
| Create Vercel project | [vercel.com](https://vercel.com) | Import GitHub repo → Set env vars → Deploy | Yes |
| Create Railway project | [railway.app](https://railway.app) | Create 1 project → Add 2 services (wms-backend, da-engine) → Set env vars | Yes |
| Set env vars in Vercel | Vercel Dashboard → Settings → Environment Variables | Add all `NEXT_PUBLIC_*`, `CLERK_*`, `DATABASE_URL`, etc. | Yes |
| Set env vars in Railway | Railway Dashboard → Variables | Add `REDIS_HOST`, `WMS_PG_*`, `NSCBI_*`, etc. for each service | Yes |
| DNS / domain setup | Domain registrar | Point domain to Vercel/Railway IP | Yes |
| NeonDB SQL init (TimescaleDB) | NeonDB SQL Console | Run `db_init/01-init.sql` on timescaledb database | Yes |

### One-Time Setup Flow (Step by Step)

> **First-time?** Read [Section 3: Cloud Project Organization](#3-cloud-project-organization) to understand how projects are organized across platforms before starting.

```bash
STEP 1: Create Cloud Accounts (5 minutes)
──────────────────────────────────────────
□ neon.tech    → Create project, create 2 databases (neondb + timescaledb), copy DATABASE_URL
□ upstash.com  → Create 1 Redis DB, note DB 0 and DB 1 usage, copy REDIS_URL
□ emqx.com     → Create 1 cluster, configure ACL rules, copy MQTT endpoint + API creds
□ clerk.com    → Create 1 app, copy keys + webhook secret
□ vercel.com   → Import repo (don't deploy yet)
□ railway.app  → Create 1 project, add 2 services (wms-backend + da-engine)

STEP 2: Enable Extensions (2 minutes)
──────────────────────────────────────────
□ NeonDB SQL Console:
  CREATE EXTENSION IF NOT EXISTS timescaledb;

STEP 3: Run Schema Init (1 minute)
──────────────────────────────────────────
□ NeonDB SQL Console:
  -- Paste contents of aai-wms-backend/db_init/01-init.sql
  -- This creates hypertables + continuous aggregates

STEP 4: Configure Clerk Webhook (2 minutes)
──────────────────────────────────────────
□ Clerk Dashboard → Webhooks → Add Endpoint:
  URL: https://your-domain.com/api/webhooks/clerk
  Events: user.created, user.updated, session.created, user.deleted
  Copy the whsec_... signing secret

STEP 5: Set Environment Variables (5 minutes)
──────────────────────────────────────────
□ Local .env files (copy from .env.example, fill in cloud creds)
□ Vercel Dashboard → Settings → Environment Variables
□ Railway Dashboard → Variables (for DA Engine)

STEP 6: Deploy (3 minutes)
──────────────────────────────────────────
□ Vercel: Deploy (auto from GitHub)
□ Local: docker compose up -d && npm run dev:ws
□ Verify: curl endpoints, check WebSocket, test webhook

TOTAL MANUAL TIME: ~18 minutes one-time (6 dashboards, see Section 3)
```

### Post-Setup: Everything Is Code-Driven

After the one-time setup above, all ongoing operations are automated:

```bash
# Schema changes → edit SQL, run drizzle-kit push
# New features → git push, auto-deploys
# Scaling → Vercel/Railway auto-scale
# Backups → NeonDB/Upstash handle automatically
# Monitoring → Built-in health checks
# Updates → git pull, docker compose up -d
```

### Automation Summary

```
┌─────────────────────────────────────────────────────────────────┐
│                    AUTOMATION SPLIT                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ████████████████████████████████████  90% AUTOMATED              │
│  ├── Schema creation (Drizzle + SQL)                              │
│  ├── All database operations (CRUD)                               │
│  ├── Real-time WebSocket updates                                  │
│  ├── Redis caching + persistence                                  │
│  ├── API routes (50+ endpoints)                                   │
│  ├── Webhook handlers (Clerk)                                     │
│  ├── Docker orchestration                                         │
│  ├── Incident state machine                                       │
│  ├── Floor escalation engine                                      │
│  ├── WHI calculation                                              │
│  ├── Telemetry batching (COPY protocol)                           │
│  ├── ISR caching (30s revalidate)                                 │
│  ├── Role-based access control                                    │
│  ├── JWT refresh rotation                                         │
│  └── Rate limiting (Lua token bucket)                             │
│                                                                   │
│  ████  10% MANUAL (ONE-TIME)                                      │
│  ├── Create cloud accounts (5 platforms)                          │
│  ├── Enable TimescaleDB extension                                 │
│  ├── Configure Clerk webhook URL + events                         │
│  ├── Generate TLS certificates                                    │
│  ├── Set environment variables in dashboards                      │
│  └── DNS / domain setup                                           │
│                                                                   │
│  AFTER SETUP: git push → auto-deploy → done                      │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Appendix: Quick Reference Commands

```bash
# ── Schema Management ──
npx drizzle-kit push                          # Push schema to NeonDB
npx drizzle-kit generate                      # Generate migration files
npx drizzle-kit migrate                       # Run migrations
npx drizzle-kit studio                        # Open Drizzle Studio (GUI)

# ── Docker Management ──
docker compose up -d                          # Start all containers
docker compose down                           # Stop all containers
docker compose ps                             # List running containers
docker compose logs -f fastapi                # Tail FastAPI logs
docker compose exec timescaledb psql -U postgres  # Connect to TimescaleDB

# ── Environment Verification ──
echo $DATABASE_URL                            # Check NeonDB URL
echo $REDIS_URL                               # Check Upstash Redis URL
echo $MQTT_HOST                               # Check EMQX endpoint
cat aai-wms-backend/secrets/jwt_secret_key.txt  # Check JWT secret

# ── Health Checks ──
curl http://localhost:3000                     # Portal
curl http://localhost:8001/health              # DA Engine
curl -k https://localhost:443/health           # WMS Backend
redis-cli -u $REDIS_URL ping                  # Upstash Redis
psql "$DATABASE_URL" -c "SELECT 1"            # NeonDB

# ── Full Deploy (Cloud) ──
git push origin main                          # Triggers Vercel auto-deploy
cd aai-wms-backend && docker compose -f docker-compose.cloud.yml up -d
cd ../da-engine && docker compose up -d
```
