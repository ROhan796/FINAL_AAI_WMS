@echo off
setlocal

REM ═══════════════════════════════════════════════════════════════════
REM  AAI Smart Washroom System - Cloud Mode Stop
REM ═══════════════════════════════════════════════════════════════════

set SCRIPT_DIR=%~dp0
set ROOT=%SCRIPT_DIR%..
set DA_DIR=%ROOT%da-engine

echo.
echo Stopping AAI Smart Washroom System (Cloud Mode)...
echo.

REM === Stop DA Engine ===
echo [1/2] Stopping DA Engine...
cd /d "%DA_DIR%"
docker-compose down 2>nul

REM === Kill any remaining node processes on port 3000 ===
echo [2/2] Stopping Next.js Portal...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :3000 ^| findstr LISTENING') do taskkill /F /PID %%a 2>nul

echo.
echo All services stopped.
echo.
echo Note: Cloud services (NeonDB, Upstash, EMQX) are still running.
echo       They will stop automatically when unused (free tier).
echo.

pause
