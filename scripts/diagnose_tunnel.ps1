#!/usr/bin/env pwsh
# Guardian Tunnel Diagnostic Script

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Guardian Tunnel Diagnostic" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check if guardian is running
Write-Host "[1] Checking Guardian status..." -ForegroundColor Yellow
$pidFile = "C:\Local server\logs\guardian.pid"
if (Test-Path $pidFile) {
    $pid = Get-Content $pidFile -Raw
    try {
        $proc = Get-Process -Id $pid.Trim() -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  Guardian running: PID $pid" -ForegroundColor Green
        } else {
            Write-Host "  Guardian PID file exists but process not running" -ForegroundColor Red
        }
    } catch {
        Write-Host "  Guardian not running (stale PID file)" -ForegroundColor Yellow
    }
} else {
    Write-Host "  No Guardian PID file found" -ForegroundColor Yellow
}

# 2. Check cloudflared processes
Write-Host ""
Write-Host "[2] Checking cloudflared processes..." -ForegroundColor Yellow
$cloudflaredProcs = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
if ($cloudflaredProcs) {
    foreach ($p in $cloudflaredProcs) {
        Write-Host "  Found: PID $($p.Id), started $($p.StartTime)" -ForegroundColor Green
    }
} else {
    Write-Host "  No cloudflared process running" -ForegroundColor Red
}

# 3. Check tunnel token
Write-Host ""
Write-Host "[3] Checking Tunnel Token..." -ForegroundColor Yellow
$token = [Environment]::GetEnvironmentVariable('CLOUDFLARE_TUNNEL_TOKEN', 'User')
if ($token) {
    Write-Host "  Token found, length: $($token.Length)" -ForegroundColor Green
} else {
    Write-Host "  NO TOKEN FOUND!" -ForegroundColor Red
}

# 4. Test DNS resolution
Write-Host ""
Write-Host "[4] Testing DNS resolution..." -ForegroundColor Yellow
try {
    $dns = Resolve-DnsName 'doihong.io.vn' -Type A -ErrorAction Stop
    foreach ($d in $dns) {
        if ($d.IPAddress) {
            Write-Host "  doihong.io.vn -> $($d.IPAddress)" -ForegroundColor Green
        }
    }
} catch {
    Write-Host "  DNS resolution failed: $_" -ForegroundColor Red
}

# 5. Test local connectivity
Write-Host ""
Write-Host "[5] Testing local app..." -ForegroundColor Yellow
try {
    $r = Invoke-WebRequest -Uri 'http://localhost:8002/health' -UseBasicParsing -TimeoutSec 5
    Write-Host "  localhost:8002 -> HTTP $($r.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "  localhost:8002 failed: $_" -ForegroundColor Red
}

# 6. Test tunnel endpoints
Write-Host ""
Write-Host "[6] Testing tunnel endpoints..." -ForegroundColor Yellow
$endpoints = @('https://doihong.io.vn', 'https://quanly.doihong.io.vn')
foreach ($ep in $endpoints) {
    try {
        $r = Invoke-WebRequest -Uri $ep -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        Write-Host "  $ep -> HTTP $($r.StatusCode)" -ForegroundColor Green
    } catch {
        Write-Host "  $ep -> FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 7. Check cloudflared metrics (if running)
Write-Host ""
Write-Host "[7] Checking cloudflared metrics..." -ForegroundColor Yellow
$metricsPort = 20242
try {
    $metrics = Invoke-RestMethod -Uri "http://127.0.0.1:$metricsPort/metrics" -TimeoutSec 5 -ErrorAction Stop
    if ($metrics -match 'cloudflared_tunnel_status{[^}]+}') {
        Write-Host "  Metrics available" -ForegroundColor Green
    }
} catch {
    Write-Host "  Metrics not available on port $metricsPort" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Actions:" -ForegroundColor Cyan
Write-Host "  To restart guardian: python guardian_control.py restart" -ForegroundColor White
Write-Host "  To force restart tunnel: taskkill /F /IM cloudflared.exe; then restart guardian" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan