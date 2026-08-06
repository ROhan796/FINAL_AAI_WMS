@echo off
set SCRIPT_DIR=%~dp0
set ROOT=%SCRIPT_DIR%..
set NODE_EXTRA_CA_CERTS=%ROOT%aai-wms-backend\certs\ca\ca.crt
set NODE_TLS_REJECT_UNAUTHORIZED=0
cd /d %ROOT%aai-unified-portal
npx tsx server.ts
