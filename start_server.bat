@echo off
REM ==========================================
REM CFarm Local Server - Startup Script
REM ==========================================
cd /d "E:\cfarm"

echo === Starting CFarm Local Server ===
echo.

REM Check Docker
echo [1/4] Checking Docker...
docker info >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running. Please start Docker Desktop.
    pause
    exit /b 1
)

REM Start Docker containers
echo [2/4] Starting Docker containers...
docker-compose up -d
if errorlevel 1 (
    echo ERROR: Failed to start Docker containers.
    pause
    exit /b 1
)
echo Docker containers started.

REM Wait for database
echo [3/4] Waiting for database...
timeout /t 5 /nobreak >nul

REM Check database connection
docker exec cfarm-db psql -U cfarm -d cfarm_local -c "SELECT 1" >nul 2>&1
if errorlevel 1 (
    echo WARNING: Database may not be ready yet.
)

REM Start Python server
echo [4/4] Starting Python server...
echo.
echo Server will be available at:
echo   - API: http://localhost:8002
echo   - Health: http://localhost:8002/health
echo   - Dashboard: http://localhost:8002/iot
echo.
echo Press Ctrl+C to stop the server.
echo.

cd /d "E:\cfarm"
python -m uvicorn src.server.main:app --host 0.0.0.0 --port 8443 --ssl-keyfile cert.key --ssl-certfile cert.pem
