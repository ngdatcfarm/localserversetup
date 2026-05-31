#!/usr/bin/env pwsh
# Comprehensive Guardian Tunnel Diagnostic

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Guardian Tunnel Diagnostic v2" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# 1. Check Guardian status
Write-Host "`n[1] Guardian Status:" -ForegroundColor Yellow
$pidFile = "C:\Local server\logs\guardian.pid"
if (Test-Path $pidFile) {
    $guardianPid = (Get-Content $pidFile -Raw).Trim()
    try {
        $proc = Get-Process -Id $guardianPid -ErrorAction SilentlyContinue
        if ($proc) {
            Write-Host "  PID $guardianPid - RUNNING - Started $($proc.StartTime)" -ForegroundColor Green
        } else {
            Write-Host "  PID file exists but process DEAD" -ForegroundColor Red
        }
    } catch {
        Write-Host "  Guardian not running (stale PID)" -ForegroundColor Red
    }
} else {
    Write-Host "  No PID file - Guardian not running" -ForegroundColor Red
}

# 2. Check cloudflared processes
Write-Host "`n[2] Cloudflared Processes:" -ForegroundColor Yellow
$cloudflaredProcs = Get-Process -Name cloudflared -ErrorAction SilentlyContinue
if ($cloudflaredProcs) {
    foreach ($p in $cloudflaredProcs) {
        Write-Host "  PID $($p.Id) - Started $($p.StartTime)" -ForegroundColor Green
    }
} else {
    Write-Host "  No cloudflared running" -ForegroundColor Red
}

# 3. Check ports 8002, 8003
Write-Host "`n[3] Port Status:" -ForegroundColor Yellow
$ports = @(8002, 8003)
foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    $listening = $conns | Where-Object { $_.State -eq 'Listen' }
    if ($listening) {
        $ownerPid = ($listening | Select-Object -First 1).OwningProcess
        $owner = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
        $ownerName = if ($owner) { $owner.ProcessName } else { "Unknown" }
        Write-Host "  Port $port - LISTENING (PID $ownerPid - $ownerName)" -ForegroundColor Green

        # Test health
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:$port/health" -UseBasicParsing -TimeoutSec 3
            Write-Host "    Health check: HTTP $($r.StatusCode)" -ForegroundColor Green
        } catch {
            Write-Host "    Health check: FAILED - $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "  Port $port - NOT LISTENING" -ForegroundColor Red
    }
}

# 4. Test tunnel endpoints
Write-Host "`n[4] Tunnel Endpoints:" -ForegroundColor Yellow
$endpoints = @{
    'doihong.io.vn' = 'https://doihong.io.vn'
    'quanly.doihong.io.vn' = 'https://quanly.doihong.io.vn'
}
foreach ($name in $endpoints.Keys) {
    $url = $endpoints[$name]
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
        Write-Host "  $name -> HTTP $($r.StatusCode)" -ForegroundColor Green
    } catch {
        $statusCode = $null
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
        }
        if ($statusCode) {
            Write-Host "  $name -> HTTP $statusCode" -ForegroundColor Yellow
        } else {
            Write-Host "  $name -> FAILED (timeout/network)" -ForegroundColor Red
        }
    }
}

# 5. DNS test
Write-Host "`n[5] DNS Resolution:" -ForegroundColor Yellow
try {
    $dns = Resolve-DnsName 'doihong.io.vn' -Type A -ErrorAction Stop
    $ips = $dns | Where-Object { $_.Type -eq 'A' } | Select-Object -ExpandProperty IPAddress
    Write-Host "  doihong.io.vn -> $($ips -join ', ')" -ForegroundColor Green
} catch {
    Write-Host "  DNS resolution failed" -ForegroundColor Red
}

# 6. Test from cloudflared perspective
Write-Host "`n[6] Cloudflared Metrics Server:" -ForegroundColor Yellow
try {
    $metrics = Invoke-RestMethod -Uri 'http://127.0.0.1:20242/metrics' -TimeoutSec 5 -ErrorAction Stop
    if ($metrics -match 'cloudflared_tunnel') {
        Write-Host "  Metrics server responding" -ForegroundColor Green
    }
} catch {
    Write-Host "  No metrics on port 20242 (may be different port)" -ForegroundColor Yellow
}

# 7. Check cloudflared config
Write-Host "`n[7] Cloudflared Config:" -ForegroundColor Yellow
$token = [Environment]::GetEnvironmentVariable('CLOUDFLARE_TUNNEL_TOKEN', 'User')
if ($token) {
    Write-Host "  Token length: $($token.Length)" -ForegroundColor Green
    # Decode token to show tunnel ID
    try {
        $decoded = [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($token))
        if ($decoded -match '"t":"([^"]+)"') {
            Write-Host "  Tunnel ID: $($Matches[1])" -ForegroundColor Cyan
        }
    } catch {}
} else {
    Write-Host "  NO TOKEN!" -ForegroundColor Red
}

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "SUMMARY:" -ForegroundColor Cyan
$hasGuardian = (Test-Path $pidFile) -and (Get-Process -Id ((Get-Content $pidFile -Raw).Trim()) -ErrorAction SilentlyContinue)
$hasCloudflared = (Get-Process -Name cloudflared -ErrorAction SilentlyContinue).Count -gt 0
$port8002Ok = (Get-NetTCPConnection -LocalPort 8002 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' })
$port8003Ok = (Get-NetTCPConnection -LocalPort 8003 -ErrorAction SilentlyContinue | Where-Object { $_.State -eq 'Listen' })
$endpointOk = $false
try {
    $r = Invoke-WebRequest -Uri 'https://quanly.doihong.io.vn' -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue
    if ($r.StatusCode -eq 200) { $endpointOk = $true }
} catch {}

Write-Host "  Guardian: $(if($hasGuardian){'RUNNING'}else{'DOWN'})" -ForegroundColor $(if($hasGuardian){'Green'}else{'Red'})
Write-Host "  Cloudflared: $(if($hasCloudflared){'RUNNING'}else{'DOWN'})" -ForegroundColor $(if($hasCloudflared){'Green'}else{'Red'})
Write-Host "  Port 8002: $(if($port8002Ok){'OK'}else{'DOWN'})" -ForegroundColor $(if($port8002Ok){'Green'}else{'Red'})
Write-Host "  Port 8003: $(if($port8003Ok){'OK'}else{'DOWN'})" -ForegroundColor $(if($port8003Ok){'Green'}else{'Red'})
Write-Host "  Tunnel Endpoint: $(if($endpointOk){'ACCESSIBLE'}else{'TIMEOUT'})" -ForegroundColor $(if($endpointOk){'Green'}else{'Yellow'})
Write-Host "========================================" -ForegroundColor Cyan

# Recommendations
Write-Host "`nRECOMMENDATIONS:" -ForegroundColor Cyan
if (-not $hasGuardian) {
    Write-Host "  - Start guardian: python scripts/guardian.py" -ForegroundColor White
}
if (-not $hasCloudflared) {
    Write-Host "  - Start cloudflared manually" -ForegroundColor White
}
if ($port8003Ok -and -not $endpointOk) {
    Write-Host "  - Port 8003 running but tunnel timeout - check Cloudflare tunnel status" -ForegroundColor White
}
Write-Host "  - Check Cloudflare Dashboard: https://dash.cloudflare.com -> Zero Trust -> Networks -> Tunnels" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan