# Cloud Hosting Guide

## Current Architecture vs Cloud

| Component | Current | Cloud Option |
|-----------|---------|-------------|
| Next.js Portal | Local `npm start` | Vercel, Railway, Fly.io |
| DA Engine | Docker container | Railway, Fly.io, AWS ECS |
| WMS Backend | Docker (10 containers) | AWS ECS/EKS, Docker Swarm on cloud VM |
| TimescaleDB | Docker container | Neon (Timescale extension), Timescale Cloud, Supabase |
| Redis | Docker container | Upstash, Redis Cloud, AWS ElastiCache |
| EMQX MQTT | Docker cluster | EMQX Cloud, AWS IoT Core |
| Neon PostgreSQL | Already cloud | No change needed |

## Option A: Full Cloud (Recommended for Production)

### Step 1: Neon PostgreSQL (Already Done)
Your frontend already uses Neon. No changes needed.

### Step 2: TimescaleDB on Timescale Cloud
1. Sign up at https://timescale.com
2. Create a free tier service (1 GB storage)
3. Get connection string: `postgresql://user:pass@host:5432/tsdb?sslmode=require`
4. Run `db_init/01-init.sql` to create schema
5. Update WMS Backend `.env`:
   ```
   TIMESCALE_HOST=your-timescale-host
   TIMESCALE_PORT=5432
   TIMESCALE_DB=tsdb
   TIMESCALE_USER=your-user
   TIMESCALE_PASSWORD=your-pass
   ```

### Step 3: Redis on Upstash
1. Sign up at https://upstash.com (free tier: 10K commands/day)
2. Create a Redis database
3. Get the URL: `redis://default:pass@host:6380`
4. Update both WMS Backend and DA Engine `.env`

### Step 4: DA Engine on Railway
1. Sign up at https://railway.app
2. Create new project → Deploy from GitHub repo
3. Set environment variables:
   ```
   DA_ENGINE_HOST=0.0.0.0
   DA_ENGINE_PORT=8001
   REDIS_HOST=your-upstash-host
   REDIS_PORT=6380
   WMS_PG_HOST=your-timescale-host
   WMS_PG_PORT=5432
   WMS_PG_DB=tsdb
   WMS_PG_USER=your-user
   WMS_PG_PASSWORD=your-pass
   ```
4. Railway assigns a public URL (e.g., `da-engine.up.railway.app`)

### Step 5: WMS Backend on Railway/Fly.io
This is complex (10 containers). Options:
- **Simplest**: Deploy only the FastAPI container, use managed Redis + TimescaleDB
- **Full HA**: Use AWS ECS with the docker-compose.yml converted to ECS task definitions

### Step 6: Next.js on Vercel
1. Push to GitHub
2. Import on Vercel
3. Set env vars:
   ```
   NEXT_PUBLIC_DA_ENGINE_URL=https://your-da-engine.up.railway.app
   WMS_BACKEND_URL=https://your-wms-backend.up.railway.app
   DATABASE_URL=postgresql://...@ep-nameless-brook-.../neondb?sslmode=require
   ```
4. Deploy — Vercel handles SSL, CDN, auto-scaling

## Option B: Single Cloud VM (Easiest)

Use one cloud VM (e.g., AWS EC2 t3.xlarge, DigitalOcean droplet) and run everything in Docker:

```bash
# 1. Clone repo
git clone <repo>
cd Fullstack_Unification

# 2. Start all Docker services
cd aai-wms-backend && docker compose up -d
cd ../da-engine && docker-compose up -d

# 3. Start Next.js
cd ../aai-unified-portal
npm install
npm run build
npm run start:ws
```

Use Nginx reverse proxy to serve everything on ports 80/443.

## Option C: Docker Compose for Everything

Create a root `docker-compose.yml` that runs all 3 services:

```yaml
services:
  portal:
    build: ./aai-unified-portal
    ports: ["3000:3000"]
    depends_on: [da-engine, wms-backend]
    environment:
      - NEXT_PUBLIC_DA_ENGINE_URL=http://da-engine:8001
      - WMS_BACKEND_URL=http://wms-fastapi:8000
      - DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require

  da-engine:
    build: ./da-engine
    ports: ["8001:8001"]
    depends_on: [wms-timescaledb, wms-redis]
    environment:
      - REDIS_HOST=wms-redis
      - WMS_PG_HOST=wms-timescaledb

  # WMS Backend services...
```

## Environment Variables Summary

### Frontend (.env.local)
```
DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
NEXT_PUBLIC_DA_ENGINE_URL=http://localhost:8001
WMS_BACKEND_URL=https://localhost:443
WMS_JWT_OPERATOR_USER=operator
WMS_JWT_OPERATOR_PASS=<from secrets/operator_password.txt>
```

### DA Engine (.env)
```
DA_ENGINE_HOST=0.0.0.0
DA_ENGINE_PORT=8001
REDIS_HOST=localhost (or washroom-redis in Docker)
REDIS_PORT=6389 (or 6379 in Docker)
REDIS_DB=1
WMS_PG_HOST=localhost (or washroom-timescaledb in Docker)
WMS_PG_PORT=5433 (or 5432 in Docker)
WMS_PG_DB=washroom_db
WMS_PG_USER=postgres
WMS_PG_PASSWORD=6cdab6f3d5270c9739ba920d3e0b2016
```

### WMS Backend (managed via Docker secrets)
```
# Secrets in aai-wms-backend/secrets/:
postgres_password.txt
redis_password.txt
jwt_secret_key.txt
operator_password.txt
```
