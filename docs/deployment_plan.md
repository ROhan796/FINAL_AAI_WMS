# Cloud Migration Plan: Docker → Cloud Deployment

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current Architecture](#2-current-architecture)
3. [Target Architecture](#3-target-architecture)
4. [Pre-Requisites](#4-pre-requisites)
5. [Phase 1: Create Cloud Docker Compose](#5-phase-1-create-cloud-docker-compose)
6. [Phase 2: Update HAProxy Configuration](#6-phase-2-update-haproxy-configuration)
7. [Phase 3: Update Environment Variables](#7-phase-3-update-environment-variables)
8. [Phase 4: Deploy HAProxy Layer to Cloud VM](#8-phase-4-deploy-haproxy-layer-to-cloud-vm)
9. [Phase 5: Deploy Backend Services to Render](#9-phase-5-deploy-backend-services-to-render)
10. [Phase 6: Deploy Frontend to Vercel](#10-phase-6-deploy-frontend-to-vercel)
11. [Phase 7: HAProxy Config Sync via rsync](#11-phase-7-haproxy-config-sync-via-rsync)
12. [Phase 8: SSL/TLS Certificate Setup](#12-phase-8-ssltls-certificate-setup)
13. [Verification & Testing](#13-verification--testing)
14. [Rollback Plan](#14-rollback-plan)
15. [Environment Variables Reference](#15-environment-variables-reference)

---

## 1. Executive Summary

This document outlines the migration of the AAI Smart Washroom System from a fully local Docker-based deployment to a cloud-native architecture. The key change is:

- **Keep ONLY HAProxy on Hostinger VPS** (single Ubuntu VM, Docker Compose, Let's Encrypt SSL)
- **Move ALL other services to cloud**: EMQX Cloud, Upstash Redis, NeonDB PostgreSQL, Render for FastAPI & DA Engine, Vercel for Next.js Portal

### Migration Scope

| Component | Current State | Target State |
|-----------|---------------|--------------|
| HAProxy | Docker containers (x2) | Single container on Hostinger VPS (~$4-6/mo) |
| Keepalived | Docker containers (x2) | Removed (single VPS, not needed) |
| EMQX MQTT (x3) | Docker cluster | EMQX Cloud (managed) |
| TimescaleDB | Docker container | NeonDB (serverless) |
| Redis | Docker container | Upstash (serverless) |
| FastAPI Backend | Docker container | Render (PaaS) |
| DA Engine | Docker container | Render (PaaS) |
| Next.js Portal | Local dev server | Vercel (serverless) |

---

## 2. Current Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        LOCAL DOCKER STACK                            │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                    Docker Networks                           │   │
│   │                                                              │   │
│   │   frontend (172.20.1.0/24)     backend (172.20.2.0/24)      │   │
│   │                                                              │   │
│   │   ┌──────────────┐    ┌──────────────┐                      │   │
│   │   │   HAProxy1   │    │   HAProxy2   │  ← Load Balancers   │   │
│   │   │  VIP: .10    │    │              │                      │   │
│   │   │  MASTER      │    │  BACKUP      │                      │   │
│   │   └──────────────┘    └──────────────┘                      │   │
│   │                                                              │   │
│   │   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │   │
│   │   │   EMQX 1     │    │   EMQX 2     │    │   EMQX 3     │ │   │
│   │   │  MQTT Broker │    │  MQTT Broker │    │  MQTT Broker │ │   │
│   │   └──────────────┘    └──────────────┘    └──────────────┘ │   │
│   │                                                              │   │
│   │   ┌──────────────┐    ┌──────────────┐                      │   │
│   │   │   FastAPI    │    │   Redis      │                      │   │
│   │   │  (WMS)       │    │  (Cache)     │                      │   │
│   │   └──────────────┘    └──────────────┘                      │   │
│   │                                                              │   │
│   │   ┌──────────────┐                                          │   │
│   │   │ TimescaleDB  │    ← data network (172.20.3.0/24)        │   │
│   │   └──────────────┘                                          │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   ┌──────────────┐    ┌──────────────┐                              │
│   │  DA Engine   │    │  Next.js     │                              │
│   │  (Docker)    │    │  Portal      │                              │
│   └──────────────┘    └──────────────┘                              │
└─────────────────────────────────────────────────────────────────────┘
```

### Current docker-compose.yml Services (10 containers)

| Service | Image | Ports | Network |
|---------|-------|-------|---------|
| emqx1 | emqx:5.8 | - | frontend, backend |
| emqx2 | emqx:5.8 | - | frontend, backend |
| emqx3 | emqx:5.8 | - | frontend, backend |
| haproxy1 | haproxy:2.8-alpine | 8883, 18083, 443 | frontend, backend |
| haproxy2 | haproxy:2.8-alpine | - | frontend, backend |
| keepalived1 | osixia/keepalived:2.0.20 | - | service:haproxy1 |
| keepalived2 | osixia/keepalived:2.0.20 | - | service:haproxy2 |
| fastapi | custom build | - | frontend, backend, data |
| redis | redis:7.2-alpine | 6389 | data |
| timescaledb | timescale/timescaledb | 5433 | data |

---

## 3. Target Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CLOUD INFRASTRUCTURE                               │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │         Oracle Cloud Free Tier VMs (2x ARM A1.Flex)         │   │
│   │         VM.Standard.A1.Flex (1 OCPU / 6GB RAM, forever free)│   │
│   │                                                              │   │
│   │   ┌─────────────────────────────────────────────────────┐   │   │
│   │   │              Docker Containers (ONLY)                │   │   │
│   │   │                                                      │   │   │
│   │   │   ┌──────────────┐  rsync  ┌──────────────┐        │   │   │
│   │   │   │   HAProxy1   │◄───────►│   HAProxy2   │        │   │   │
│   │   │   │  + Keepalived│ (cron)  │  + Keepalived│        │   │   │
│   │   │   │  MASTER      │         │  BACKUP      │        │   │   │
│   │   │   │  VIP: .10    │         │              │        │   │   │
│   │   │   └──────────────┘         └──────────────┘        │   │   │
│   │   └─────────────────────────────────────────────────────┘   │   │
│   └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
│   ┌─────────────────────────────────────────────────────────────┐   │
│   │                   MANAGED CLOUD SERVICES                     │   │
│   │                                                              │   │
│   │   ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │   │
│   │   │  EMQX Cloud  │  │   Upstash    │  │    NeonDB     │    │   │
│   │   │  (MQTT)      │  │   (Redis)    │  │  (PostgreSQL) │    │   │
│   │   │              │  │              │  │  + Timescale   │    │   │
│   │   │  ke1040ef.ala│  │  ready-monkey│  │  ep-nameless  │    │   │
│   │   │  .us-east-1  │  │  -212683     │  │  -brook       │    │   │
│   │   │  .emqxsl.com │  │  .upstash.io │  │  .neon.tech   │    │   │
│   │   └──────────────┘  └──────────────┘  └──────────────┘    │   │
│   │                                                              │   │
│   │   ┌──────────────────────┐  ┌──────────────────────┐      │   │
│   │   │  Render              │  │  Render               │      │   │
│   │   │  FastAPI Backend     │  │  DA Engine            │      │   │
│   │   │  Port 8000           │  │  Port 8001            │      │   │
│   │   │  your-wms-backend.   │  │  your-da-engine.      │      │   │
│   │   │  onrender.com        │  │  onrender.com         │      │   │
│   │   └──────────────────────┘  └──────────────────────┘      │   │
│   │                                                              │   │
│   │   ┌──────────────────────┐                                  │   │
│   │   │  Vercel              │                                  │   │
│   │   │  Next.js Portal      │                                  │   │
│   │   │  your-app.vercel.app │                                  │   │
│   │   └──────────────────────┘                                  │   │
│   └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Target Services Summary

| Component | Service | Host | Port |
|-----------|---------|------|------|
| HAProxy 1 | Docker on VM | Oracle Cloud Free Tier VM (VM.Standard.A1.Flex, 1 OCPU / 6GB RAM, forever free) | 8883, 18083, 443 |
| HAProxy 2 | Docker on VM | Oracle Cloud Free Tier VM (VM.Standard.A1.Flex, 1 OCPU / 6GB RAM, forever free) | - |
| Keepalived | Docker on VM | VIP: 172.20.1.10 (frontend network) | - |
| EMQX MQTT | EMQX Cloud | ke1040ef.ala.us-east-1.emqxsl.com | 8883 |
| Redis | Upstash | ready-monkey-212683.upstash.io | 6379 |
| PostgreSQL | NeonDB | ep-nameless-brook-ah66rf6f-pooler | 5432 |
| FastAPI | Render | your-wms-backend.onrender.com | 443 |
| DA Engine | Render | your-da-engine.onrender.com | 443 |
| Next.js | Vercel | your-app.vercel.app | 443 |

> **Note**: HAProxy runs on 2 Oracle Cloud Free Tier VMs with Keepalived for high availability. Config sync between nodes is handled via rsync cron job (see `setup-haproxy-sync.md`).

---

## 4. Pre-Requisites

### Cloud Accounts Required

- [ ] **Oracle Cloud Free Tier** — Cloud VMs for HAProxy (free forever, 2 ARM instances)
- [ ] **Render** — Backend hosting (free tier)
- [ ] **Vercel** — Frontend hosting (free tier)
- [ ] **NeonDB** — PostgreSQL (free tier: 0.5GB)
- [ ] **Upstash** — Redis (free tier: 10K commands/day)
- [ ] **EMQX Cloud** — MQTT broker (already configured)
- [ ] **Cloudflare** — DNS + SSL (free tier)

### Tools Required

- Docker & Docker Compose installed on cloud VM
- rsync for config synchronization
- SSH access to cloud VM
- GitHub repository access

---

## 5. Phase 1: Create Cloud Docker Compose

### File: `aai-wms-backend/docker-compose.cloud.yml`

This file contains ONLY the HAProxy + Keepalived services. All other services (EMQX, Redis, TimescaleDB, FastAPI) are removed since they run in the cloud.

```yaml
x-logging: &default-logging
  driver: "json-file"
  options:
    max-size: "10m"
    max-file: "3"

services:
  # ─────────────────────────────────────────────────────────
  # HAProxy Load Balancer - Node 1 (MASTER)
  # ─────────────────────────────────────────────────────────
  haproxy1:
    image: haproxy:2.8-alpine
    container_name: haproxy1
    restart: unless-stopped
    ports:
      - "8883:8883"    # MQTT over SSL (TCP pass-through)
      - "18083:18083"  # EMQX Dashboard over SSL
      - "443:443"      # FastAPI over SSL
    volumes:
      - ./haproxy/haproxy-cloud.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro
      - ./certs/haproxy:/etc/haproxy/certs:ro
    networks:
      frontend:
        ipv4_address: 172.20.1.100
      backend:
        ipv4_address: 172.20.2.100
    logging: *default-logging
    healthcheck:
      test: ["CMD", "haproxy", "-c", "-f", "/usr/local/etc/haproxy/haproxy.cfg"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ─────────────────────────────────────────────────────────
  # Keepalived - Node 1 (MASTER)
  # ─────────────────────────────────────────────────────────
  keepalived1:
    image: osixia/keepalived:2.0.20
    container_name: keepalived1
    network_mode: "service:haproxy1"
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - NET_BROADCAST
    environment:
      - KEEPALIVED_INTERFACE=eth0
      - KEEPALIVED_VIRTUAL_IPS=172.20.1.10
      - KEEPALIVED_UNICAST_PEERS=#PYTHON2BASH:['172.20.1.101']
      - KEEPALIVED_STATE=MASTER
      - KEEPALIVED_PRIORITY=101
      - KEEPALIVED_ROUTER_ID=51
    depends_on:
      - haproxy1
    restart: unless-stopped

  # ─────────────────────────────────────────────────────────
  # HAProxy Load Balancer - Node 2 (BACKUP)
  # ─────────────────────────────────────────────────────────
  haproxy2:
    image: haproxy:2.8-alpine
    container_name: haproxy2
    restart: unless-stopped
    volumes:
      - ./haproxy/haproxy-cloud.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro
      - ./certs/haproxy:/etc/haproxy/certs:ro
    networks:
      frontend:
        ipv4_address: 172.20.1.101
      backend:
        ipv4_address: 172.20.2.101
    logging: *default-logging
    healthcheck:
      test: ["CMD", "haproxy", "-c", "-f", "/usr/local/etc/haproxy/haproxy.cfg"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ─────────────────────────────────────────────────────────
  # Keepalived - Node 2 (BACKUP)
  # ─────────────────────────────────────────────────────────
  keepalived2:
    image: osixia/keepalived:2.0.20
    container_name: keepalived2
    network_mode: "service:haproxy2"
    cap_add:
      - NET_ADMIN
      - NET_RAW
      - NET_BROADCAST
    environment:
      - KEEPALIVED_INTERFACE=eth0
      - KEEPALIVED_VIRTUAL_IPS=172.20.1.10
      - KEEPALIVED_UNICAST_PEERS=#PYTHON2BASH:['172.20.1.100']
      - KEEPALIVED_STATE=BACKUP
      - KEEPALIVED_PRIORITY=100
      - KEEPALIVED_ROUTER_ID=51
    depends_on:
      - haproxy2
    restart: unless-stopped

networks:
  frontend:
    name: frontend
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.1.0/24
  backend:
    name: backend
    driver: bridge
    ipam:
      config:
        - subnet: 172.20.2.0/24
```

### Key Changes from Original docker-compose.yml

| Removed | Reason |
|---------|--------|
| emqx1, emqx2, emqx3 | Using EMQX Cloud |
| fastapi | Deploying to Railway |
| redis | Using Upstash |
| timescaledb | Using NeonDB |
| data network | No local data services |
| All Docker secrets | Using environment variables |

---

## 6. Phase 2: Update HAProxy Configuration

### File: `aai-wms-backend/haproxy/haproxy-cloud.cfg`

This configuration points to cloud services instead of Docker container names.

```haproxy
# ══════════════════════════════════════════════════════════════
# HAProxy Cloud Configuration
# Points to: EMQX Cloud, Railway FastAPI, Railway DA Engine
# ══════════════════════════════════════════════════════════════

global
    log stdout format raw local0
    maxconn 4096
    tune.ssl.default-dh-param 2048

defaults
    log     global
    mode    tcp
    timeout connect 10s
    timeout client  100s
    timeout server  100s
    option  tcplog
    option  dontlognull
    retries 3

# ─────────────────────────────────────────────────────────────
# MQTT SSL (8883) - TCP Pass-through to EMQX Cloud
# ─────────────────────────────────────────────────────────────
frontend mqtt_ssl_front
    bind *:8883
    mode tcp
    default_backend mqtt_ssl_back

backend mqtt_ssl_back
    mode tcp
    balance roundrobin
    option ssl-hello-chk
    server emqx-cloud ke1040ef.ala.us-east-1.emqxsl.com:8883 check inter 5s fall 3 rise 2

# ─────────────────────────────────────────────────────────────
# EMQX Dashboard SSL (18083) - HTTP to EMQX Cloud Dashboard
# ─────────────────────────────────────────────────────────────
frontend dashboard_front
    mode http
    bind *:18083 ssl crt /etc/haproxy/certs/api.pem
    default_backend dashboard_back

backend dashboard_back
    mode http
    balance roundrobin
    option httpchk GET /status
    http-check expect status 200
    server emqx-dash ke1040ef.ala.us-east-1.emqxsl.com:18083 check inter 10s

# ─────────────────────────────────────────────────────────────
# FastAPI API HTTPS (443) - HTTP to Render
# ─────────────────────────────────────────────────────────────
frontend api_https_front
    mode http
    bind *:443 ssl crt /etc/haproxy/certs/api.pem
    acl is_websocket hdr(Upgrade) -i websocket
    http-request set-header X-Forwarded-Proto https
    use_backend fastapi_backend if is_websocket
    default_backend fastapi_backend

backend fastapi_backend
    mode http
    balance roundrobin
    timeout tunnel 3600s
    timeout server 100s
    option httpchk GET /health
    http-check expect status 200
    http-request set-header X-Forwarded-Proto https
    server fastapi your-wms-backend.onrender.com:443 check inter 10s fall 3 rise 2 ssl verify none

# ─────────────────────────────────────────────────────────────
# DA Engine HTTPS (8001) - HTTP to Render
# ─────────────────────────────────────────────────────────────
frontend da_engine_front
    mode http
    bind *:8001 ssl crt /etc/haproxy/certs/api.pem
    default_backend da_engine_back

backend da_engine_back
    mode http
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200
    http-request set-header X-Forwarded-Proto https
    server da-engine your-da-engine.onrender.com:443 check inter 10s fall 3 rise 2 ssl verify none
```

### Configuration Changes Summary

| Original | Cloud | Why |
|----------|-------|-----|
| `server emqx1 emqx1:8883` | `server emqx-cloud ke1040ef...emqxsl.com:8883` | EMQX moved to cloud |
| `server fastapi fastapi:8000` | `server fastapi your-wms-backend.onrender.com:443` | FastAPI moved to Render |
| No DA Engine backend | `server da-engine your-da-engine.onrender.com:443` | Added for DA Engine |
| No health checks | Added `option httpchk` | Cloud services need health verification |

---

## 7. Phase 3: Update Environment Variables

### 7.1: aai-wms-backend/.env2

```bash
# ── App ──
APP_ENV=production

# ── TimescaleDB (Cloud — NeonDB) ──
# Already configured for cloud - no changes needed
DATABASE_URL=postgresql://neondb_owner:npg_cSwQX39dFCUP@ep-nameless-brook-ah66rf6f-pooler.c-3.us-east-1.aws.neon.tech/timescaledb?sslmode=require
POSTGRES_URL=postgresql://neondb_owner:npg_cSwQX39dFCUP@ep-nameless-brook-ah66rf6f-pooler.c-3.us-east-1.aws.neon.tech/timescaledb?sslmode=require
POSTGRES_SUPERUSER_URL=postgresql://neondb_owner:npg_cSwQX39dFCUP@ep-nameless-brook-ah66rf6f-pooler.c-3.us-east-1.aws.neon.tech/timescaledb?sslmode=require

# ── Upstash Redis (DB 0 — WMS Backend) ──
# Already configured for cloud - no changes needed
REDIS_URL=rediss://default:gQAAAAAAAz7LAAIgcDI0N2I3YTIzNzY3NDM0NjgzOThhMzAwMmZjYzZiNDk1OQ@ready-monkey-212683.upstash.io:6379/0
REDIS_HOST=ready-monkey-212683.upstash.io
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=gQAAAAAAAz7LAAIgcDI0N2I3YTIzNzY3NDM0NjgzOThhMzAwMmZjYzZiNDk1OQ

# ── MQTT (EMQX Cloud) ──
# Already configured for cloud - no changes needed
MQTT_HOST=ke1040ef.ala.us-east-1.emqxsl.com
MQTT_PORT=8883
MQTT_USE_TLS=true
MQTT_WS_PORT=8084
MQTT_USER=aai-backend
MQTT_PASSWORD=AaiBackend@2026!
MQTT_CA_CERT_PATH=/etc/haproxy/certs/emqx/ca.crt

# ── EMQX API ──
EMQX_API_ENDPOINT=https://ke1040ef.ala.us-east-1.emqxsl.com:8443/api/v5
EMQX_API_KEY=i0ee1696
EMQX_API_SECRET=XZMMg0S7pJx_8lkA

# ── CORS (Update for cloud domain) ──
CORS_ALLOW_ORIGINS=https://your-app.vercel.app
CORS_ORIGINS=https://your-app.vercel.app

# ── Render Backend URL (for inter-service communication) ──
RAILWAY_BACKEND_URL=https://your-wms-backend.onrender.com
RAILWAY_DA_ENGINE_URL=https://your-da-engine.onrender.com
```

### 7.2: da-engine/.env2

```bash
# ── App ──
APP_ENV=production
ENVIRONMENT=production
LOG_LEVEL=INFO
DA_ENGINE_HOST=0.0.0.0
DA_ENGINE_PORT=8001

# ── TimescaleDB (Cloud — NeonDB) ──
# Already configured for cloud - no changes needed
DATABASE_URL=postgresql://neondb_owner:npg_cSwQX39dFCUP@ep-nameless-brook-ah66rf6f-pooler.c-3.us-east-1.aws.neon.tech/timescaledb?sslmode=require

# ── Upstash Redis (DB 0 — shared with WMS Backend) ──
# Already configured for cloud - no changes needed
REDIS_URL=rediss://default:gQAAAAAAAz7LAAIgcDI0N2I3YTIzNzY3NDM0NjgzOThhMzAwMmZjYzZiNDk1OQ@ready-monkey-212683.upstash.io:6379/0
REDIS_HOST=ready-monkey-212683.upstash.io
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=gQAAAAAAAz7LAAIgcDI0N2I3YTIzNzY3NDM0NjgzOThhMzAwMmZjYzZiNDk1OQ
REDIS_CACHE_TTL=300

# ── NSCBI Airport API ──
NSCBI_API_BASE_URL=https://api.nscbiairport.com/api
NSCBI_API_KEY=EY9kocR7OOFfkJBXXLYrQFs84HEyI1OJDUjJcbwfsDVOqXvcFau3eqBdG6ZHZ2Fe

# ── Polling ──
POLLING_INTERVAL_SECONDS=30
SCHEDULER_ENABLED=true

# ── CORS (Update for cloud domain) ──
CORS_ALLOW_ORIGIN=https://your-app.vercel.app
CORS_ORIGINS=https://your-app.vercel.app
```

### 7.3: aai-unified-portal/.env2

```bash
# ── Neon PostgreSQL (Portal) ──
# Already configured for cloud - no changes needed
DATABASE_URL=postgresql://neondb_owner:npg_cSwQX39dFCUP@ep-nameless-brook-ah66rf6f.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require
POSTGRES_URL=postgresql://neondb_owner:npg_cSwQX39dFCUP@ep-nameless-brook-ah66rf6f.c-3.us-east-1.aws.neon.tech/neondb?sslmode=require

# ── Clerk Auth ──
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_anVzdC1qYXZlbGluLTIxLmNsZXJrLmFjY291bnRzLmRldiQ
CLERK_SECRET_KEY=sk_test_F0q13PIgh1w9vZmtV43v4fjtENW7TgB4rR1YiZ7crJ
CLERK_WEBHOOK_SECRET=whsec_5q0Ek14eBBKUSYq21F3QQJHPpYyqwkLY
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/api/auth/redirect

# ── App (Update for cloud domain) ──
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NODE_ENV=production

# ── DA Engine (Render URL) ──
DA_ENGINE_URL=https://your-da-engine.onrender.com
NEXT_PUBLIC_DA_ENGINE_URL=https://your-da-engine.onrender.com

# ── WMS Backend (Render URL) ──
NEXT_PUBLIC_WMS_API_URL=https://your-wms-backend.onrender.com
WMS_BACKEND_URL=https://your-wms-backend.onrender.com
WMS_JWT_OPERATOR_USER=operator
WMS_JWT_OPERATOR_PASS=N3fc/fiIi55E3+O4qr4FRw==

# ── Upstash Redis ──
UPSTASH_REDIS_REST_URL="https://ready-monkey-212683.upstash.io"
UPSTASH_REDIS_REST_TOKEN="gQAAAAAAAz7LAAIgcDI0N2I3YTIzNzY3NDM0NjgzOThhMzAwMmZjYzZiNDk1OQ"
```

---

## 8. Phase 4: Deploy HAProxy Layer to Cloud VM

### Step 8.1: Provision Cloud VM

**Oracle Cloud Free Tier (Recommended - Free Forever)**
```bash
# 1. Sign up at https://cloud.oracle.com
# 2. Create 2 ARM instances (VM.Standard.A1.Flex)
#    - OCPU: 1 per instance
# 3. Select Ubuntu 22.04
# 4. Upload SSH public key
# Note: Free Tier includes 4 ARM OCPUs and 24GB RAM total
```

**Alternative: Hetzner Cloud (Paid)**
```bash
# 1. Sign up at https://hetzner.com
# 2. Create CPX11 server (2 vCPU, 2GB RAM, €4.50/mo)
# 3. Select Ubuntu 22.04
```

**Alternative: DigitalOcean (Paid)**
```bash
# 1. Sign up at https://digitalocean.com
# 2. Create Droplet (Basic, Regular, $6/mo)
# 3. Select Ubuntu 22.04
```

### Step 8.2: Initial VM Setup

```bash
# SSH into VM
ssh -i ~/.ssh/your-key root@YOUR_VM_IP

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Install Docker Compose
apt install docker-compose-plugin -y

# Verify Docker
docker --version
docker compose version

# Create project directory
mkdir -p /opt/aai-wms-backend
cd /opt/aai-wms-backend
```

### Step 8.3: Deploy HAProxy Stack

```bash
# Clone repository
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

# Verify
docker compose ps
docker compose logs -f
```

### Step 8.4: Verify HAProxy is Running

```bash
# Check HAProxy status
docker exec haproxy1 haproxy -c -f /usr/local/etc/haproxy/haproxy.cfg

# Check Keepalived status
docker exec keepalived1 ip addr show

# Test MQTT port (should connect to EMQX Cloud)
nc -zv YOUR_VM_IP 8883

# Test API port (should connect to Railway)
nc -zv YOUR_VM_IP 443
```

---

## 9. Phase 5: Deploy Backend Services to Render

### Step 9.1: Deploy WMS Backend (FastAPI)

1. **Push code to GitHub**
   ```bash
   cd /path/to/Fullstack_Unification
   git add .
   git commit -m "Cloud migration: HAProxy only in Docker"
   git push origin main
   ```

2. **Create Render Project**
   - Go to https://render.com
   - Click "New" → "Web Service"
   - Select "Build and deploy from a Git repository"
   - Select the repository
   - Set **Root Directory**: `aai-wms-backend`
   - Set **Runtime**: Docker
   - Set **Port**: 8000
   - Set **Instance Type**: Free

3. **Set Environment Variables in Render**

   Copy from `aai-wms-backend/.env2`:
   ```bash
   APP_ENV=production
   DATABASE_URL=postgresql://neondb_owner:...
   REDIS_URL=rediss://default:...
   MQTT_HOST=ke1040ef.ala.us-east-1.emqxsl.com
   MQTT_PORT=8883
   MQTT_USE_TLS=true
   CORS_ALLOW_ORIGINS=https://your-app.vercel.app
   CORS_ORIGINS=https://your-app.vercel.app
   # ... (all variables from .env2)
   ```

4. **Deploy**
   - Render auto-detects the Dockerfile
   - Click "Deploy"
   - Wait for build to complete
   - Note the Render URL: `https://your-wms-backend.onrender.com`

5. **Verify**
   ```bash
   curl https://your-wms-backend.onrender.com/health
   ```

### Step 9.2: Deploy DA Engine

1. **Create Render Project**
   - Click "New" → "Web Service"
   - Set **Root Directory**: `da-engine`
   - Set **Runtime**: Docker
   - Set **Port**: 8001
   - Set **Instance Type**: Free

2. **Set Environment Variables**
   ```bash
   APP_ENV=production
   DA_ENGINE_PORT=8001
   DATABASE_URL=postgresql://neondb_owner:...
   REDIS_URL=rediss://default:...
   NSCBI_API_BASE_URL=https://api.nscbiairport.com/api
   CORS_ALLOW_ORIGIN=https://your-app.vercel.app
   CORS_ORIGINS=https://your-app.vercel.app
   # ... (all variables from da-engine/.env2)
   ```

3. **Deploy & Verify**
   ```bash
   curl https://your-da-engine.onrender.com/health
   ```

---

## 10. Phase 6: Deploy Frontend to Vercel

### Step 10.1: Connect GitHub to Vercel

1. Go to https://vercel.com
2. Click "Add New Project" → Import repository
3. Set **Root Directory**: `aai-unified-portal`
4. Framework Preset: **Next.js**

### Step 10.2: Set Environment Variables

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
CLERK_WEBHOOK_SECRET=whsec_...

# Neon PostgreSQL
DATABASE_URL=postgresql://neondb_owner:...

# Backend URLs (Render endpoints)
NEXT_PUBLIC_DA_ENGINE_URL=https://your-da-engine.onrender.com
DA_ENGINE_URL=https://your-da-engine.onrender.com
NEXT_PUBLIC_WMS_API_URL=https://your-wms-backend.onrender.com
WMS_BACKEND_URL=https://your-wms-backend.onrender.com

# App URL
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app

# Upstash Redis
UPSTASH_REDIS_REST_URL="https://ready-monkey-212683.upstash.io"
UPSTASH_REDIS_REST_TOKEN="gQAAAAAAAz7LAAIgcDI0N2I3YTIzNzY3NDM0NjgzOThhMzAwMmZjYzZiNDk1OQ"
```

### Step 10.3: Configure Clerk Webhook

1. Go to Clerk Dashboard → Webhooks
2. Add endpoint: `https://your-app.vercel.app/api/webhook/clerk`
3. Select events: `user.created`, `user.updated`, `user.deleted`

### Step 10.4: Deploy

```bash
# Option A: Auto-deploy on git push
git push origin main

# Option B: Manual deploy
cd aai-unified-portal
npx vercel --prod
```

### Step 10.5: Run Database Migrations

```bash
cd aai-unified-portal
npx drizzle-kit push
```

---

## 11. Phase 7: HAProxy Config Sync via rsync

> **Note**: This section is critical for Oracle Cloud Free Tier deployment with 2 VMs. The rsync cron job ensures both HAProxy instances have identical configuration. See `setup-haproxy-sync.md` for detailed setup instructions.

### Step 11.1: Create Sync Script on Primary VM

```bash
# Create scripts directory
mkdir -p /opt/scripts

# Create sync script
cat > /opt/scripts/sync-haproxy.sh << 'EOF'
#!/bin/bash
# HAProxy Config Sync Script
# Syncs configuration from primary to backup VM

# Configuration
PRIMARY_VM="YOUR_PRIMARY_VM_IP"
BACKUP_VM="YOUR_BACKUP_VM_IP"
SSH_KEY="/root/.ssh/id_rsa"
HAPROXY_CONFIG_DIR="/opt/aai-wms-backend/aai-wms-backend/haproxy"
BACKUP_USER="root"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}[SYNC] Starting HAProxy config sync...${NC}"

# Sync config files
rsync -avz --delete \
    -e "ssh -i ${SSH_KEY}" \
    ${HAPROXY_CONFIG_DIR}/ \
    ${BACKUP_USER}@${BACKUP_VM}:/opt/aai-wms-backend/aai-wms-backend/haproxy/

if [ $? -eq 0 ]; then
    echo -e "${GREEN}[SYNC] Config sync successful${NC}"
    
    # Reload HAProxy on backup
    ssh -i ${SSH_KEY} ${BACKUP_USER}@${BACKUP_VM} \
        "docker exec haproxy2 kill -HUP 1"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[SYNC] HAProxy reloaded on backup${NC}"
    else
        echo -e "${RED}[SYNC] Failed to reload HAProxy on backup${NC}"
        exit 1
    fi
else
    echo -e "${RED}[SYNC] Config sync failed${NC}"
    exit 1
fi

echo -e "${GREEN}[SYNC] Sync complete${NC}"
EOF

# Make executable
chmod +x /opt/scripts/sync-haproxy.sh
```

### Step 11.2: Set Up Cron Job

```bash
# Add cron job (runs every 5 minutes)
echo "*/5 * * * * root /opt/scripts/sync-haproxy.sh >> /var/log/haproxy-sync.log 2>&1" > /etc/cron.d/haproxy-sync

# Set permissions
chmod 644 /etc/cron.d/haproxy-sync

# Verify cron is running
systemctl status cron
```

### Step 11.3: Test Sync Manually

```bash
# Run sync script manually
/opt/scripts/sync-haproxy.sh

# Check logs
cat /var/log/haproxy-sync.log

# Verify on backup VM
ssh -i /root/.ssh/id_rsa root@YOUR_BACKUP_VM_IP \
    "cat /opt/aai-wms-backend/aai-wms-backend/haproxy/haproxy-cloud.cfg"
```

---

## 12. Phase 8: SSL/TLS Certificate Setup

### Option A: Let's Encrypt (Recommended)

```bash
# Install certbot
apt install certbot -y

# Generate certificates
certbot certonly --standalone \
    -d your-domain.com \
    -d haproxy.your-domain.com

# Create HAProxy PEM bundle
cat /etc/letsencrypt/live/your-domain.com/fullchain.pem \
    /etc/letsencrypt/live/your-domain.com/privkey.pem \
    > /opt/aai-wms-backend/aai-wms-backend/certs/haproxy/api.pem

# Set permissions
chmod 600 /opt/aai-wms-backend/aai-wms-backend/certs/haproxy/api.pem

# Auto-renew cron
echo "0 0 1 * * root certbot renew --deploy-hook 'cat /etc/letsencrypt/live/your-domain.com/fullchain.pem /etc/letsencrypt/live/your-domain.com/privkey.pem > /opt/aai-wms-backend/aai-wms-backend/certs/haproxy/api.pem && docker exec haproxy1 kill -HUP 1 && docker exec haproxy2 kill -HUP 1'" > /etc/cron.d/certbot-renew
```

### Option B: Cloudflare SSL

If using Cloudflare DNS:
1. Enable SSL/TLS in Cloudflare dashboard
2. Set mode to "Full (Strict)"
3. HAProxy handles SSL termination with Cloudflare origin certificate

```bash
# Download Cloudflare origin certificate from dashboard
# Place in certs/haproxy/api.pem
```

### Option C: Self-Signed (Development Only)

```bash
# Generate self-signed certificate
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout /opt/aai-wms-backend/aai-wms-backend/certs/haproxy/api.key \
    -out /opt/aai-wms-backend/aai-wms-backend/certs/haproxy/api.crt

# Create PEM bundle
cat /opt/aai-wms-backend/aai-wms-backend/certs/haproxy/api.crt \
    /opt/aai-wms-backend/aai-wms-backend/certs/haproxy/api.key \
    > /opt/aai-wms-backend/aai-wms-backend/certs/haproxy/api.pem
```

---

## 13. Verification & Testing

### Step 13.1: Test HAProxy Endpoints

```bash
# Test MQTT SSL (should connect to EMQX Cloud)
mosquitto_sub -h YOUR_VM_IP -p 8883 --cafile ca.crt -t "test/topic"

# Test FastAPI (should connect to Railway)
curl -k https://YOUR_VM_IP/health

# Test DA Engine (should connect to Railway)
curl -k https://YOUR_VM_IP:8001/health

# Test EMQX Dashboard
curl -k https://YOUR_VM_IP:18083
```

### Step 13.2: Test End-to-End Flow

1. **Open Portal**: https://your-app.vercel.app
2. **Sign In**: Use Clerk authentication
3. **Check Dashboard**: Verify telemetry data is loading
4. **Check Real-time**: Verify WebSocket updates are working
5. **Check MQTT**: Verify sensor data is flowing

### Step 13.3: Test Failover

```bash
# Stop HAProxy1
docker stop haproxy1

# Verify VIP moves to HAProxy2
docker exec keepalived2 ip addr show

# Test endpoints still work
curl -k https://YOUR_VM_IP/health

# Restart HAProxy1
docker start haproxy1

# Verify VIP returns to HAProxy1
docker exec keepalived1 ip addr show
```

### Step 13.4: Monitoring Checklist

- [ ] HAProxy health checks passing
- [ ] Keepalived VIP failover working
- [ ] EMQX Cloud connection stable
- [ ] Upstash Redis connection stable
- [ ] NeonDB PostgreSQL connection stable
- [ ] Railway FastAPI responding
- [ ] Railway DA Engine responding
- [ ] Vercel Portal loading
- [ ] WebSocket connections established
- [ ] MQTT messages flowing
- [ ] rsync cron job running

---

## 14. Rollback Plan

### If Cloud Deployment Fails

1. **Stop cloud services**
   ```bash
   # On cloud VM
   cd /opt/aai-wms-backend/aai-wms-backend
   docker compose down
   ```

2. **Revert to local Docker**
   ```bash
   # On local machine
   cd aai-wms-backend
   cp docker-compose.yml.bak docker-compose.yml
   docker compose up -d
   ```

3. **Restore environment variables**
   ```bash
   # Revert .env2 files to original
   git checkout -- .env2
   ```

### Backup Commands

```bash
# Backup current docker-compose.yml
cp docker-compose.yml docker-compose.yml.bak

# Backup .env2 files
cp .env2 .env2.bak

# Backup haproxy config
cp haproxy/haproxy.cfg haproxy/haproxy.cfg.bak
```

---

## 15. Environment Variables Reference

### Quick Reference Table

| Variable | Service | Value |
|----------|---------|-------|
| `DATABASE_URL` | All | `postgresql://neondb_owner:npg_...@ep-nameless-brook-.../timescaledb?sslmode=require` |
| `REDIS_URL` | All | `rediss://default:gQAAAAAA...@ready-monkey-212683.upstash.io:6379/0` |
| `MQTT_HOST` | WMS Backend | `ke1040ef.ala.us-east-1.emqxsl.com` |
| `MQTT_PORT` | WMS Backend | `8883` |
| `MQTT_USE_TLS` | WMS Backend | `true` |
| `NSCBI_API_BASE_URL` | DA Engine | `https://api.nscbiairport.com/api` |
| `NEXT_PUBLIC_DA_ENGINE_URL` | Portal | `https://your-da-engine.onrender.com` |
| `NEXT_PUBLIC_WMS_API_URL` | Portal | `https://your-wms-backend.onrender.com` |
| `NEXT_PUBLIC_APP_URL` | Portal | `https://your-app.vercel.app` |

### Placeholder Values to Replace

| Placeholder | Replace With |
|-------------|--------------|
| `your-wms-backend.onrender.com` | Your Render WMS Backend URL |
| `your-da-engine.onrender.com` | Your Render DA Engine URL |
| `your-app.vercel.app` | Your Vercel Portal URL |
| `YOUR_VM_IP` | Your Oracle Cloud VM public IP |
| `YOUR_NODE2_IP` | Oracle Cloud VM 2 public IP |
| `172.20.1.10` | Keepalived VIP (frontend network) |

---

## Appendix A: Architecture Diagram (ASCII)

```
                                    INTERNET
                                       │
                    ┌──────────────────┼──────────────────┐
                    │                  │                    │
                    ▼                  ▼                    ▼
             ┌─────────────┐  ┌─────────────────────┐  ┌─────────────────┐
             │   Vercel    │  │  Oracle Cloud VMs    │  │  Render          │
             │  (Next.js)  │  │  (HAProxy + Keep)    │  │  (FastAPI)      │
             │             │  │                     │  │                 │
             │  your-app.  │  │  HAProxy1 + Keep    │  │  your-wms-      │
             │  vercel.app │  │  MASTER VIP:.10     │  │  backend.       │
             │             │  │                     │  │  onrender.com   │
             └──────┬──────┘  │  HAProxy2 + Keep    │  └────────┬────────┘
                    │         │  BACKUP              │           │
                    │         └──────────┬───────────┘           │
                    │                    │                       │
                    │         ┌──────────┴───────────┐           │
                    │         │                      │           │
                    │         ▼                      ▼           │
                    │  ┌────────────┐  ┌────────────┐           │
                    │  │ EMQX Cloud │  │ Upstash    │           │
                    │  │ (MQTT)     │  │ (Redis)    │           │
                    │  └────────────┘  └────────────┘           │
                    │                                           │
                    │         ┌────────────┐                    │
                    │         │  NeonDB    │                    │
                    │         │ (PostgreSQL)│                    │
                    │         └────────────┘                    │
                    │                                           │
                    └───────────────────────────────────────────┘
```

---

## Appendix B: Cost Estimate

| Component | Service | Monthly Cost |
|-----------|---------|--------------|
| Cloud VM (x2) | Oracle Cloud Free Tier (VM.Standard.A1.Flex) | $0 (forever free) |
| Keepalived | Docker on Oracle VM | $0 (included) |
| FastAPI | Render | $0 (free tier) |
| DA Engine | Render | $0 (free tier) |
| Next.js | Vercel | $0 (free tier) |
| PostgreSQL | NeonDB | $0 (free tier) |
| Redis | Upstash | $0 (free tier) |
| MQTT | EMQX Cloud | Already paid |
| DNS | Cloudflare | $0 (free tier) |
| **Total** | | **$0/month** |

> **Note**: Oracle Cloud Free Tier includes 2 ARM VMs (VM.Standard.A1.Flex) with 1 OCPU and 6GB RAM each, forever free. Keepalived provides high availability between the two nodes. rsync cron job keeps HAProxy configuration synchronized.

---

## Appendix C: Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| HAProxy won't start | Invalid config | Run `haproxy -c -f haproxy.cfg` to check |
| Keepalived VIP not failing | Network issues | Check `ip addr show` on both Oracle VMs |
| MQTT connection refused | Wrong endpoint | Verify EMQX Cloud URL in haproxy.cfg |
| Render cold start | Free tier sleep | Add uptime monitor to keep alive |
| Vercel build fails | Missing env vars | Check all environment variables set |
| CORS errors | Wrong origins | Update CORS_ALLOW_ORIGINS in .env2 |
| WebSocket not connecting | TLS issues | Verify SSL certificates |
| HAProxy config out of sync | rsync cron not running | Check `/var/log/haproxy-sync.log` |
| Keepalived not failing over | Missing capabilities | Ensure NET_ADMIN, NET_RAW, NET_BROADCAST caps |

---

**Document Version**: 1.0
**Last Updated**: August 2026
**Author**: AAI Smart Washroom Team
