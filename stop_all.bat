@echo off
rem CFarm Stop All Script
rem Stops Guardian (which stops all managed services)

cd /d E:\cfarm

echo Stopping Guardian and all services...
python scripts\guardian_control.py stop

echo.
echo All services stopped.
pause