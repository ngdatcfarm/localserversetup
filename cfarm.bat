@echo off
rem ==========================================
rem CFarm - Single Button Start/Stop Script
rem ==========================================
rem Usage:
rem   Run without args to START everything
rem   Run with "stop" argument to STOP all

setlocal enabledelayedexpansion

set "APP_DIR=C:\Local server"
set "PYTHONPATH=%APP_DIR%"
set "LOG_DIR=%APP_DIR%\logs"
set "GUARDIAN_SCRIPT=%APP_DIR%\scripts\guardian.py"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

echo.
echo =========================================
echo  CFarm Server Manager
echo =========================================
echo.

if "%~1"=="stop" goto STOP_SERVICES
if "%~1"=="restart" goto RESTART_SERVICES
if "%~1"=="status" goto SHOW_STATUS

:START_SERVICES
echo [1/4] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo   WARNING: Docker not running. Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    echo   Waiting 10s for Docker to start...
    timeout /t 10 /nobreak >nul
    docker info >nul 2>&1
    if errorlevel 1 (
        echo   ERROR: Docker failed to start. Please start manually.
        pause
        exit /b 1
    )
)

echo [2/4] Starting Docker containers (if not running)...
docker-compose up -d 2>nul
if errorlevel 1 (
    echo   WARNING: docker-compose not found or failed. Continuing anyway...
)

echo [3/4] Stopping existing services on ports 8002, 8003, 2000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8002 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8003 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :2000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo [4/4] Starting Guardian (process supervisor)...
echo.
start /B python "%GUARDIAN_SCRIPT%"
timeout /t 5 /nobreak >nul

echo.
echo =========================================
echo  All services started!
echo =========================================
echo.
echo   Main App:    http://localhost:8002
echo   Branding:   http://localhost:8003
echo   Tunnel:      https://doihong.io.vn
echo.
echo   To STOP all: %~nx0 stop
echo   To CHECK:    %~nx0 status
echo.
pause
goto :EOF

:STOP_SERVICES
echo Stopping all services...
echo.

echo [1/3] Stopping Guardian...
python "%APP_DIR%\scripts\guardian_control.py" stop >nul 2>&1
timeout /t 3 /nobreak >nul

echo [2/3] Force stopping any remaining processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8002 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8003 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :2000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
taskkill //F //IM python.exe //IM cloudflared.exe >nul 2>&1

echo [3/3] Stopping Docker containers...
docker-compose down 2>nul

echo.
echo =========================================
echo  All services stopped!
echo =========================================
echo.
pause
goto :EOF

:RESTART_SERVICES
echo Restarting all services...
call :STOP_SERVICES >nul 2>&1
timeout /t 3 /nobreak >nul
goto :START_SERVICES

:SHOW_STATUS
echo.
python "%APP_DIR%\scripts\guardian_control.py" status
echo.
echo Press any key to exit...
pause >nul
goto :EOF