@echo off
setlocal EnableDelayedExpansion

REM ═══════════════════════════════════════════════════════════════════
REM  AAI Smart Washroom System - Cloud Setup & Deployment
REM  Uses .env2 files for cloud configuration (NeonDB, Upstash, EMQX Cloud)
REM ═══════════════════════════════════════════════════════════════════

set SCRIPT_DIR=%~dp0
set ROOT=%SCRIPT_DIR%..
set BACKEND_DIR=%ROOT%aai-wms-backend
set DA_DIR=%ROOT%da-engine
set PORTAL_DIR=%ROOT%aai-unified-portal
set LOG_DIR=%ROOT%logs

echo.
echo ═══════════════════════════════════════════════════════════════
echo   AAI Smart Washroom System - Cloud Configuration
echo ═══════════════════════════════════════════════════════════════
echo.

REM ═══════════════════════════════════════════════════════════════════
REM  Step 1: Copy .env2 files to .env for cloud mode
REM ═══════════════════════════════════════════════════════════════════
echo [1/6] Configuring cloud environment files...

REM Portal
if exist "%PORTAL_DIR%\.env2" (
    copy /Y "%PORTAL_DIR%\.env2" "%PORTAL_DIR%\.env.local" >nul
    echo       [OK] Portal .env.local configured from .env2
) else (
    echo       [WARN] Portal .env2 not found, skipping
)

REM WMS Backend
if exist "%BACKEND_DIR%\.env2" (
    copy /Y "%BACKEND_DIR%\.env2" "%BACKEND_DIR%\.env" >nul
    echo       [OK] WMS Backend .env configured from .env2
) else (
    echo       [WARN] WMS Backend .env2 not found, skipping
)

REM DA Engine
if exist "%DA_DIR%\.env2" (
    copy /Y "%DA_DIR%\.env2" "%DA_DIR%\.env" >nul
    echo       [OK] DA Engine .env configured from .env2
) else (
    echo       [WARN] DA Engine .env2 not found, skipping
)

echo.

REM ═══════════════════════════════════════════════════════════════════
REM  Step 2: Verify cloud connectivity
REM ═══════════════════════════════════════════════════════════════════
echo [2/6] Verifying cloud service connectivity...
echo.

REM Test NeonDB connection
echo       Testing NeonDB (PostgreSQL)...
for /f "tokens=*" %%i in (' powershell -Command "try { $r = Invoke-WebRequest -Uri 'https://console.neon.tech' -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop; ' reachable' } catch { ' unreachable' }" ') do set NEON_STATUS=%%i
echo         NeonDB:%NEON_STATUS%

REM Test Upstash Redis
echo       Testing Upstash Redis...
for /f "tokens=*" %%i in (' powershell -Command "try { $r = Invoke-WebRequest -Uri 'https://console.upstash.com' -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop; ' reachable' } catch { ' unreachable' }" ') do set UPSTASH_STATUS=%%i
echo         Upstash:%UPSTASH_STATUS%

REM Test EMQX Cloud
echo       Testing EMQX Cloud MQTT...
for /f "tokens=*" %%i in (' powershell -Command "try { $r = Invoke-WebRequest -Uri 'https://ke1040ef.ala.us-east-1.emqxsl.com:18083' -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop; ' reachable' } catch { ' unreachable' }" ') do set EMQX_STATUS=%%i
echo         EMQX Cloud:%EMQX_STATUS%

echo.

REM ═══════════════════════════════════════════════════════════════════
REM  Step 3: Install dependencies (if needed)
REM ═══════════════════════════════════════════════════════════════════
echo [3/6] Checking dependencies...

REM Check Node.js
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo       [ERROR] Node.js not found! Please install Node.js 18+
    pause
    exit /b 1
)
for /f "tokens=*" %%i in (' node -v') do set NODE_VER=%%i
echo         Node.js: %NODE_VER%

REM Check Python
where python >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo       [ERROR] Python not found! Please install Python 3.10+
    pause
    exit /b 1
)
for /f "tokens=*" %%i in (' python --version') do set PYTHON_VER=%%i
echo         Python: %PYTHON_VER%

REM Check Docker (for local DA Engine container)
where docker >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo         Docker: available
) else (
    echo         Docker: not found (DA Engine will run locally)
)

REM Install portal dependencies
echo       Installing portal dependencies...
cd /d "%PORTAL_DIR%"
if not exist "node_modules" (
    call npm install
    echo         [OK] Portal dependencies installed
) else (
    echo         [OK] Portal dependencies already installed
)

echo.

REM ═══════════════════════════════════════════════════════════════════
REM  Step 4: Start DA Engine (cloud mode - connects to cloud DB/Redis)
REM ═══════════════════════════════════════════════════════════════════
echo [4/6] Starting DA Engine (cloud mode)...
cd /d "%DA_DIR%"

REM Check if running in Docker
where docker >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    docker-compose up -d --build 2>"%LOG_DIR%\da-engine-docker.log"
    echo       [OK] DA Engine started via Docker (cloud mode)
    echo       Waiting 10s for DA Engine to initialize...
    timeout /t 10 /nobreak >nul
) else (
    echo       [INFO] Docker not available, starting DA Engine locally...
    start "DA Engine" /min cmd /c "cd /d "%DA_DIR%" && python -m uvicorn app.main:app --host 0.0.0.0 --port 8001"
    timeout /t 5 /nobreak >nul
)

echo.

REM ═══════════════════════════════════════════════════════════════════
REM  Step 5: Start Next.js Portal (cloud mode)
REM ═══════════════════════════════════════════════════════════════════
echo [5/6] Starting Next.js Portal (cloud mode)...
cd /d "%PORTAL_DIR%"

set NODE_EXTRA_CA_CERTS=%BACKEND_DIR%\certs\ca\ca.crt
set NODE_TLS_REJECT_UNAUTHORIZED=0

REM Build the portal
echo       Building Next.js portal...
call npm run build 2>"%LOG_DIR%\portal-build.log"
if %ERRORLEVEL% NEQ 0 (
    echo       [WARN] Build completed with warnings, check logs\portal-build.log
)

echo.

REM ═══════════════════════════════════════════════════════════════════
REM  Step 6: Launch services
REM ═══════════════════════════════════════════════════════════════════
echo [6/6] Launching services...
echo.

echo ═══════════════════════════════════════════════════════════════
echo   AAI Smart Washroom System - Cloud Mode
echo ═══════════════════════════════════════════════════════════════
echo.
echo   Mode:           CLOUD (NeonDB + Upstash + EMQX Cloud)
echo.
echo   Services:
echo     Next.js:      http://localhost:3000
echo     DA Engine:    http://localhost:8001/api/health
echo     WMS API:      (via cloud proxy - check EMQX dashboard)
echo.
echo   Cloud Services:
echo     NeonDB:       ep-nameless-brook-ah66rf6f (PostgreSQL)
echo     Upstash:      ready-monkey-212683 (Redis)
echo     EMQX Cloud:   ke1040ef.ala.us-east-1.emqxsl.com
echo.
echo   Logs:          %LOG_DIR%\
echo.
echo ═══════════════════════════════════════════════════════════════
echo.

REM Start the portal
echo Starting Next.js portal on http://localhost:3000
cd /d "%PORTAL_DIR%"
node node_modules\tsx\dist\cli.mjs server.ts 2>"%LOG_DIR%\portal-cloud.log"

endlocal
