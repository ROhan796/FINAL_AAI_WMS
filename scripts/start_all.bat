@echo off
setlocal EnableDelayedExpansion

set SCRIPT_DIR=%~dp0
set ROOT=%SCRIPT_DIR%..\
set BACKEND_DIR=%ROOT%aai-wms-backend
set DA_DIR=%ROOT%da-engine
set PORTAL_DIR=%ROOT%aai-unified-portal

echo.
echo ========================================
echo   AAI Smart Washroom System - Starting
echo ========================================
echo.

REM === Step 1: Start WMS Backend (EMQX + HAProxy + FastAPI + TimescaleDB + Redis) ===
echo [1/4] Starting WMS Backend stack...
cd /d "%BACKEND_DIR%"
docker compose up -d
echo       Waiting for services to initialize...
timeout /t 15 /nobreak >nul

REM === Step 2: Start DA Engine ===
echo [2/4] Starting DA Engine...
cd /d "%DA_DIR%"
docker-compose up -d --build
echo       Waiting for DA Engine to initialize...
timeout /t 10 /nobreak >nul

REM === Step 3: Verify Docker services ===
echo [3/4] Verifying Docker services...
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | findstr /i "emqx haproxy keepalived fastapi timescaledb redis da-engine"
echo.

REM === Step 4: Start Next.js Portal ===
echo [4/4] Starting Next.js Portal...

echo       Starting portal on http://localhost:3000
echo.
echo ========================================
echo   All Services Running
echo ========================================
echo.
echo   Portal:      http://localhost:3000
echo   DA Engine:   http://localhost:8001/api/health
echo   WMS API:     https://localhost:443
echo   EMQX Dash:   https://localhost:18083
echo   MQTT:        localhost:8883
echo.
echo   Login:  AP-001 (Admin) / TP-001 (Terminal) / ALP-001 (Auditor)
echo   Pass:   (see .env file)
echo ========================================
echo.

set NODE_EXTRA_CA_CERTS=%BACKEND_DIR%\certs\ca\ca.crt
set NODE_TLS_REJECT_UNAUTHORIZED=0

cd /d "%PORTAL_DIR%"
node node_modules\tsx\dist\cli.mjs server.ts
