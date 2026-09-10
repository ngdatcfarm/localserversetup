@echo off
REM ============================================================
REM CFarm Guardian - Layer 2: Task Scheduler Auto-Start + Restart
REM ============================================================
REM
REM Registers a Windows Task Scheduler entry that:
REM   - Runs E:\cfarm\scripts\start_guardian.bat
REM   - Triggers at user logon
REM   - Auto-restarts every 1 minute if it fails (up to 99 times)
REM
REM REQUIRES: Run as Administrator (right-click -> Run as admin)
REM
REM This is Layer 2 of the auto-start stack:
REM   Layer 1: shell:startup shortcut (already installed, no admin)
REM   Layer 2: Task Scheduler (THIS script, needs admin)  <-- you are here
REM   Layer 3: guardian.py self-respawn (in-process, rate-limited)
REM
REM ============================================================

setlocal

echo.
echo =========================================
echo  CFarm Guardian - Layer 2 Setup
echo =========================================
echo.
echo  This script needs to run as Administrator.
echo  Right-click and choose "Run as administrator".
echo.

REM --- Check for admin privilege ---
net session >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Not running as Administrator.
    echo         Right-click this file and choose "Run as administrator".
    pause
    exit /b 1
)

echo [OK] Running as Administrator
echo.

REM --- Run the PowerShell installer ---
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_task.ps1"

endlocal
exit /b 0
