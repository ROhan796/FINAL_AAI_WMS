@echo off
setlocal

set SCRIPT_DIR=%~dp0
set ROOT=%SCRIPT_DIR%..\
set BACKEND_DIR=%ROOT%aai-wms-backend
set DA_DIR=%ROOT%da-engine

echo.
echo Stopping AAI Smart Washroom System...
echo.

REM === Stop DA Engine ===
echo [1/3] Stopping DA Engine...
cd /d "%DA_DIR%"
docker-compose down

REM === Stop WMS Backend ===
echo [2/3] Stopping WMS Backend...
cd /d "%BACKEND_DIR%"
docker compose down

REM === Kill any remaining node processes on port 3000 ===
echo [3/3] Stopping Next.js Portal...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul

echo.
echo All services stopped.
