#!/bin/bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "[AAI] Stopping Next.js portal..."
if [ -f "$ROOT/.portal.pid" ]; then
  kill "$(cat "$ROOT/.portal.pid")" 2>/dev/null || true
  rm "$ROOT/.portal.pid"
fi
pkill -f "next start" 2>/dev/null || true

echo "[AAI] Stopping DA Engine..."
cd "$ROOT/da-engine"
docker-compose down

echo "[AAI] Stopping WMS Backend..."
cd "$ROOT/aai-wms-backend"
docker compose down

echo "[AAI] All services stopped."
