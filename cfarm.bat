@echo off
rem ==========================================
rem CFarm - Single Button Start/Stop Script
rem ==========================================
rem Usage:
rem   Run without args to START everything
rem   Run with "stop" argument to STOP all

setlocal enabledelayedexpansion

set "APP_DIR=E:\cfarm"
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
) else (
    echo   Waiting for database to be ready...
    set /a "_db_try=0"
    :WAIT_DB
    set /a "_db_try+=1"
    if !_db_try! gtr 40 (
        echo   WARNING: DB not ready after 40 attempts, continuing anyway...
        goto DB_DONE
    )
    docker exec cfarm-db pg_isready -U cfarm >nul 2>&1
    if errorlevel 1 (
        timeout /t 3 /nobreak >nul
        goto WAIT_DB
    )
    echo   Database is ready!
    :DB_DONE
)

echo [3/4] Stopping existing services on ports 8002, 8003, 2000...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8002 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8003 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :2000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
timeout /t 2 /nobreak >nul

echo [4/4] Starting Guardian (process supervisor)...
echo.
call "%APP_DIR%\scripts\start_guardian.bat"
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

echo [1/5] Stopping Guardian...
python "%APP_DIR%\scripts\guardian_control.py" stop >nul 2>&1
timeout /t 3 /nobreak >nul

echo [2/5] Force stopping any remaining processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8002 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8003 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :2000 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8443 ^| findstr LISTENING') do taskkill /PID %%a /F >nul 2>&1
taskkill //F //IM python.exe //IM cloudflared.exe >nul 2>&1

echo [3/5] Stopping watchdog (pythonw.exe running guardian_watchdog.py)...
REM Only kill pythonw.exe whose command line contains guardian_watchdog.py.
REM Without this filter, we'd nuke unrelated pythonw processes (B7 fix).
set "_wd_killed=0"
for /f "tokens=2" %%p in ('wmic process where "Name='pythonw.exe' and CommandLine like '%%guardian_watchdog.py%%'" get ProcessId /FORMAT:LIST 2^>nul') do (
    if not "%%p"=="" if not "%%p"=="ProcessId" (
        echo   Killing watchdog PID %%p
        taskkill /F /PID %%p >nul 2>&1
        set /a "_wd_killed+=1"
    )
)
if !_wd_killed!==0 (
    echo   No watchdog process found
)

echo [4/5] Force stopping any pythonw.exe that still references cfarm...
REM Belt-and-braces: kill any orphan pythonw whose CommandLine touches
REM cfarm paths. Prevents the next start_guardian from seeing a stale
REM port-bound process and looping.
for /f "tokens=2" %%p in ('wmic process where "Name='pythonw.exe' and (CommandLine like '%%E:\\cfarm%%' or CommandLine like '%%cfarm%%')" get ProcessId /FORMAT:LIST 2^>nul') do (
    if not "%%p"=="" if not "%%p"=="ProcessId" (
        taskkill /F /PID %%p >nul 2>&1
    )
)

echo [5/5] Stopping Docker containers...
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