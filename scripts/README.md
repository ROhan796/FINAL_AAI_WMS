# Scripts Directory

This directory contains all operational scripts for the AAI Smart Washroom System.

## Local Development Scripts

| Script | Description |
|--------|-------------|
| `start_all.bat` | Start all services locally (WMS Backend + DA Engine + Portal) |
| `stop_all.bat` | Stop all local services |
| `start_portal.bat` | Start only the Next.js Portal |
| `run_portal.bat` | Start only the Next.js Portal (alias) |
| `start.sh` | Linux/Mac start script (all services) |
| `stop.sh` | Linux/Mac stop script |

## Cloud Deployment Scripts

| Script | Description |
|--------|-------------|
| `cloud-setup.bat` | Configure and run the system in cloud mode (NeonDB + Upstash + EMQX Cloud) |
| `cloud-stop.bat` | Stop cloud-deployed services |

## Cloud Configuration

The cloud scripts use `.env2` files which contain:
- **NeonDB**: PostgreSQL database (serverless)
- **Upstash**: Redis (serverless)
- **EMQX Cloud**: MQTT broker (cloud-hosted)

### Cloud Services URLs

| Service | URL |
|---------|-----|
| NeonDB Console | https://console.neon.tech |
| Upstash Console | https://console.upstash.com |
| EMQX Dashboard | https://ke1040ef.ala.us-east-1.emqxsl.com:18083 |

### Running in Cloud Mode

```bash
# Windows
scripts\cloud-setup.bat

# Linux/Mac
./scripts/start.sh  # Use .env2 files
```

## Log Files

All logs are stored in the `logs/` directory:
- `portal.log` - Portal server logs
- `portal-build.log` - Build output
- `portal-cloud.log` - Cloud mode logs
- `frontend.log` - Frontend errors
- `da-engine-docker.log` - DA Engine Docker logs

## Environment Files

| File | Purpose |
|------|---------|
| `.env` | Local development (default) |
| `.env.local` | Local development (portal) |
| `.env2` | Cloud deployment configuration |
| `.env.example` | Template for local setup |
