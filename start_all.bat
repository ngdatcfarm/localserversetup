@echo off
rem CFarm Single-Button Start Script
rem Starts Guardian which manages: app_8002, app_8003, cloudflared

cd /d E:\cfarm

echo [1/3] Stopping any existing processes on ports 8002, 8003, 2000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8002 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8003 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :2000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 >nul

echo [2/3] Starting Guardian (monitors 8002, 8003, cloudflared)...
call scripts\start_guardian.bat
timeout /t 3 >nul

echo [3/3] Checking services...
python scripts\guardian_control.py status

echo.
echo Ready! Guardian is running in background.
echo - Open http://localhost:8002 for main app
echo - Open http://localhost:8003 for branding app
echo - Tunnel: https://doihong.io.vn
echo.
echo To stop all: python scripts\guardian_control.py stop
pause