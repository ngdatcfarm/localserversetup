@echo off
REM ============================================================
REM CFarm Guardian - Auto-start Wrapper
REM ============================================================
REM
REM Single source of truth for starting the CFarm stack. Used by:
REM   - Windows shell:startup shortcut (Layer 1: on every user login)
REM   - scripts\install_task_scheduler.bat (Layer 2: Task Scheduler)
REM   - cfarm.bat / start_all.bat (manual start)
REM
REM This wrapper:
REM   1. Sets APP_DIR, LOG_DIR, PYTHONPATH to E:\cfarm
REM   2. Launches guardian_watchdog.py (which in turn launches + supervises guardian.py)
REM   3. Does NOT block. Returns immediately.
REM
REM Layer 1.5: the watchdog is a separate process that detects when
REM guardian dies (any reason — taskkill, OOM, segfault) and restarts
REM it within 5 seconds. Combined with the shell:startup shortcut,
REM this gives full auto-restart coverage WITHOUT admin rights.
REM
REM ============================================================

setlocal

set "APP_DIR=E:\cfarm"
set "PYTHONPATH=%APP_DIR%"
set "LOG_DIR=%APP_DIR%\logs"
set "WATCHDOG_SCRIPT=%APP_DIR%\scripts\guardian_watchdog.py"
set "GUARDIAN_PID_FILE=%LOG_DIR%\guardian.pid"
set "WATCHDOG_PID_FILE=%LOG_DIR%\guardian.watchdog.pid"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

REM --- Detect / clean stale pid files ---
if exist "%WATCHDOG_PID_FILE%" (
    for /f %%p in ('type "%WATCHDOG_PID_FILE%" 2^>nul') do (
        tasklist /FI "PID eq %%p" 2>nul | findstr /C:"%%p" >nul
        if errorlevel 1 (
            echo [start_guardian] Removing stale watchdog PID file (%%p not running^)
            del /F /Q "%WATCHDOG_PID_FILE%" 2>nul
        ) else (
            echo [start_guardian] Watchdog already running (PID %%p^) - nothing to do
            endlocal
            exit /b 0
        )
    )
)

if exist "%GUARDIAN_PID_FILE%" (
    for /f %%p in ('type "%GUARDIAN_PID_FILE%" 2^>nul') do (
        tasklist /FI "PID eq %%p" 2>nul | findstr /C:"%%p" >nul
        if errorlevel 1 (
            echo [start_guardian] Removing stale guardian PID file (PID %%p not running^)
            del /F /Q "%GUARDIAN_PID_FILE%" 2>nul
        )
    )
)

REM --- Launch watchdog in a fully detached process ---
set "STDOUT_LOG=%LOG_DIR%\guardian.start_wrapper.stdout.log"
set "STDERR_LOG=%LOG_DIR%\guardian.start_wrapper.stderr.log"

where pythonw >nul 2>&1
if errorlevel 1 (
    set "PYEXE=python"
) else (
    set "PYEXE=pythonw"
)

set "DOCKER_WATCHDOG=%APP_DIR%\scripts\docker_watchdog.py"
set "DOCKER_WATCHDOG_PID=%LOG_DIR%\docker_watchdog.pid"

echo [start_guardian] Launching watchdog from %WATCHDOG_SCRIPT%
echo [start_guardian] Python:        %PYEXE%
echo [start_guardian] Watchdog log:  %LOG_DIR%\guardian.watchdog.log
echo [start_guardian] Docker watchdog: %DOCKER_WATCHDOG%

REM `start ""` creates a new process; with pythonw (no console),
REM the child is fully detached and survives our exit.
start "" "%PYEXE%" "%WATCHDOG_SCRIPT%"

REM Launch Docker watchdog (skip if already running)
if exist "%DOCKER_WATCHDOG_PID%" (
    for /f %%p in ('type "%DOCKER_WATCHDOG_PID%" 2^>nul') do (
        tasklist /FI "PID eq %%p" 2>nul | findstr /C:"%%p" >nul
        if not errorlevel 1 (
            echo [start_guardian] Docker watchdog already running (PID %%p^)
            goto :skip_docker_watchdog
        )
    )
)
start "" "%PYEXE%" "%DOCKER_WATCHDOG%"
:skip_docker_watchdog

REM Give watchdog a moment to spawn guardian and write PID files
ping -n 6 127.0.0.1 >nul

if exist "%WATCHDOG_PID_FILE%" (
    for /f %%p in ('type "%WATCHDOG_PID_FILE%"') do (
        echo [start_guardian] Watchdog started, PID=%%p
    )
) else (
    echo [start_guardian] WARNING: watchdog PID file not written yet
)

if exist "%GUARDIAN_PID_FILE%" (
    for /f %%p in ('type "%GUARDIAN_PID_FILE%"') do (
        echo [start_guardian] Guardian started, PID=%%p
    )
) else (
    echo [start_guardian] WARNING: guardian PID file not written yet - check logs
)

endlocal
exit /b 0
