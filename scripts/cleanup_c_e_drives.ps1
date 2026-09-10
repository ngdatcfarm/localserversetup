# Cleanup script for C: and E: drives (per user approval)
# Targets: 1) E:\CFarm duplicate, 2) E:\$RECYCLE.BIN, 3) C: pagefile advice, 4) C: hiberfil disable, 5) C: WinSxS clean
#
# Usage: -Apply to actually perform
#        (default = preview)

[CmdletBinding()]
param(
    [switch]$Apply
)

$ErrorActionPreference = 'Continue'

function Say($msg)  { Write-Host "==> $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "!! $msg" -ForegroundColor Yellow }
function Ok($msg)   { Write-Host "OK $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "FAIL $msg" -ForegroundColor Red }

# ============================================
# Pre-flight inventory
# ============================================
Say "Pre-flight inventory"

$targets = @()

# 1. E:\CFarm duplicate
$cFarmUpper = "E:\CFarm"
if (Test-Path $cFarmUpper) {
    $size = (Get-ChildItem $cFarmUpper -Recurse -File -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    $targets += @{
        Tag = "E:\CFarm duplicate"
        Type = "stale-git-clone"
        Path = $cFarmUpper
        SizeGB = [Math]::Round($size / 1GB, 2)
        SafeToDelete = $true
        Note = "git HEAD matches E:\cfarm (commit 9adc2ee, 2026-07-06); last src write 2026-06-19. Safe to delete - can git clone from local bare repo or pull from origin."
    }
}

# 2. E:\$RECYCLE.BIN
$recycle = "E:\$RECYCLE.Bin"
if (Test-Path $recycle) {
    $size = (Get-ChildItem $recycle -Recurse -File -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    $targets += @{
        Tag = "E:\ Recycle Bin"
        Type = "recycle-bin"
        Path = $recycle
        SizeGB = [Math]::Round($size / 1GB, 2)
        SafeToDelete = $true
        Note = "Empty recycle bin (clears all deleted files on E:)"
    }
}

# 3. E:\cfarm\docker\mosquitto\log\mosquitto.log (1 GB unbounded log)
$mqLog = "E:\cfarm\docker\mosquitto\log\mosquitto.log"
if (Test-Path $mqLog) {
    $size = (Get-Item $mqLog -ErrorAction SilentlyContinue).Length
    $targets += @{
        Tag = "mosquitto.log (unbounded MQTT log)"
        Type = "logfile"
        Path = $mqLog
        SizeGB = [Math]::Round($size / 1GB, 2)
        SafeToDelete = $true
        Note = "Truncate to 0 (data still in DB - log is just debug info). Should add log rotation to mosquitto config."
    }
}

# 4. C:\hiberfil.sys
$hiberfil = "C:\hiberfil.sys"
if (Test-Path $hiberfil) {
    $size = (Get-Item $hiberfil -ErrorAction SilentlyContinue).Length
    $targets += @{
        Tag = "C:\hiberfil.sys"
        Type = "system-sleep"
        Path = $hiberfil
        SizeGB = [Math]::Round($size / 1GB, 2)
        SafeToDelete = $false  # requires admin
        Note = "Disable hibernation to reclaim: powercfg /h off (needs admin). Only do this if you don't use hibernate."
    }
}

# 5. C:\pagefile.sys
$pagefile = "C:\pagefile.sys"
if (Test-Path $pagefile) {
    $size = (Get-Item $pagefile -ErrorAction SilentlyContinue).Length
    $targets += @{
        Tag = "C:\pagefile.sys"
        Type = "pagefile"
        Path = $pagefile
        SizeGB = [Math]::Round($size / 1GB, 2)
        SafeToDelete = $false
        Note = "24 GB. Can be reduced (Settings > System > About > Advanced > Performance > Virtual Memory). Min safe = RAM size (16GB). Use 16GB fixed or let Windows manage."
    }
}

# 6. C:\Windows\SoftwareDistribution\Download (Windows Update cache)
$wuCache = "C:\Windows\SoftwareDistribution\Download"
if (Test-Path $wuCache) {
    $size = (Get-ChildItem $wuCache -Recurse -File -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    $targets += @{
        Tag = "C:\Windows\SoftwareDistribution\Download (Windows Update cache)"
        Type = "windows-cache"
        Path = $wuCache
        SizeGB = [Math]::Round($size / 1GB, 2)
        SafeToDelete = $true
        Note = "Stop 'wuauserv' service, then delete contents, then restart. 1.67 GB reclaimable."
    }
}

# 7. AppData\Local\Arduino15 stale toolchain
$arduino = "$env:USERPROFILE\AppData\Local\Arduino15\staging\packages"
if (Test-Path $arduino) {
    $size = (Get-ChildItem $arduino -Recurse -File -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    $targets += @{
        Tag = "Arduino15 staging (stale ESP32 toolchain zips)"
        Type = "ide-cache"
        Path = $arduino
        SizeGB = [Math]::Round($size / 1GB, 2)
        SafeToDelete = "careful"
        Note = "These are toolchain zips kept by Arduino IDE in case of re-install. Can delete safely IF you have the toolchains installed (check Arduino IDE > Boards Manager). Otherwise, the IDE will redownload on next compile (~3GB)."
    }
}

# 8. AppData\Local\CapCut Drafts
$capcut = "$env:USERPROFILE\AppData\Local\CapCut Drafts"
if (Test-Path $capcut) {
    $size = (Get-ChildItem $capcut -Recurse -File -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    $targets += @{
        Tag = "CapCut Drafts (video editor cache)"
        Type = "app-cache"
        Path = $capcut
        SizeGB = [Math]::Round($size / 1GB, 2)
        SafeToDelete = "user-decision"
        Note = "CapCut video editor auto-saves. 2 GB. Can be cleared via CapCut app > Settings > Storage."
    }
}

# Print inventory
$totalGB = 0
Write-Host ""
foreach ($t in $targets) {
    $sizeStr = "{0} GB" -f $t.SizeGB
    $safeStr = switch ($t.SafeToDelete) {
        $true { "YES" }
        $false { "NO (admin needed)" }
        default { "CAREFUL" }
    }
    Write-Host ("  [{0,-9}] {1,-50}  {2,8}" -f $safeStr, $t.Tag, $sizeStr) -ForegroundColor $(if ($t.SafeToDelete -eq $true) { "Green" } elseif ($t.SafeToDelete -eq $false) { "Yellow" } else { "Cyan" })
    Write-Host ("     Path:  {0}" -f $t.Path) -ForegroundColor Gray
    Write-Host ("     Note:  {0}" -f $t.Note) -ForegroundColor Gray
    Write-Host ""
    if ($t.SafeToDelete -eq $true) { $totalGB += $t.SizeGB }
}

Write-Host ""
Write-Host ("  TOTAL safely reclaimable: {0} GB" -f [Math]::Round($totalGB, 2)) -ForegroundColor Green
Write-Host ("  TOTAL with admin actions: add pagefile reduction + hiberfil disable") -ForegroundColor Yellow

# ============================================
# Confirm
# ============================================
if (-not $Apply) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "DRY-RUN MODE (preview only - no changes)" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Re-run with -Apply to perform the cleanup."
    Write-Host ""
    Write-Host "This will: clear recycle bin, remove E:\CFarm duplicate,"
    Write-Host "truncate mosquitto.log, and clear Windows Update cache."
    Write-Host "(It will NOT touch pagefile, hiberfil, Arduino15, or CapCut - those need your decision.)"
    exit 0
}

# ============================================
# Apply
# ============================================
Write-Host ""
Say "APPLY MODE"
Write-Host ""

# 1. Empty recycle bin
Say "[1/4] Emptying E:\ Recycle Bin"
try {
    Clear-RecycleBin -Force -ErrorAction Stop
    Ok "  Recycle bin cleared"
} catch {
    Warn "  Recycle bin clear failed: $($_.Exception.Message)"
}

# 2. Truncate mosquitto.log (keep 0 bytes - data is in DB)
Say "[2/4] Truncating mosquitto.log"
if (Test-Path $mqLog) {
    try {
        # Use cmd to truncate to 0 bytes (PowerShell Set-Content/Out-File can leave BOM)
        $null | Out-File $mqLog -Encoding utf8
        $newSize = (Get-Item $mqLog).Length
        Ok "  mosquitto.log truncated to $newSize bytes"
    } catch {
        Warn "  Truncate failed: $($_.Exception.Message)"
    }
} else {
    Ok "  mosquitto.log not present"
}

# 3. Clear Windows Update cache
Say "[3/4] Clearing Windows Update cache (1.67 GB)"
try {
    Stop-Service -Name wuauserv -Force -ErrorAction Stop
    Start-Sleep -Seconds 2
    Get-ChildItem "C:\Windows\SoftwareDistribution\Download\*" -Recurse -Force -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
    Start-Service -Name wuauserv -ErrorAction SilentlyContinue
    $newSize = (Get-ChildItem "C:\Windows\SoftwareDistribution\Download" -Recurse -File -Force -ErrorAction SilentlyContinue |
        Measure-Object -Property Length -Sum).Sum
    Ok "  Windows Update cache cleared (now $([Math]::Round($newSize/1MB,1)) MB)"
} catch {
    Warn "  Windows Update cache clear failed: $($_.Exception.Message)"
    Start-Service -Name wuauserv -ErrorAction SilentlyContinue
}

# 4. Remove E:\CFarm duplicate
Say "[4/4] Removing E:\CFarm duplicate (11.5 GB)"
Write-Host "  This is a PERMANENT delete (bypasses recycle bin)..." -ForegroundColor Yellow
Write-Host "  Press Ctrl+C within 5 seconds to cancel..." -ForegroundColor Red
$countdown = 5
while ($countdown -gt 0) {
    Write-Host -NoNewline "`r  Cancelling in $countdown seconds...  "
    Start-Sleep -Seconds 1
    $countdown--
}
Write-Host ""

if (Test-Path $cFarmUpper) {
    try {
        # Use cmd rmdir for speed
        cmd /c "rmdir /S /Q `"E:\CFarm`"" 2>&1
        if (-not (Test-Path $cFarmUpper)) {
            Ok "  E:\CFarm removed"
        } else {
            Fail "  E:\CFarm still present"
        }
    } catch {
        Fail "  Remove failed: $($_.Exception.Message)"
    }
} else {
    Ok "  E:\CFarm already gone"
}

# Final summary
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "CLEANUP DONE" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
$freeAfter = (Get-PSDrive E).Free
Write-Host ("  E: free now: {0} GB" -f [Math]::Round($freeAfter/1GB, 2))
$freeC = (Get-PSDrive C).Free
Write-Host ("  C: free now: {0} GB" -f [Math]::Round($freeC/1GB, 2))
Write-Host ""
Write-Host "Suggested admin actions (run as admin):"
Write-Host "  - DISM cleanup (WinSxS):  dism /online /Cleanup-Image /StartComponentCleanup /ResetBase"
Write-Host "  - Disable hibernation:   powercfg /h off   (saves ~9.5 GB)"
Write-Host "  - Vacuum TimescaleDB:    See scripts/vacuum_db.sql (reclaim bloat from chunks)"