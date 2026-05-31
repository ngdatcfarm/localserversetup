# CFarm Restart Guide

Complete guide for restarting and troubleshooting CFarm services.

## Service Architecture

```
Windows Service (NSSM)
├── CFarmFastAPI    → wrapper_fastapi.py → uvicorn (port 8002)
├── CFarmLanding    → guardian.py → python http.server (port 8003)
└── CFarmTunnel     → wrapper_cloudflared.py → cloudflared.exe tunnel run
```

## Quick Status Check

```powershell
# Check if services are running
nssm status CFarmFastAPI
nssm status CFarmLanding
nssm status CFarmTunnel

# Or via PowerShell service cmdlets
Get-Service CFarm*
```

## Starting Services

```cmd
net start CFarmFastAPI
net start CFarmLanding
net start CFarmTunnel
```

## Stopping Services

```cmd
net stop CFarmFastAPI
net stop CFarmLanding
net stop CFarmTunnel
```

## Restarting Services

```cmd
nssm restart CFarmFastAPI
nssm restart CFarmLanding
nssm restart CFarmTunnel
```

## Viewing Logs

```cmd
# FastAPI Guardian log
type C:\Local server\logs\guardian_fastapi.log
tail -f C:\Local server\logs\guardian_fastapi.log

# Landing Guardian log
type E:\doihong-cfarm\logs\guardian_landing.log
tail -f E:\doihong-cfarm\logs\guardian_landing.log
```

## Troubleshooting

### Services Not Starting

1. Check NSSM installation:
```cmd
C:\tools\nssm\win64\nssm.exe version
```

2. Check if services are registered:
```cmd
nssm status CFarmFastAPI
```

3. Manually test the guardian scripts:
```cmd
# Test FastAPI guardian
python C:/Local server/scripts/wrapper_fastapi.py

# Test Landing guardian
python E:/doihong-cfarm/guardian.py
```

4. Check Windows Event Viewer for service errors:
```cmd
eventvwr.msc
# Look in: Windows Logs > Application
```

### Port Already in Use

If port 8002 or 8003 is already in use:

```powershell
# Find process using port 8002
netstat -ano | findstr :8002

# Kill the process (replace PID)
taskkill /PID 1234 /F
```

### Cloudflared Token Issues

If tunnel won't start, verify the token is valid:
```cmd
cd C:\Users\nguye
cloudflared.exe tunnel run --token <your-token>
```

## Guardian Script Configuration

### FastAPI Guardian (`C:/Local server/scripts/wrapper_fastapi.py`)

| Parameter | Value | Description |
|-----------|-------|-------------|
| Health URL | `http://localhost:8002/health` | FastAPI health endpoint |
| Health Interval | 30s | How often to check health |
| Max Restarts | 10 | Restart limit per boot cycle |
| Log File | `C:/Local server/logs/guardian_fastapi.log` | Log output |

### Landing Guardian (`E:/doihong-cfarm/guardian.py`)

| Parameter | Value | Description |
|-----------|-------|-------------|
| Port Check | localhost:8003 | TCP port check |
| Health Interval | 30s | How often to check port |
| Max Restarts | 10 | Restart limit per boot cycle |
| Log File | `E:/doihong-cfarm/logs/guardian_landing.log` | Log output |

### Cloudflared Guardian (`C:/Local server/scripts/wrapper_cloudflared.py`)

| Parameter | Value | Description |
|-----------|-------|-------------|
| Tunnel Token | embedded in script | Cloudflare tunnel token |
| Health Check | localhost:8002/health | Verify tunnel works by hitting local service |
| Health Interval | 60s | How often to check (longer because tunnel take time to establish) |
| Max Restarts | 10 | Restart limit per boot cycle |
| Log File | `C:/Local server/logs/guardian_cloudflared.log` | Log output |

## NSSM Installation (First Time Setup)

### 1. Install NSSM

Download from https://nssm.cc/download:

```powershell
New-Item -ItemType Directory -Force -Path "C:\tools\nssm"
Invoke-WebRequest -Uri "https://nssm.cc/release/nssm-2.24.zip" -OutFile "C:\tools\nssm\nssm.zip"
Expand-Archive "C:\tools\nssm\nssm.zip" -DestinationPath "C:\tools\nssm" -Force
```

Verify: `C:\tools\nssm\win64\nssm.exe version`

### 2. Register Services

```cmd
# FastAPI Service
nssm install CFarmFastAPI "C:\Python\python.exe" "C:/Local server/scripts/wrapper_fastapi.py"
nssm set CFarmFastAPI AppDirectory "C:/Local server"
nssm set CFarmFastAPI DisplayName "CFarm FastAPI Server"
nssm set CFarmFastAPI Description "Farm management UI via FastAPI"
nssm set CFarmFastAPI Start SERVICE_AUTO_START

# Landing Service
nssm install CFarmLanding "C:\Python\python.exe" "E:/doihong-cfarm/guardian.py"
nssm set CFarmLanding AppDirectory "E:/doihong-cfarm"
nssm set CFarmLanding DisplayName "CFarm Landing Page"
nssm set CFarmLanding Description "Branding landing page"
nssm set CFarmLanding Start SERVICE_AUTO_START

# Cloudflared Tunnel
nssm install CFarmTunnel "C:\Python\python.exe" "C:/Local server/scripts/wrapper_cloudflared.py"
nssm set CFarmTunnel AppDirectory "C:/Local server"
nssm set CFarmTunnel DisplayName "CFarm Cloudflare Tunnel"
nssm set CFarmTunnel Description "Cloudflare tunnel for public access"
nssm set CFarmTunnel Start SERVICE_AUTO_START
```

### 3. Configure Recovery Actions

```cmd
sc failure CFarmFastAPI reset= 86400 actions= restart/5000/restart/10000/restart/30000
sc failure CFarmLanding reset= 86400 actions= restart/5000/restart/10000/restart/30000
sc failure CFarmTunnel reset= 86400 actions= restart/5000/restart/10000/restart/30000
```

This configures: reset failure counter after 86400s (1 day), then restart after 5s, 10s, 30s on subsequent failures.

## Manual Process Start (Without NSSM)

If NSSM services are not configured, start manually in separate terminals:

### Terminal 1: Cloudflared Tunnel (Guardian wrapper)
```cmd
python C:/Local server/scripts/wrapper_cloudflared.py
```

### Terminal 2: Landing Page
```cmd
cd E:\doihong-cfarm
python -m http.server 8003
```

### Terminal 3: FastAPI Server
```cmd
cd C:\Local server
python -m uvicorn src.server.main:app --host 0.0.0.0 --port 8002
```

Or use the guardian scripts directly:
```cmd
python C:/Local server/scripts/wrapper_fastapi.py
python E:/doihong-cfarm/guardian.py
```

## Verification Commands

```powershell
# Test endpoints
Invoke-WebRequest -Uri "http://localhost:8002/health" -UseBasicParsing
Invoke-WebRequest -Uri "http://localhost:8003" -UseBasicParsing

# Test public domains (requires tunnel)
Invoke-WebRequest -Uri "https://quanly.doihong.io.vn/health" -UseBasicParsing
Invoke-WebRequest -Uri "https://doihong.io.vn" -UseBasicParsing

# Check cloudflared running
tasklist | findstr cloudflared

# Check Python processes
tasklist | findstr python
```

## Emergency Recovery

If services are completely unresponsive:

1. Kill all related processes:
```cmd
taskkill /IM python.exe /F
taskkill /IM cloudflared.exe /F
```

2. Verify ports are free:
```powershell
netstat -ano | findstr ":8002 :8003"
```

3. Restart services:
```cmd
net start CFarmFastAPI
net start CFarmLanding
net start CFarmTunnel
```

Or if NSSM not configured, start guardian scripts manually.

## Log Analysis

### Common Log Patterns

```
# Normal startup
2026-05-08 10:00:00 [INFO] CFarm FastAPI Guardian starting (uptime: ...)

# Health check OK
2026-05-08 10:00:30 [INFO] Health check OK

# Process restart
2026-05-08 10:01:00 [WARNING] Process died, will restart...
2026-05-08 10:01:00 [INFO] Process started (restart #1), waiting 5s for startup...

# Max restarts reached
2026-05-08 10:05:00 [ERROR] Max restarts (10) reached. Sleeping 60s before retry...
```

### Log Retention

Logs are written directly to files. Consider setting up log rotation if disk space is a concern.
