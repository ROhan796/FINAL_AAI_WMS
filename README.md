# AAI Smart Washroom System — Full Stack Unification

**Version:** 5.0.0  
**Platform:** Airports Authority of India — Civil Aviation Telemetry  
**Architecture:** 3-tier (IoT Edge → Data Acquisition → Web Portal)

---

## Table of Contents

- [1. System Architecture](#1-system-architecture)
- [2. Subsystem Overview](#2-subsystem-overview)
- [3. Complete Data Flow](#3-complete-data-flow)
- [4. Database Design](#4-database-design)
- [5. Performance Optimizations](#5-performance-optimizations)
- [6. Feature-to-Engine Mapping](#6-feature-to-engine-mapping)
- [7. API Proxy Routes](#7-api-proxy-routes)
- [8. Prerequisites](#8-prerequisites)
- [9. Credentials & API Keys](#9-credentials--api-keys)
- [10. Environment Variables Reference](#10-environment-variables-reference)
- [11. Directory Structure](#11-directory-structure)
- [12. Execution — Step by Step](#12-execution--step-by-step)
- [13. Verification Checks](#13-verification-checks)
- [14. Port Map](#14-port-map)
- [15. API Reference](#15-api-reference)
- [16. WebSocket Real-time Architecture](#16-websocket-real-time-architecture)
- [17. Known Issues & Fixes](#17-known-issues--fixes)
- [18. Stopping All Services](#18-stopping-all-services)
- [19. Testing Checklist](#19-testing-checklist)

---

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        AAI Smart Washroom System                        │
│                                                                         │
│  ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────┐    │
│  │   WMS Backend    │   │    DA Engine     │   │ Unified Portal   │    │
│  │  (Port 443)      │   │  (Port 8001)     │   │  (Port 3000)     │    │
│  │                  │   │                  │   │                  │    │
│  │ ┌──────────────┐ │   │ ┌──────────────┐ │   │ ┌──────────────┐ │    │
│  │ │ EMQX x3     │ │   │ │ APScheduler  │ │   │ │ Next.js 16   │ │    │
│  │ │ (MQTT mTLS)  │ │   │ │ (30s poll)   │ │   │ │ (React 19)   │ │    │
│  │ ├──────────────┤ │   │ ├──────────────┤ │   │ ├──────────────┤ │    │
│  │ │ FastAPI      │ │   │ │ NSCBI Client │ │   │ │ Clerk Auth   │ │    │
│  │ │ Ingestion    │ │   │ │ (httpx+gather)│ │   │ │ (RBAC)       │ │    │
│  │ ├──────────────┤ │   │ ├──────────────┤ │   │ ├──────────────┤ │    │
│  │ │ Incident     │ │   │ │ WHI Calc     │ │   │ │ React Query  │ │    │
│  │ │ State Machine│ │   │ │ Incident Det │ │   │ │ ISR Caching  │ │    │
│  │ ├──────────────┤ │   │ ├──────────────┤ │   │ ├──────────────┤ │    │
│  │ │ Escalation   │ │   │ │ Redis Cache  │ │   │ │ Recharts     │ │    │
│  │ │ Engine       │ │   │ │ (persistent) │ │   │ │ Dashboards   │ │    │
│  │ ├──────────────┤ │   │ ├──────────────┤ │   │ ├──────────────┤ │    │
│  │ │ HAProxy x2   │ │   │ │ Telemetry    │ │   │ │ Drizzle ORM  │ │    │
│  │ │ Keepalived x2│ │   │ │ Bridge(COPY) │ │   │ │ → Neon PG    │ │    │
│  │ ├──────────────┤ │   │ └──────────────┘ │   │ └──────────────┘ │    │
│  │ │ Redis 7.2    │ │   │                  │   │                  │    │
│  │ │ (state/tokens│ │   │                  │   │                  │    │
│  │ ├──────────────┤ │   │                  │   │                  │    │
│  │ │ TimescaleDB  │ │   │                  │   │                  │    │
│  │ │ (telemetry)  │ │   │                  │   │                  │    │
│  │ │ + Continuous │ │   │                  │   │                  │    │
│  │ │   Aggregates │ │   │                  │   │                  │    │
│  │ └──────────────┘ │   │                  │   │                  │    │
│  └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘    │
│           │                      │                       │              │
│  ┌────────┴─────────┐   ┌───────┴────────┐   ┌─────────┴──────────┐   │
│  │ IoT Sensors      │   │ NSCBI Airport  │   │ Browser            │   │
│  │ (Pico W)         │   │ API            │   │ (Clerk Auth)       │   │
│  │ MQTT mTLS:8883   │   │ (External)     │   │                    │   │
│  └──────────────────┘   └────────────────┘   └────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DATA FLOW PATHS                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  PATH 1: IoT Sensors → WMS Backend → TimescaleDB                       │
│  ─────────────────────────────────────────────                          │
│  Pico W → MQTT mTLS:8883 → HAProxy → EMQX → FastAPI Worker            │
│      → Rate Limiter (Redis) → Queue Router                              │
│      → IncidentEngine (3-cycle debounce) → EscalationEngine            │
│      → TelemetryBatcher → TimescaleDB (COPY protocol, 100/batch)      │
│      → Raw Audit Trail (14-day retention)                              │
│                                                                         │
│  PATH 2: NSCBI API → DA Engine → Redis + In-Memory Cache               │
│  ─────────────────────────────────────────────                          │
│  NSCBI Airport API → httpx (30s poll, PARALLEL per device)             │
│      → JSON Parse → Normalize → Quality Check → WHI Calculator          │
│      → Incident Detection → Circular History Buffer → Cache Store       │
│      → Redis persistence (60s interval, crash recovery)                │
│      → Airport Summary Rollup                                           │
│                                                                         │
│  PATH 3: DA Engine → TimescaleDB (Bridge + Continuous Aggregates)      │
│  ─────────────────────────────────────────────                          │
│  DA Engine cache → TelemetryBridge (30s, COPY protocol)                │
│      → TimescaleDB washroom_telemetry                                   │
│      → Continuous Aggregate: whi_hourly_summary (5min refresh)         │
│      → Continuous Aggregate: whi_daily_summary (10min refresh)         │
│                                                                         │
│  PATH 4: Frontend → DA Engine Proxy (ISR Cached)                       │
│  ─────────────────────────────────────────────                          │
│  Browser → Clerk Auth → Next.js /api/da/* (revalidate: 30s)           │
│      → React Query (auto-refetch, background sync)                     │
│      → Recharts visualization                                           │
│                                                                         │
│  PATH 5: Frontend → WMS Backend Proxy                                  │
│  ─────────────────────────────────────────────                          │
│  Browser → Clerk Auth → Next.js /api/wms/* → HTTPS fetch → HAProxy    │
│      → FastAPI (JWT validated) → Redis state / TimescaleDB query        │
│      → JSON response → React state → UI update                          │
│                                                                         │
│  PATH 6: Frontend → Neon PostgreSQL (Auth + Fallback)                  │
│  ─────────────────────────────────────────────                          │
│  Browser → Clerk Auth → Next.js API Route → Drizzle ORM → Neon PG      │
│      → PRIMARY: app_users, audit_logs, system_logs, system_settings    │
│      → FALLBACK: terminals, incidents (when DA Engine offline)         │
│                                                                         │
│  PATH 7: DA Engine → WebSocket → Frontend (Real-time Push)              │
│  ─────────────────────────────────────────────                          │
│  DA Engine cache → RealtimeHub.broadcast() → WebSocket /ws             │
│      → useRealtime() hook → React Query cache invalidation             │
│      → UI re-renders instantly (sub-second latency)                     │
│      → Events: telemetry:update, incidents:update, summary:update       │
│      → Fallback: SSE endpoint at /api/sse/telemetry (2s interval)      │
│                                                                         │
│  PATH 8: WMS Backend → WebSocket → Frontend (Real-time Push)            │
│  ─────────────────────────────────────────────                          │
│  MQTT message → mqtt_subscriber → wms_realtime_hub.broadcast()         │
│      → WebSocket /ws → useRealtime() hook → UI floor status update    │
│      → Events: mqtt:telemetry, floor_status:update, incident:new       │
│      → Sends current floor status snapshot on connect                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Subsystem Overview

### 2.1 WMS Backend (aai-wms-backend/)
**Technology:** Python FastAPI + EMQX 5.8 (3-node cluster) + TimescaleDB + Redis + HAProxy (2-node cluster)  
**Runs via:** Docker Compose (10 containers)  
**Purpose:** Ingests MQTT telemetry from physical IoT pico-devices, manages incident state machine, stores time-series data, serves JWT-authenticated REST API.

**Core Services:**
| Service | File | Purpose |
|---------|------|---------|
| MQTTSubscriber | `services/mqtt.py` | Subscribes to `washroom/+/+/telemetry` topics, rate-limits per device |
| DualQueueRouter | `services/queue.py` | Routes to priority queue (alerts) or normal queue |
| IncidentEngine | `services/incident.py` | State machine: NORMAL → PENDING_ALERT → ACTIVE_INCIDENT → RESOLVED |
| EscalationEngine | `services/escalation.py` | Floor-level: 2+ incidents → FLOOR_CRITICAL |
| TelemetryBatcher | `services/batcher.py` | Buffers in Redis, flushes to TimescaleDB via COPY protocol |
| AuditBatcher | `services/audit.py` | Raw MQTT audit trail, 14-day retention |

**Docker Containers (10):**
| Container | Image | Role |
|-----------|-------|------|
| `emqx1/2/3` | emqx:5.8 | MQTT broker cluster (mTLS) |
| `haproxy1/2` | haproxy:2.8-alpine | Load balancer (ports 443, 8883, 18083) |
| `keepalived1/2` | osixia/keepalived:2.0.20 | VIP failover |
| `fastapi` | Custom build | FastAPI ingestion pipeline |
| `washroom-redis` | redis:7.2-alpine | Token bucket + incident state |
| `washroom-timescaledb` | timescale/timescaledb:latest-pg16 | Time-series storage + continuous aggregates |

### 2.2 DA Engine (da-engine/)
**Technology:** Python FastAPI + APScheduler + httpx + Pydantic v2 + pandas + numpy + Redis  
**Runs via:** Docker or direct uvicorn (Port 8001)  
**Purpose:** Polls NSCBI Airport API for IoT telemetry, processes through analytics pipeline, computes WHI scores, detects incidents, caches results with Redis persistence for crash recovery.

**Key Optimizations:**
- **Parallel API polling** — `asyncio.gather` fetches all 36 device IDs concurrently (10 at a time)
- **Concurrent file processing** — 5 files processed simultaneously (was sequential)
- **Redis persistent cache** — survives DA Engine restarts (60s persistence interval)
- **ISR-cached proxy routes** — Next.js revalidates every 30s (was `no-store`)

**Analytics Pipeline (per telemetry record):**
```
Raw Payload → Preprocess → Normalize → Quality Check → Calibrate
    → WHI Computation → Circular History Buffer → Incident Detection
    → Cache Update + Redis Persist → Airport Summary Rollup
```

**WHI Formula:**
```
WHI = (cleanliness × 0.35) + ((100 - occupancy_load_pct) × 0.20)
    + (supply_score × 0.25) + (air_score × 0.20)
```

**Incident Detection (7 breach types):**
- AMMONIA_SPIKE (>50ppm)
- LOW_SOAP (<20%), LOW_PAPER (<20%), LOW_SANITIZER (<20%)
- CRITICAL_WHI (<60)
- OVERCAPACITY
- LOW_BATTERY (<15%)

**Device Schema:** 54 IoT devices across 3 terminals × 6 levels × 3 unit types
- Format: `T{1-3}-L{1-6}-{PPD|PPM|PPF}-{001-054}`
- PPD = Disabled, PPM = Male, PPF = Female

### 2.3 Unified Portal (aai-unified-portal/)
**Technology:** Next.js 16 + React 19 + Clerk Auth + Drizzle ORM + Tailwind CSS + Recharts + React Query  
**Runs via:** npm dev (webpack mode) on Port 3000  
**Purpose:** Web dashboard with role-based access (Admin, Terminal Operator, Auditor), real-time WHI visualization, incident management, audit logs.

**Key Optimizations:**
- **React Query** — automatic background refetching, caching, deduplication
- **ISR proxy routes** — `revalidate: 30` on all DA Engine routes (reduces server load)
- **Live WHI** — `revalidate: 10` for near-real-time updates

**Three Data Sources:**
| Source | Client | Usage |
|--------|--------|-------|
| DA Engine (port 8001) | `daClient.ts` + `/api/da/*` (ISR cached) | Live analytics, WHI, trends, incidents |
| WMS Backend (port 443) | `wmsClient.ts` + `/api/wms/*` | Incident actions, floor status, audit trail |
| Neon PostgreSQL | Drizzle ORM | User accounts, audit logs, fallback queries |

**User Roles:**
| Username Pattern | Role | Portal Route |
|------------------|------|-------------|
| `AP-xxx` | Admin | `/admin/dashboard` |
| `TP-xxx` | Terminal Operator | `/terminal` |
| `ALP-xxx` | Auditor | `/audit` |

---

## 3. Complete Data Flow

### 3.1 DA Engine — Parallel Acquisition Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    DA ENGINE PARALLEL ACQUISITION                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  NSCBI Airport API                                                  │
│       │                                                              │
│       │ asyncio.gather (36 devices, 10 concurrent)                  │
│       ▼                                                              │
│  AcquisitionClient._list_files_for_device() × 36                    │
│       │                                                              │
│       │ Paginated fetch (100/page) per device                       │
│       ▼                                                              │
│  All filenames (deduplicated)                                        │
│       │                                                              │
│       │ asyncio.gather (5 concurrent file downloads)                │
│       ▼                                                              │
│  TelemetryDownloader.download() × 5                                 │
│       │                                                              │
│       │ Analytics Pipeline (per batch)                               │
│       ▼                                                              │
│  Cache Store → Redis Persist (60s)                                  │
│       │                                                              │
│       │ TelemetryBridge (30s, COPY protocol)                        │
│       ▼                                                              │
│  TimescaleDB → Continuous Aggregates (5min/10min refresh)           │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Frontend → DA Engine (ISR Cached + React Query)

```
┌─────────────────────────────────────────────────────────────────────┐
│                    ISR CACHED PROXY FLOW                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Browser                                                            │
│       │                                                              │
│       │ Clerk Auth → React Query (auto-refetch)                     │
│       ▼                                                              │
│  Next.js /api/da/*                                                  │
│       │                                                              │
│       │ revalidate: 30 (ISR) — cached at edge                       │
│       │ Next: revalidate: 10 (live-whi)                             │
│       ▼                                                              │
│  DA Engine:8001 (only on cache miss or revalidation)                │
│       │                                                              │
│       │ JSON → React Query cache → UI update                        │
│       ▼                                                              │
│  Recharts Visualization                                              │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 4. Database Design

### 4.1 Three-Database Architecture

| # | Database | Technology | Purpose | Tables |
|---|----------|-----------|---------|--------|
| 1 | **TimescaleDB** | PostgreSQL 16 + TimescaleDB | WMS Backend operational data | 5 hypertables + 2 continuous aggregates |
| 2 | **Redis** | Redis 7.2 | WMS Backend state + DA Engine persistent cache | Key-value + sets + hashes |
| 3 | **Neon PostgreSQL** | Serverless PG (cloud) | Frontend auth + app config + fallback | 16 tables (4 primary + 12 fallback) |

### 4.2 TimescaleDB Schema (WMS Backend)

**Hypertables (time-partitioned):**
| Table | Retention | Purpose |
|-------|-----------|---------|
| `washroom_telemetry` | 90 days | Time-series sensor readings |
| `incident_events` | 1 year | State transition audit (frozen) |
| `floor_escalation_events` | 1 year | Floor escalation audit (frozen) |
| `raw_telemetry_audit` | 14 days | Raw MQTT message audit trail |
| `users` | Unlimited | Authentication credentials |

**Continuous Aggregates (pre-computed for fast queries):**
| View | Refresh | Retention | Purpose |
|------|---------|-----------|---------|
| `whi_hourly_summary` | Every 5 min | 1 year | Hourly WHI avg/min/max per device |
| `whi_daily_summary` | Every 10 min | 2 years | Daily WHI avg/min/max per terminal |

**Security:**
- Immutability triggers on incident_events, floor_escalation_events, raw_telemetry_audit
- Least-privilege DB role (`aai_app_worker`: only SELECT + INSERT)
- Freeze triggers prevent UPDATE/DELETE on audit tables

### 4.3 Redis Schema

**WMS Backend (DB 0):**
| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `state:washroom:{washroom_id}` | STRING | Per-washroom incident state |
| `debounce:{washroom_id}` | INTEGER | Debounce cycle counter |
| `state:floor:{terminal}:{floor}:incidents` | SET | Active incident washroom IDs |
| `state:floor:{terminal}:{floor}:status` | STRING | Floor status |
| `rate_limit:{device_id}` | HASH | Token bucket state |

**DA Engine (DB 1):**
| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `da:telemetry:{device_id}` | STRING (JSON) | Cached telemetry per device |
| `da:active_incidents` | STRING (JSON) | Active incident list |
| `da:airport_summary` | STRING (JSON) | Airport-wide summary |

### 4.4 Neon PostgreSQL Schema (Frontend)

**Primary Tables (Auth + App Config):**
| Table | Purpose |
|-------|---------|
| `app_users` | Clerk-synced user profiles |
| `audit_logs` | User action audit trail |
| `system_logs` | System event logs |
| `system_settings` | Configurable thresholds |

**Fallback Tables (DA Engine mirror — read-only):**
| Table | Purpose |
|-------|---------|
| `terminals` | Terminal metadata |
| `levels` | Floor metadata |
| `washroom_units` | Device metadata |
| `washroom_state` | Real-time state |
| `incidents` | Incident records |
| `incident_timeline` | Action history |
| `whi_history` | Daily WHI aggregates |
| `maintenance_issues` | Maintenance tracking |
| `washrooms` | Washroom metadata |
| `stalls` | Stall status |
| `devices` | Device metadata |
| `whi_snapshots` | WHI snapshots |
| `heatmap_zones` | Heatmap layout |
| `reports` | Generated reports |

### 4.5 Design Rationale

**Why three databases?**
1. **TimescaleDB** — Purpose-built for time-series telemetry; hypertables auto-partition by time; continuous aggregates pre-compute trends; retention policies manage data lifecycle
2. **Redis** — Sub-millisecond reads for operational state (incident state machine, rate limiting, floor escalation); DA Engine persistent cache survives restarts
3. **Neon PostgreSQL** — Serverless auth storage (Clerk integration); fallback queries when DA Engine is offline; no infrastructure management

**Why not consolidate?**
- TimescaleDB is optimized for time-series, not auth queries
- Redis is optimized for ephemeral state, not persistent analytics
- Neon PG is serverless (zero ops) but not suitable for high-throughput telemetry

---

## 5. Performance Optimizations

### 5.1 DA Engine Optimizations

| # | Optimization | Before | After | Impact |
|---|-------------|--------|-------|--------|
| 1 | Parallel API polling | Sequential per device | `asyncio.gather` (10 concurrent) | ~3x faster file listing |
| 2 | Concurrent file processing | Sequential download + process | `asyncio.gather` (5 concurrent) | ~2.5x faster ingestion |
| 3 | Redis persistent cache | In-memory only (lost on restart) | Redis DB 1 with 60s persist | Zero-downtime restarts |
| 4 | Telemetry Bridge COPY | `executemany` per batch | `copy_records_to_table` | 5-10x faster DB writes |

### 5.2 Frontend Optimizations

| # | Optimization | Before | After | Impact |
|---|-------------|--------|-------|--------|
| 5 | React Query hooks | `useState` + `useEffect` + `setInterval` | `useQuery` with `refetchInterval` | Automatic cache, dedup, background sync |
| 6 | ISR proxy routes | `cache: 'no-store'` on all routes | `revalidate: 30` (10 for live-whi) | 50% fewer DA Engine requests |
| 7 | DA Engine React Query | Manual fetch every 30s | `useDASummary()` with 25s stale + 30s refetch | Reduced redundant fetches |

### 5.3 Database Optimizations

| # | Optimization | Before | After | Impact |
|---|-------------|--------|-------|--------|
| 8 | Continuous aggregates | Manual aggregation in DA Engine | TimescaleDB `whi_hourly_summary`, `whi_daily_summary` | Pre-computed trends, instant queries |
| 9 | Retention policies | Unlimited retention on 4 tables | 90d telemetry, 1yr incidents, 1yr escalations | Controlled disk usage |
| 10 | COPY protocol in bridge | `executemany` (row-by-row) | `copy_records_to_table` (bulk) | 5-10x faster sync |

---

## 6. Feature-to-Engine Mapping

### 6.1 Which Engine Powers Which Frontend Feature

| # | Frontend Feature | Data Source | Engine | Status |
|---|-----------------|-------------|--------|--------|
| 1 | Admin Dashboard KPIs | `/api/da/summary` | DA Engine | ✅ Connected |
| 2 | Admin Dashboard Incidents Table | `/api/da/incidents` | DA Engine | ✅ Connected |
| 3 | Admin Dashboard: Incidents Weekly Chart | `/api/da/incidents` → `computeWeeklyIncidents()` | DA Engine | ✅ Connected |
| 4 | Admin Dashboard: Health Donut Chart | `/api/da/summary` → `computeHealthOverview()` | DA Engine | ✅ Connected |
| 5 | Admin Analytics: Health Index Card | `/api/da/summary` | DA Engine | ✅ Connected |
| 6 | Admin Analytics: WHI Trends Chart | `/api/da/trends` → `computeHealthTrends()` | DA Engine | ✅ Connected |
| 7 | Admin Analytics: Incident Frequency Chart | `/api/da/incidents` → `computeIncidentSeverity()` | DA Engine | ✅ Connected |
| 8 | Admin Analytics: Heatmap | `/api/wms/analytics/heatmap` → TimescaleDB hourly | WMS Backend | ✅ Connected |
| 9 | Admin Audit Logs: System Tab | Drizzle ORM → Neon PG | Neon PostgreSQL | ✅ Connected |
| 10 | Admin Audit Logs: Raw Telemetry Tab | `/api/wms/audit/raw-telemetry` | WMS Backend | ✅ Connected |
| 11 | Admin Audit Logs: Incident Events Tab | `/api/wms/audit/incident-events` | WMS Backend | ✅ Connected |
| 12 | Admin Audit Logs: Floor Escalations Tab | `/api/wms/audit/floor-escalations` | WMS Backend | ✅ Connected |
| 13 | Admin Users: Zone/Shift Editing | PUT `/api/wms/admin/users/{email}` | WMS Backend | ✅ Connected |
| 14 | Terminal Dashboard KPIs | `/api/da/summary` | DA Engine | ✅ Connected |
| 15 | Terminal Dashboard Floor Status | `/api/wms/status` → Redis floor states | WMS Backend | ✅ Connected |
| 16 | Terminal Dashboard Live WHI Feed | `/api/da/live-whi` (10s polling) | DA Engine | ✅ Connected |
| 17 | Terminal Dashboard Incident Queue | `/api/da/incidents` | DA Engine | ✅ Connected |
| 18 | Terminal Washrooms | `/api/da/levels/{terminal}/{level}` | DA Engine | ✅ Connected |
| 19 | Terminal Incidents (Read) | `/api/da/incidents` | DA Engine | ✅ Connected |
| 20 | Terminal Incidents: Acknowledge Button | POST `/api/wms/incidents/{id}/acknowledge` | WMS Backend | ✅ Connected |
| 21 | Terminal Incidents: Resolve Button | POST `/api/wms/incidents/{id}/resolve` | WMS Backend | ✅ Connected |
| 22 | Terminal Live WHI Page | `/api/da/live-whi` (10s polling) | DA Engine | ✅ Connected |
| 23 | Terminal Device Status: KPIs | `/api/da/summary` | DA Engine | ✅ Connected |
| 24 | Terminal Device Status: MQTT Indicator | `/api/wms/status` → floor count | WMS Backend | ✅ Connected |
| 25 | Terminal Reports | Drizzle ORM → Neon PG | Neon PostgreSQL | ✅ Connected |
| 26 | Admin Dashboard KPIs (Fallback) | Drizzle ORM → Neon PG | Neon PostgreSQL | ✅ Connected |
| 27 | WHI History (Fallback) | Drizzle ORM → Neon PG | Neon PostgreSQL | ✅ Connected |

### 6.2 Data Source Priority

```
For analytics data (KPIs, WHI, trends, incidents):
  1st: DA Engine (real-time, Redis-persistent cache)
  2nd: TimescaleDB continuous aggregates (pre-computed)
  3rd: Neon PostgreSQL (fallback when DA Engine down)

For operational data (incident actions, floor status, audit):
  1st: WMS Backend (Redis state + TimescaleDB)
  2nd: Neon PostgreSQL (for user accounts, static metadata)

For user management:
  1st: Clerk (authentication)
  2nd: Neon PostgreSQL (user profiles via Drizzle)
  3rd: WMS Backend (zone/shift attributes)
```

---

## 7. API Proxy Routes

### 7.1 DA Engine Proxies (/api/da/*) — ISR Cached

| Frontend Route | Proxies To | Revalidate | Used By |
|----------------|------------|------------|---------|
| `GET /api/da/summary` | `GET http://localhost:8001/api/dashboard/summary` | 30s | Admin Dashboard, Terminal Dashboard, Analytics |
| `GET /api/da/incidents` | `GET http://localhost:8001/api/incidents` | 30s | Admin Incidents, Terminal Incidents, Dashboard |
| `GET /api/da/trends` | `GET http://localhost:8001/api/trends` | 30s | Admin Analytics WHI Trends Chart |
| `GET /api/da/live-whi` | `GET http://localhost:8001/api/dashboard/live-whi` | 10s | Terminal Live WHI Page |
| `GET /api/da/terminals` | `GET http://localhost:8001/api/terminals` | 30s | Terminal List Views |
| `GET /api/da/terminals/[id]` | `GET http://localhost:8001/api/terminals/{id}` | 30s | Terminal Detail Views |
| `GET /api/da/levels/[terminal]/[level]` | `GET http://localhost:8001/api/levels/{terminal}/{level}` | 30s | Terminal Washrooms Page |
| `GET /api/da/washrooms/[deviceId]` | `GET http://localhost:8001/api/washrooms/{deviceId}` | 30s | Washroom Detail Views |
| `GET /api/da/[...path]` | `GET http://localhost:8001/api/{path}` | 30s | Catch-all fallback |

### 7.2 WMS Backend Proxies (/api/wms/*)

| Frontend Route | Proxies To | Used By |
|----------------|------------|---------|
| `GET /api/wms/status` | `GET https://localhost:443/dashboard/status` | Terminal Dashboard Floor Status |
| `POST /api/wms/incidents/[id]/[action]` | `POST https://localhost:443/incidents/{id}/{action}` | Terminal Incidents Ack/Resolve |
| `GET /api/wms/devices/[id]/config` | `GET https://localhost:443/devices/{id}/config` | Terminal Device Status |
| `PUT /api/wms/admin/users/[username]` | `PUT https://localhost:443/admin/users/{username}/attributes` | Admin Users Zone/Shift Edit |
| `GET /api/wms/analytics/heatmap` | `GET https://localhost:443/analytics/heatmap` | Admin Analytics Heatmap |
| `GET /api/wms/audit/raw-telemetry` | `GET https://localhost:443/audit/raw-telemetry` | Admin Audit Raw Telemetry Tab |
| `GET /api/wms/audit/incident-events` | `GET https://localhost:443/audit/incident-events` | Admin Audit Incident Events Tab |
| `GET /api/wms/audit/floor-escalations` | `GET https://localhost:443/audit/floor-escalations` | Admin Audit Floor Escalations Tab |

### 7.3 Neon PostgreSQL API Routes

| Frontend Route | Query Method | Used By |
|----------------|--------------|---------|
| `GET /api/dashboard/summary` | Drizzle aggregate queries | Admin Dashboard (DA Engine fallback) |
| `GET /api/whi/history` | Drizzle whiHistory table | WHI History (DA Engine fallback) |
| `GET /api/incidents` | Drizzle incidents table | Admin Incidents (with filters) |
| `GET /api/terminals` | Drizzle terminals + aggregates | Terminal List |
| `POST /api/terminal/incidents` | Drizzle incidents INSERT | Terminal Create Incident |
| `PATCH /api/terminal/incidents/[id]` | Drizzle incidents UPDATE | Terminal Update Incident |
| `GET /api/terminal/reports` | Drizzle reports table | Terminal Reports |

---

## 8. Prerequisites

### Required Software
| Software | Version | Check Command |
|----------|---------|---------------|
| Docker Desktop | >= 24.x | `docker info` |
| Docker Compose | >= 2.x | `docker compose version` |
| Node.js | >= 20.x | `node --version` |
| npm | >= 10.x | `npm --version` |
| Python | >= 3.11 | `python --version` |
| OpenSSL | Any | `openssl version` |

### Required Ports
| Port | Service | Protocol |
|------|---------|----------|
| 443 | HAProxy → FastAPI | HTTPS |
| 3000 | Next.js Portal | HTTP |
| 5433 | TimescaleDB (external) | PostgreSQL |
| 6389 | Redis (external) | Redis |
| 8001 | DA Engine | HTTP |
| 8883 | MQTT over TLS | mTLS |
| 18083 | EMQX Dashboard | HTTPS |

---

## 9. Credentials & API Keys

### 9.1 NSCBI Airport API (DA Engine)
| Field | Value |
|-------|-------|
| Base URL | `https://api.nscbiairport.com/api` |
| API Key | `EY9kocR7OOFfkJBXXLYrQFs84HEyI1OJDUjJcbwfsDVOqXvcFau3eqBdG6ZHZ2Fe` |
| Authorized Device ID | `MC001` |
| Auth Header | `X-API-KEY: <key>` |

### 9.2 Clerk Authentication (Portal)
| Field | Value |
|-------|-------|
| Publishable Key | `pk_test_anVzdC1qYXZpbGluLTIxLmNsZXJrLmFjY291bnRzLmRldiQ` |
| Secret Key | `sk_test_DlQVPCzoSBMdnqqGVN8r53E1VhkyFq1gtxmTlkyAea` |
| Clerk Instance | `just-javilin-21.clerk.accounts.dev` |

**User Roles:**
| Username | Role | Redirect After Login |
|----------|------|---------------------|
| `AP-001` | Admin | `/admin/dashboard` |
| `TP-001` | Terminal Operator | `/terminal` |
| `ALP-001` | Auditor | `/audit` |

### 9.3 Neon PostgreSQL (Portal Database)
| Field | Value |
|-------|-------|
| Host | `ep-nameless-brook-ah66rf6f.c-3.us-east-1.aws.neon.tech` |
| Database | `neondb` |
| User | `neondb_owner` |
| Password | `npg_cSwQX39dFCUP` |
| SSL Mode | `require` |

### 9.4 WMS Backend Secrets (Docker Secrets)
| File | Used By |
|------|---------|
| `operator_password.txt` | JWT auth (`operator` / `N3fc/fiIi55E3+O4qr4FRw==`) |
| `postgres_password.txt` | TimescaleDB superuser |
| `aai_app_worker_password.txt` | FastAPI DB role |
| `redis_password.txt` | Redis auth |
| `jwt_secret_key.txt` | JWT token signing |
| `supervisor_password.txt` | Supervisor role |

---

## 10. Environment Variables Reference

### 10.1 DA Engine (.env)
```dotenv
NSCBI_API_BASE_URL=https://api.nscbiairport.com/api
NSCBI_API_KEY=EY9kocR7OOFfkJBXXLYrQFs84HEyI1OJDUjJcbwfsDVOqXvcFau3eqBdG6ZHZ2Fe
NSCBI_DEVICE_IDS=T1-L1-PPM-002,...  # 36 devices
POLLING_INTERVAL_SECONDS=30
DA_ENGINE_HOST=0.0.0.0
DA_ENGINE_PORT=8001
ENVIRONMENT=development
LOG_LEVEL=INFO
CORS_ALLOW_ORIGIN=http://localhost:3000
REDIS_HOST=localhost
REDIS_PORT=6389
REDIS_DB=1
REDIS_PASSWORD=
REDIS_CACHE_TTL=300
```

### 10.2 Portal (.env.local)
```dotenv
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_anVzdC1qYXZpbGluLTIxLmNsZXJrLmFjY291bnRzLmRldiQ
CLERK_SECRET_KEY=sk_test_DlQVPCzoSBMdnqqGVN8r53E1VhkyFq1gtxmTlkyAea
DATABASE_URL=postgresql://neondb_owner:npg_cSwQX39dFCUP@ep-nameless-brook-ah66rf6f.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require
NEXT_PUBLIC_DA_ENGINE_URL=http://localhost:8001
NEXT_PUBLIC_WMS_API_URL=https://localhost:443
WMS_JWT_OPERATOR_USER=operator
WMS_JWT_OPERATOR_PASS=N3fc/fiIi55E3+O4qr4FRw==
NODE_EXTRA_CA_CERTS=C:/INTERNSHIP_TASK/TASK16/Fullstack_Unification/aai-wms-backend/certs/ca/ca.crt
NODE_TLS_REJECT_UNAUTHORIZED=0
```

---

## 11. Directory Structure

```
Fullstack_Unification/
├── aai-wms-backend/              # WMS Backend (Docker, 10 containers)
│   ├── app/
│   │   ├── main.py               # FastAPI entrypoint
│   │   ├── api/routes.py         # All API endpoints (13 routes)
│   │   ├── core/                 # Auth, config, security
│   │   ├── db/                   # PostgreSQL + Redis managers
│   │   ├── models/               # Domain models + schemas
│   │   ├── services/             # MQTT, queue, incident, escalation, batcher
│   │   └── workers/              # Priority + normal queue workers
│   ├── db_init/01-init.sql       # TimescaleDB schema + continuous aggregates + retention
│   ├── docker-compose.yml        # 10-container stack
│   └── secrets/                  # Generated secrets (gitignored)
│
├── da-engine/                    # DA Engine (Docker or direct)
│   ├── app/
│   │   ├── main.py               # FastAPI entrypoint + Redis connect + persist loop
│   │   ├── acquisition/          # NSCBI API client (parallel), polling, auth, retry
│   │   ├── analytics/            # WHI calculator, incident detection, trends
│   │   ├── api/                  # REST endpoints (14 routes)
│   │   ├── ingestion/            # Parser, validator, normalizer
│   │   ├── processing/           # Preprocessing, feature engineering
│   │   ├── models/               # Pydantic models
│   │   ├── services/             # Analytics, dashboard, health, report, bridge(COPY)
│   │   └── storage/              # Thread-safe cache + Redis persistence
│   ├── scripts/                  # Seed + test scripts
│   ├── .env                      # Environment variables (incl. Redis config)
│   └── requirements.txt          # Python deps (incl. redis>=5.0.0)
│
├── aai-unified-portal/           # Next.js Web Portal
│   ├── src/
│   │   ├── app/
│   │   │   ├── admin/            # Admin pages (dashboard, analytics, etc.)
│   │   │   ├── terminal/         # Terminal operator pages
│   │   │   ├── audit/            # Auditor pages
│   │   │   ├── api/
│   │   │   │   ├── da/           # DA Engine ISR-cached proxy routes (9 routes)
│   │   │   │   ├── wms/          # WMS Backend proxy routes (8 routes)
│   │   │   │   ├── dashboard/    # Neon PG fallback routes
│   │   │   │   └── terminal/     # Terminal-specific routes
│   │   │   └── sign-in/          # Clerk sign-in page
│   │   ├── components/
│   │   │   ├── admin/            # Charts, Heatmap, KPICard, Header
│   │   │   ├── terminal/         # DeviceCard, StallGrid, LevelNavigator
│   │   │   ├── ui/               # Base UI components (shadcn/ui)
│   │   │   └── auth/             # RoleBadge, LiveRoleBadge
│   │   ├── lib/
│   │   │   ├── daClient.ts       # DA Engine HTTP client
│   │   │   ├── wmsClient.ts      # WMS Backend HTTP client (JWT auto)
│   │   │   ├── store.ts          # Zustand state store
│   │   │   └── utils.ts          # Utility functions
│   │   ├── hooks/
│   │   │   ├── useDAEngine.ts    # React Query hooks for DA Engine (NEW)
│   │   │   ├── useDashboard.ts   # Neon PG fallback hooks
│   │   │   ├── useIncidents.ts   # Neon PG incident hooks
│   │   │   ├── useRealtime.ts    # WebSocket + SSE fallback (NEW)
│   │   │   ├── useTerminals.ts   # Neon PG terminal hooks
│   │   │   └── useWHIHistory.ts  # Neon PG WHI history hooks
│   │   ├── db/                   # Drizzle ORM schema (16 tables: 4 primary + 12 fallback)
│   │   └── types/                # TypeScript type definitions
│   ├── .env.local                # Environment variables
│   └── package.json              # Node.js dependencies
│
├── start.sh                      # Linux/Mac start script
├── stop.sh                       # Linux/Mac stop script
├── start_portal.bat              # Windows portal start script
└── README.md                     # This file (v4.0.0)
```

---

## 12. Execution — Step by Step

### 12.1 First-Time Setup (PKI Bootstrap)
```bash
cd Fullstack_Unification/aai-wms-backend
chmod +x setup_security.sh
./setup_security.sh
```

### 12.2 Start WMS Backend
```bash
cd Fullstack_Unification/aai-wms-backend
docker compose up -d
# Wait 2 minutes for health
docker compose ps
```

### 12.3 Start DA Engine
```bash
cd Fullstack_Unification/da-engine
docker compose up -d --build
# Verify:
curl http://localhost:8001/api/health
```

### 12.4 Start Portal (Windows)
```cmd
cd Fullstack_Unification\aai-unified-portal
set NODE_EXTRA_CA_CERTS=C:\INTERNSHIP_TASK\TASK16\Fullstack_Unification\aai-wms-backend\certs\ca\ca.crt
set NODE_TLS_REJECT_UNAUTHORIZED=0
npm run dev
```

### 12.5 Start Portal (Linux/Mac)
```bash
cd Fullstack_Unification/aai-unified-portal
export NODE_EXTRA_CA_CERTS=$(realpath ../aai-wms-backend/certs/ca/ca.crt)
npm run dev
```

---

## 13. Verification Checks

### 13.1 DA Engine (Standalone)
```bash
curl http://localhost:8001/health
curl http://localhost:8001/api/dashboard/summary
curl http://localhost:8001/api/incidents
curl http://localhost:8001/api/trends?days=7
curl http://localhost:8001/api/dashboard/live-whi
```

### 13.2 WMS Backend (Docker)
```bash
curl -k -X POST https://localhost:443/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"operator","password":"N3fc/fiIi55E3+O4qr4FRw=="}'
curl -k https://localhost:443/dashboard/status -H "Authorization: Bearer <token>"
```

### 13.3 Portal → DA Engine Proxy (ISR Cached)
```bash
curl http://localhost:3000/api/da/summary
curl http://localhost:3000/api/da/incidents
curl http://localhost:3000/api/da/trends
curl http://localhost:3000/api/da/live-whi
```

### 13.4 Portal → WMS Backend Proxy
```bash
curl http://localhost:3000/api/wms/status
curl http://localhost:3000/api/wms/audit/raw-telemetry?hours=24
curl http://localhost:3000/api/wms/audit/incident-events?hours=24
curl http://localhost:3000/api/wms/audit/floor-escalations?hours=24
```

### 13.5 Redis Persistence Check
```bash
# Check DA Engine cache is persisted to Redis
redis-cli -p 6389 -n 1 KEYS "da:*"
redis-cli -p 6389 -n 1 GET "da:airport_summary"
```

---

## 14. Port Map

```
Port    Protocol  Service                    Bind Address
──────  ────────  ────────────────────────   ──────────────
3000    HTTP      Next.js Portal             0.0.0.0
443     HTTPS     HAProxy → FastAPI          0.0.0.0
5433    PostgreSQL TimescaleDB (external)     0.0.0.0
6389    Redis     Redis (external)            0.0.0.0
8001    HTTP      DA Engine                   0.0.0.0
8883    MQTT/TLS  HAProxy → EMQX (mTLS)      0.0.0.0
18083   HTTPS     EMQX Dashboard              0.0.0.0
```

---

## 15. API Reference

### 15.1 DA Engine API (Port 8001)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Basic health check |
| GET | `/api/health` | Full health (uptime, API connectivity, cache stats) |
| GET | `/api/dashboard/summary` | Airport-wide WHI summary (54 devices) |
| GET | `/api/dashboard/live-whi` | Live WHI snapshot with rankings |
| GET | `/api/trends?days=7` | Daily WHI trends by terminal |
| GET | `/api/washrooms/{device_id}` | Single washroom detail |
| GET | `/api/terminals` | All 3 terminals summary |
| GET | `/api/terminals/{id}` | Single terminal detail |
| GET | `/api/levels/{terminal}/{level}` | Floor-level analytics |
| GET | `/api/incidents?limit=100` | Auto-detected incidents |
| GET | `/api/heatmap/terminals/{id}/floors/{level}/washrooms` | Floor heatmap data |
| GET | `/api/reports/summary` | Report metrics |
| POST | `/api/seed` | Seed telemetry records (testing) |

### 15.2 WMS Backend API (Port 443)
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/auth/login` | No | Login (returns JWT) |
| POST | `/auth/refresh` | No | Refresh token |
| POST | `/auth/logout` | Yes | Revoke all sessions |
| GET | `/dashboard/status` | Yes | Floor states from Redis |
| POST | `/incidents/{id}/acknowledge` | Yes | Acknowledge incident |
| POST | `/incidents/{id}/resolve` | Yes | Resolve incident |
| POST | `/alerts/dispatch` | Yes | Dispatch escalation alert |
| GET | `/devices/{id}/config` | Yes | Device configuration |
| PUT | `/admin/users/{username}/attributes` | Yes | Update user zone/shift |
| GET | `/analytics/heatmap` | Yes | Hourly occupancy averages |
| GET | `/audit/raw-telemetry` | Yes | Raw MQTT audit trail |
| GET | `/audit/incident-events` | Yes | Incident state transitions |
| GET | `/audit/floor-escalations` | Yes | Floor escalation events |

### 15.3 NSCBI Airport API
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/upload-json` | Upload JSON telemetry |
| GET | `/api/files?device_id=MC001` | List uploaded files |
| GET | `/api/files/{filename}` | Download specific file |

---

## 16. WebSocket Real-time Architecture

### Overview
The system implements real-time push via WebSocket connections from both the DA Engine and WMS Backend directly to the browser. This provides sub-second latency for telemetry updates, incidents, and floor status changes.

### Connection Map
```
Browser (useRealtime hook)
  ├── ws://localhost:8001/ws  (DA Engine)
  │     ├── telemetry:update    (every 30s poll cycle)
  │     ├── incidents:update    (on breach detection)
  │     ├── summary:update      (airport WHI rollup)
  │     └── live_whi:update     (live rankings)
  │
  └── wss://localhost:443/ws   (WMS Backend via HAProxy)
        ├── mqtt:telemetry      (on MQTT message)
        ├── floor_status:update (on floor state change)
        ├── incident:new        (on incident state change)
        └── alert:escalation    (on escalation)
```

### Frontend Hook: `useRealtime()`
Located at `src/hooks/useRealtime.ts`:
- Connects to both DA Engine and WMS Backend WebSockets on mount
- Auto-reconnects with exponential backoff (1s → 2s → 4s → max 30s)
- Invalidates React Query cache on incoming messages
- Provides `telemetry[]`, `incidents[]`, `floorStatus[]`, `connected` state
- Falls back to SSE or polling if WebSocket is unavailable

### SSE Fallback
Endpoint: `GET /api/sse/telemetry` on DA Engine (port 8001)
- Streams telemetry updates every 2 seconds
- Used when WebSocket is blocked (corporate proxies, firewalls)
- Content-Type: `text/event-stream`

### Health Endpoints with WebSocket Stats
- DA Engine: `GET /health` → includes `websocket.connected_clients`, `websocket.total_broadcasts`
- WMS Backend: `GET /health` → includes `websocket.connected_clients`, `websocket.total_broadcasts`

---

## 17. Known Issues & Fixes

| # | Issue | Fix |
|---|-------|-----|
| 1 | Clerk "Invalid host" error | Add `http://localhost:3000` to Clerk allowed origins |
| 2 | Turbopack not supported on Windows | Use `npx next dev --webpack` |
| 3 | SWC binary incompatible | Already handled — webpack mode |
| 4 | NSCBI API 422 — device_id required | Set `NSCBI_DEVICE_IDS` in `.env` |
| 5 | NSCBI API 403 — device not authorized | Use authorized device IDs only |
| 6 | Self-signed certificate rejection | Ensure `NODE_EXTRA_CA_CERTS` is absolute path |
| 7 | Windows line endings in .sh files | Run `sed -i 's/\r//' *.sh` |
| 8 | DA Engine cache lost on restart | Now persisted to Redis (DB 1, 60s interval) |
| 9 | Slow DB writes from DA Engine | Now uses COPY protocol (5-10x faster) |
| 10 | Frontend shows stale data | React Query auto-refetches (30s for summary, 10s for live-whi) |
| 11 | Heatmap returns empty data | Fixed pattern mismatch: was `T1_L1` (underscore), now `T1-L1` (dash) to match washroom_id format |
| 12 | DA Engine Redis fails in Docker | Added `REDIS_HOST=washroom-redis` and `REDIS_PORT=6379` to docker-compose.yml |
| 13 | Redis healthcheck malformed | Fixed missing space before `--no-auth-warning` in docker-compose.yml |

---

## 18. Stopping All Services

```bash
# Stop Portal
taskkill /IM node.exe /F  # Windows
# pkill -f "next dev"     # Linux/Mac

# Stop DA Engine
cd da-engine && docker compose down

# Stop WMS Backend
cd aai-wms-backend && docker compose down

# Nuclear option
docker stop $(docker ps -q)
```

---

## 19. Testing Checklist

### DA Engine → Frontend (Verified Working)
- [x] `/api/da/summary` returns 200 with washroom data
- [x] `/api/da/incidents` returns 200 with incident list
- [x] `/api/da/trends` returns 200 with 7-day trends
- [x] `/api/da/live-whi` returns 200 with live WHI
- [x] Charts receive computed data from DA Engine (not hardcoded)
- [x] Heatmap receives hourly data from WMS Backend (not random)
- [x] React Query hooks auto-refetch data (useDASummary, useDAIncidents)
- [x] ISR caching reduces proxy route latency

### WMS Backend → Frontend (Needs Docker)
- [ ] `/api/wms/status` returns floor states from Redis
- [ ] Acknowledge button calls WMS Backend state machine
- [ ] Resolve button calls WMS Backend state machine
- [ ] Floor status cards show real-time floor states
- [ ] MQTT indicator shows connectivity status
- [ ] User zone/shift editing updates WMS Backend
- [ ] Audit tabs show raw telemetry, incident events, escalations
- [ ] Heatmap shows real hourly occupancy from TimescaleDB

### Database Optimizations
- [ ] TimescaleDB continuous aggregates refresh every 5/10 minutes
- [ ] Retention policies active (90d telemetry, 1yr incidents)
- [ ] DA Engine Redis cache persists across restarts
- [ ] Telemetry Bridge uses COPY protocol

### WebSocket Real-time
- [ ] DA Engine health endpoint shows WebSocket stats
- [ ] WMS Backend health endpoint shows WebSocket stats
- [ ] DA Engine WebSocket `/ws` accepts connections and sends initial snapshot
- [ ] WMS Backend WebSocket `/ws` accepts connections and sends floor status
- [ ] Frontend `useRealtime()` hook connects to both WebSockets
- [ ] Admin Dashboard shows "Live" indicator when WebSocket connected
- [ ] Terminal Dashboard shows "Live" indicator when WebSocket connected
- [ ] Telemetry updates push to frontend within 1 second of poll cycle
- [ ] Incidents push to frontend immediately on breach detection
- [ ] Floor status updates push to frontend on MQTT message
- [ ] Auto-reconnect works when WebSocket connection drops
- [ ] SSE fallback works at /api/sse/telemetry

### End-to-End Flow
- [ ] Start all 3 services (WMS Backend + DA Engine + Portal)
- [ ] Upload test telemetry to NSCBI API
- [ ] Wait 30 seconds for DA Engine to poll
- [ ] Admin Dashboard shows live WHI data
- [ ] Admin Analytics charts show computed data
- [ ] Terminal Incidents page shows Ack/Resolve buttons
- [ ] Terminal Dashboard shows floor status cards
- [ ] Device Status shows MQTT connectivity
- [ ] Admin Audit Logs shows all 4 data tabs
- [ ] Admin Users page allows zone/shift editing

### Performance Benchmarks
- [ ] DA Engine lists 36 device files in <5s (parallel)
- [ ] DA Engine processes 5 files concurrently in <10s
- [ ] Telemetry Bridge syncs 54 records via COPY in <1s
- [ ] Frontend dashboard loads in <2s with ISR cache
- [ ] React Query deduplicates concurrent fetches

---

## 20. Undocumented Features (Added During Development)

This section documents features that were implemented but not previously recorded in the README.

### 20.1 WMS Backend — Undocumented Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/ws` | WebSocket | Real-time push of floor status, incidents, telemetry | No (upgrade) |
| `/analytics/heatmap` | GET | Hourly occupancy heatmap from TimescaleDB continuous aggregates | Yes |
| `/audit/raw-telemetry` | GET | Raw MQTT audit trail (14-day retention) | Yes |
| `/audit/incident-events` | GET | Incident state transition audit (1-year retention) | Yes |
| `/audit/floor-escalations` | GET | Floor escalation events (1-year retention) | Yes |

### 20.2 WMS Backend — Continuous Aggregates

TimescaleDB materialized views that auto-refresh:
- `whi_hourly_summary` — Refreshes every 5 minutes, retains 1 year
- `whi_daily_summary` — Refreshes every 10 minutes, retains 2 years

### 20.3 WMS Backend — Data Retention Policies

| Table | Retention | Purpose |
|-------|-----------|---------|
| `raw_telemetry_audit` | 14 days | Raw MQTT message audit |
| `washroom_telemetry` | 90 days | Time-series sensor data |
| `incident_events` | 1 year | Incident state transitions |
| `floor_escalation_events` | 1 year | Floor escalation events |
| `whi_daily_summary` | 2 years | Daily WHI aggregates |

### 20.4 WMS Backend — User Roles Seeded

Additional roles beyond documented `operator`, `supervisor`:
- `admin` — Full admin access
- `supervisor_global` — Global supervisor access

### 20.5 DA Engine — Undocumented Endpoints

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| `/ws` | WebSocket | Real-time telemetry push | No (upgrade) |
| `/api/sse/telemetry` | GET | SSE fallback for telemetry (2s interval) | No |
| `/api/terminals` | GET | All terminals summary | No |
| `/api/terminals/{id}` | GET | Single terminal detail | No |
| `/api/levels/{terminal}/{level}` | GET | Floor-level analytics | No |
| `/api/washrooms/{device_id}` | GET | Single washroom detail | No |
| `/api/seed` | POST | Seed telemetry records (testing) | No |
| `/api/dashboard/live-whi` | GET | Live WHI snapshot with rankings | No |
| `/api/heatmap/terminals/{id}/floors/{level}/washrooms` | GET | Floor heatmap data | No |

### 20.6 DA Engine — TelemetryBridge

The DA Engine syncs its in-memory cache to TimescaleDB via a high-throughput bridge:
- Uses PostgreSQL COPY protocol for bulk inserts (5-10x faster than executemany)
- Falls back to executemany if COPY fails
- Runs every 30 seconds (matching polling interval)
- Connection: `WMS_PG_HOST:WMS_PG_PORT` (Docker: `washroom-timescaledb:5432`)

### 20.7 DA Engine — Redis Crash Recovery

The DA Engine persists its cache to Redis every 60 seconds:
- On startup, attempts to restore cache from Redis before polling
- If Redis is unavailable, falls back to in-memory only
- Redis key pattern: `da:telemetry:{device_id}`, `da:active_incidents`, `da:airport_summary`
- Cache TTL: 300 seconds (configurable via `REDIS_CACHE_TTL`)

### 20.8 DA Engine — Monitoring Module

Located at `app/monitoring/`:
- `metrics.py` — Request metrics collection
- `uptime.py` — Service uptime tracking

### 20.9 Portal — useRealtime Hook

The `useRealtime()` hook (`src/hooks/useRealtime.ts`) provides:
- Dual WebSocket connections (DA Engine + WMS Backend)
- Singleton WebSocketManager pattern (shared across components)
- 30-second ping keepalive
- Auto-reconnect on connection drop
- React Query cache invalidation on incoming messages
- SSE fallback via `useSSEFallback()` hook
- Events handled: `telemetry:update`, `incidents:update`, `summary:update`, `live_whi:update`, `mqtt:telemetry`, `floor_status:update`, `incident:new`, `alert:escalation`

### 20.10 Portal — Missing Hooks (Not Yet Implemented)

| Hook | Purpose | Status |
|------|---------|--------|
| `useWMSIncidentAction` | Acknowledge/resolve incidents via WMS Backend | Not implemented |
| `useReports` | Terminal reports CRUD | Not implemented |
| `useAdminUsers` | WMS admin user management | Not implemented |

---

## 21. Integration Notes

### 21.1 Service Communication Map

```
Browser (port 3000)
  ├── /api/da/*  ──ISR cache──→  DA Engine (port 8001)
  ├── /api/wms/* ──JWT auth──→   WMS Backend (port 443 via HAProxy)
  └── WebSocket  ─────────────→  DA Engine + WMS Backend (dual connection)

DA Engine (port 8001)
  ├── NSCBI Airport API (external, 30s poll)
  ├── Redis (port 6389, persistent cache)
  └── TimescaleDB (via TelemetryBridge, 30s sync)

WMS Backend (port 443)
  ├── EMQX (MQTT broker, mTLS)
  ├── Redis (port 6389, state store)
  └── TimescaleDB (telemetry storage)
```

### 21.2 Known Integration Issues

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | WMS proxy routes (`/api/wms/*`) are public — unauthenticated users can call incident actions | HIGH | Open |
| 2 | Browser WebSocket to `wss://localhost:443/ws` fails with self-signed cert | MEDIUM | Known limitation |
| 3 | `daClient.ts` has wrong paths (unused — proxy routes work correctly) | LOW | Open |
| 4 | WebSocket reconnect uses fixed 3s delay, not exponential backoff | LOW | Open |

### 21.3 Security Notes

- WMS Backend API routes are marked public in middleware but use server-side JWT
- The `operator` JWT has limited permissions (cannot admin, but can acknowledge/resolve)
- Self-signed certificates require `NODE_TLS_REJECT_UNAUTHORIZED=0` in development
- All Docker secrets are mounted at `/run/secrets/` (never baked into images)
#   F I N A L _ A A I _ W M S  
 