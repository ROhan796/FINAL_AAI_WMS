#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT/aai-wms-backend"
DA_DIR="$ROOT/da-engine"
PORTAL_DIR="$ROOT/aai-unified-portal"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[AAI]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# â”€â”€ Step 1: PKI bootstrapping (run only once) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
if [ ! -f "$BACKEND_DIR/certs/ca/ca.crt" ]; then
  log "Running PKI bootstrap (first time setup)..."
  cd "$BACKEND_DIR"
  chmod +x setup_security.sh
  ./setup_security.sh
  cd "$SCRIPT_DIR"
else
  log "PKI already bootstrapped â€” skipping (delete certs/ca/ to regenerate)"
fi

# â”€â”€ Step 2: Start WMS Backend â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
log "Starting WMS Backend stack..."
cd "$BACKEND_DIR"
docker compose up -d

log "Waiting for WMS Backend health checks (EMQX cluster + FastAPI)..."
MAX_WAIT=120
ELAPSED=0
while true; do
  STATUS=$(docker compose ps --format json 2>/dev/null | python3 -c "
import sys, json
services = [json.loads(l) for l in sys.stdin if l.strip()]
unhealthy = [s['Name'] for s in services if s.get('Health','') not in ('healthy','')]
print(' '.join(unhealthy))
" 2>/dev/null || echo "checking")

  if [ -z "$STATUS" ] || [ "$STATUS" = "checking" ]; then
    log "All WMS Backend services healthy!"
    break
  fi

  if [ $ELAPSED -ge $MAX_WAIT ]; then
    error "WMS Backend failed to become healthy after ${MAX_WAIT}s. Run: docker compose logs"
  fi

  echo "  Waiting for: $STATUS (${ELAPSED}s elapsed)"
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done
cd "$SCRIPT_DIR"

# â”€â”€ Step 3: Start DA Engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
log "Starting DA Engine..."
cd "$DA_DIR"
if [ ! -f ".env" ]; then
  warn ".env not found in da-engine/. Copying from .env.example..."
  cp .env.example .env 2>/dev/null || warn "No .env.example either â€” using defaults"
fi
docker-compose up -d --build

log "Verifying DA Engine health..."
sleep 5
DA_HEALTH=$(curl -sf http://localhost:8001/api/health 2>/dev/null || echo "FAIL")
if echo "$DA_HEALTH" | grep -q '"status"'; then
  log "DA Engine is healthy: http://localhost:8001/api/health"
else
  warn "DA Engine health check failed. Check: docker-compose logs"
fi
cd "$SCRIPT_DIR"

# â”€â”€ Step 4: Start Next.js Portal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
log "Starting Next.js Portal..."
cd "$PORTAL_DIR"

if [ ! -f ".env.local" ]; then
  warn ".env.local not found! Copying .env.local.example..."
  cp .env.local.example .env.local 2>/dev/null || warn "No .env.local.example found"
  warn "Edit $PORTAL_DIR/.env.local with your Clerk keys before the portal will work."
fi

# Set CA cert trust for Node.js -> WMS Backend TLS
export NODE_EXTRA_CA_CERTS="$BACKEND_DIR/certs/ca/ca.crt"

if [ ! -d "node_modules" ]; then
  log "Installing Node.js dependencies..."
  npm install
fi

log "Building Next.js portal..."
npm run build

log "Starting Next.js portal on port 3000 (with WebSocket proxy)..."
npx tsx server.ts &
PORTAL_PID=$!
echo $PORTAL_PID > "$SCRIPT_DIR/.portal.pid"

cd "$SCRIPT_DIR"

# â”€â”€ Done â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
echo ""
echo -e "${GREEN}â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—${NC}"
echo -e "${GREEN}â•‘        AAI Smart Washroom System â€” Running           â•‘${NC}"
echo -e "${GREEN}â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•${NC}"
echo ""
echo "  Next.js Portal:    http://localhost:3000"
echo "  DA Engine API:     http://localhost:8001/api/health"
echo "  DA Engine Docs:    http://localhost:8001/docs"
echo "  WMS REST API:      https://localhost:443"
echo "  EMQX Dashboard:    https://localhost:18083"
echo "  MQTT Ingress:      localhost:8883 (mTLS)"
echo ""
echo "  Sign in with:"
echo "    AP-001  â†’ Admin Dashboard"
echo "    TP-001  â†’ Terminal Operator"
echo "    ALP-001 â†’ Audit Log Viewer"
echo ""
echo "  To stop all services: ./stop.sh"
