# Setup Guide: WMS Backend + DA Engine on Render

## Prerequisites

- Render account (sign up at https://render.com)
- GitHub repo connected to Render
- Repository contains `aai-wms-backend` and `da-engine` folders with Dockerfiles

## WMS Backend Service

### Create Service

1. Log in to Render Dashboard
2. Click **New** → **Web Service**
3. Select **Build and deploy from a Git repository**
4. Connect your GitHub account and select the repository
5. Configure the service:
   - **Name**: aai-wms-backend
   - **Runtime**: Docker
   - **Region**: Oregon (or closest to your users)
   - **Branch**: main
   - **Root Directory**: `aai-wms-backend`
   - **Build Command**: (leave empty - Docker handles this)
   - **Start Command**: (leave empty - Dockerfile CMD used)
   - **Port**: 8000
   - **Instance Type**: Free

### Environment Variables

Copy all variables from `aai-wms-backend/.env2` and add/modify the following:

```bash
# App
APP_ENV=production

# Database (NeonDB)
DATABASE_URL=postgresql://neondb_owner:npg_...@ep-.../timescaledb?sslmode=require
POSTGRES_URL=postgresql://neondb_owner:npg_...@ep-.../timescaledb?sslmode=require
POSTGRES_SUPERUSER_URL=postgresql://neondb_owner:npg_...@ep-.../timescaledb?sslmode=require

# Redis (Upstash)
REDIS_URL=rediss://default:...@ready-monkey-212683.upstash.io:6379/0
REDIS_HOST=ready-monkey-212683.upstash.io
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=...

# MQTT (EMQX Cloud)
MQTT_HOST=ke1040ef.ala.us-east-1.emqxsl.com
MQTT_PORT=8883
MQTT_USE_TLS=true
MQTT_WS_PORT=8084
MQTT_USER=aai-backend
MQTT_PASSWORD=AaiBackend@2026!
MQTT_CA_CERT_PATH=/etc/haproxy/certs/emqx/ca.crt

# EMQX API
EMQX_API_ENDPOINT=https://ke1040ef.ala.us-east-1.emqxsl.com:8443/api/v5
EMQX_API_KEY=i0ee1696
EMQX_API_SECRET=XZMMg0S7pJx_8lkA

# CORS (add your Vercel URL)
CORS_ALLOW_ORIGINS=https://your-vercel-app.vercel.app
CORS_ORIGINS=https://your-vercel-app.vercel.app

# Backend URLs
RAILWAY_BACKEND_URL=https://your-wms-backend.onrender.com
RAILWAY_DA_ENGINE_URL=https://your-da-engine.onrender.com
```

### Note on PORT Environment Variable

Render automatically injects a `PORT` environment variable. Your Dockerfile should use this:

```dockerfile
# In aai-wms-backend/Dockerfile
EXPOSE ${PORT:-8000}
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "${PORT:-8000}"]
```

## DA Engine Service

### Create Service

1. Click **New** → **Web Service**
2. Select **Build and deploy from a Git repository**
3. Connect the same GitHub repository
4. Configure the service:
   - **Name**: da-engine
   - **Runtime**: Docker
   - **Region**: Oregon (or same as WMS Backend)
   - **Branch**: main
   - **Root Directory**: `da-engine`
   - **Build Command**: (leave empty)
   - **Start Command**: (leave empty)
   - **Port**: 8001
   - **Instance Type**: Free

### Environment Variables

Copy all variables from `da-engine/.env2`:

```bash
# App
APP_ENV=production
ENVIRONMENT=production
LOG_LEVEL=INFO
DA_ENGINE_HOST=0.0.0.0
DA_ENGINE_PORT=8001

# Database (NeonDB)
DATABASE_URL=postgresql://neondb_owner:npg_...@ep-.../timescaledb?sslmode=require

# Redis (Upstash)
REDIS_URL=rediss://default:...@ready-monkey-212683.upstash.io:6379/0
REDIS_HOST=ready-monkey-212683.upstash.io
REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=...
REDIS_CACHE_TTL=300

# NSCBI Airport API
NSCBI_API_BASE_URL=https://api.nscbiairport.com/api
NSCBI_API_KEY=EY9kocR7OOFfkJBXXLYrQFs84HEyI1OJDUjJcbwfsDVOqXvcFau3eqBdG6ZHZ2Fe

# Polling
POLLING_INTERVAL_SECONDS=30
SCHEDULER_ENABLED=true

# CORS
CORS_ALLOW_ORIGIN=https://your-vercel-app.vercel.app
CORS_ORIGINS=https://your-vercel-app.vercel.app
```

## Post-Deploy Verification

After deployment completes, verify the health endpoints:

```bash
# WMS Backend health check
curl https://your-wms-backend.onrender.com/health

# DA Engine health check
curl https://your-da-engine.onrender.com/health
```

Both should return a JSON response with status `"ok"`.

## Important Notes

### Free Tier Spin-Down

Render's free tier spins down services after 15 minutes of inactivity. When a new request arrives:
- First request takes approximately 30 seconds to respond
- Subsequent requests are fast

To keep services alive, you can:
1. Use an external uptime monitor (e.g., UptimeRobot) to ping every 14 minutes
2. Upgrade to a paid instance type

### Service URLs

After deployment, note your service URLs:
- WMS Backend: `https://your-wms-backend.onrender.com`
- DA Engine: `https://your-da-engine.onrender.com`

These URLs will be used in:
1. HAProxy configuration (`haproxy-cloud.cfg`)
2. Vercel environment variables
3. Keepalived configuration
