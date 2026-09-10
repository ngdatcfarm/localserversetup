# Un-redirect Desktop/Documents/Pictures from OneDrive back to local
# Option B - user approved 2026-07-15
#
# Uses wildcard matching to handle Vietnamese Unicode folder names correctly
# (PowerShell ISE encoding issue with diacritics bypassed by using -Filter glob)

[CmdletBinding()]
param(
    [switch]$Apply   # Default = dry-run preview. Use -Apply to actually move files.
)

$ErrorActionPreference = 'Stop'

# --- Helper: pretty print ---
function Say($msg)  { Write-Host "==> $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "!! $msg" -ForegroundColor Yellow }
function Ok($msg)   { Write-Host "OK $msg" -ForegroundColor Green }
function Fail($msg) { Write-Host "FAIL $msg" -ForegroundColor Red }

# --- Resolve OneDrive folders using wildcards ---
$oneDriveRoot = Join-Path $env:USERPROFILE 'OneDrive'
$localRoot    = $env:USERPROFILE

if (-not (Test-Path $oneDriveRoot)) {
    Fail "OneDrive root missing: $oneDriveRoot"
    exit 1
}

Say "Resolving OneDrive folder paths (via wildcard)"
$desktop   = Get-ChildItem -Path $oneDriveRoot -Directory -Filter 'M*y t*nh*'  -Force -ErrorAction SilentlyContinue | Select-Object -First 1
$documents = Get-ChildItem -Path $oneDriveRoot -Directory -Filter 'T*i li*u'   -Force -ErrorAction SilentlyContinue | Select-Object -First 1
$pictures  = Get-ChildItem -Path $oneDriveRoot -Directory -Filter 'H*nh *nh*'  -Force -ErrorAction SilentlyContinue | Select-Object -First 1

$sources = @(
    @{ Sub = 'Desktop';   Src = if ($desktop)   { $desktop.FullName   } else { $null }; Dst = Join-Path $localRoot 'Desktop'   },
    @{ Sub = 'Documents'; Src = if ($documents) { $documents.FullName } else { $null }; Dst = Join-Path $localRoot 'Documents' },
    @{ Sub = 'Pictures';  Src = if ($pictures)  { $pictures.FullName  } else { $null }; Dst = Join-Path $localRoot 'Pictures'  }
)

# --- Pre-flight checks ---
Say "Pre-flight checks"
$issues = @()
$totalBytes = 0

foreach ($s in $sources) {
    Write-Host ""
    Write-Host "  Folder: $($s.Sub)" -ForegroundColor White
    Write-Host "    From: $($s.Src)"
    Write-Host "    To:   $($s.Dst)"

    if (-not $s.Src -or -not (Test-Path $s.Src)) {
        Warn "    Source does not exist - skipping"
        continue
    }

    $srcItems = Get-ChildItem $s.Src -Force -ErrorAction SilentlyContinue
    $srcFileCount = ($srcItems | Where-Object { -not $_.PSIsContainer }).Count
    $srcDirCount  = ($srcItems | Where-Object { $_.PSIsContainer }).Count

    try {
        $size = (Get-ChildItem -Path $s.Src -Recurse -File -Force -ErrorAction SilentlyContinue |
            Measure-Object -Property Length -Sum).Sum
        $sizeMB = [Math]::Round($size / 1MB, 1)
        $totalBytes += $size
    } catch { $sizeMB = -1 }

    Write-Host "    Files: $srcFileCount  Dirs: $srcDirCount  Size: ${sizeMB} MB"

    if (Test-Path $s.Dst) {
        $dstItems = Get-ChildItem $s.Dst -Force -ErrorAction SilentlyContinue
        $dstCount = ($dstItems | Measure-Object).Count
        Write-Host "    Destination exists: $dstCount items"

        $conflicts = @()
        foreach ($item in $srcItems) {
            $dstPath = Join-Path $s.Dst $item.Name
            if (Test-Path -LiteralPath $dstPath) {
                $conflicts += $item.Name
            }
        }
        if ($conflicts.Count -gt 0) {
            Warn "    Conflicts found ($($conflicts.Count) items):"
            $conflicts | Select-Object -First 20 | ForEach-Object { Write-Host "      - $_" }
            $issues += "$($s.Sub): $($conflicts.Count) name conflicts"
        }
    } else {
        Write-Host "    Destination does not exist - will be created"
    }
}

Write-Host ""
Write-Host ("  TOTAL to move: {0} MB ({1} GB)" -f [Math]::Round($totalBytes / 1MB, 1), [Math]::Round($totalBytes / 1GB, 2))

Write-Host ""
Say "Current Known Folder Move registry state"
$reg = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\SyncRootManager\*' -ErrorAction SilentlyContinue
if ($reg) {
    $reg | Select-Object @{N='Key';E={$_.PSPath}}, FolderPath, FolderPathEnabled, FolderRedirection | Format-Table -AutoSize -Wrap
} else {
    Write-Host "  (no entries)"
}

# --- Summary ---
if ($issues.Count -gt 0) {
    Write-Host ""
    Warn "Issues:"
    $issues | ForEach-Object { Write-Host "  - $_" }
}

if (-not $Apply) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host "DRY-RUN MODE (preview only - no changes)" -ForegroundColor Yellow
    Write-Host "============================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Re-run with -Apply to actually move files + update registry."
    exit 0
}

# ========================================================
# APPLY MODE
# ========================================================

Write-Host ""
Say "APPLY MODE - performing changes"
Write-Host ""

# --- Step 1: Stop OneDrive ---
Say "Step 1: Stop OneDrive (avoid sync conflicts)"
$odProcess = Get-Process OneDrive -ErrorAction SilentlyContinue
if ($odProcess) {
    try {
        Stop-Process -Name OneDrive -Force -ErrorAction Stop
        Start-Sleep -Seconds 2
        Ok "  OneDrive stopped (PID $($odProcess.Id))"
    } catch {
        Warn "  Could not stop OneDrive: $($_.Exception.Message)"
    }
} else {
    Ok "  OneDrive already not running"
}

# --- Step 2: Move files ---
Say "Step 2: Move files (robocopy /MOVE)"
foreach ($s in $sources) {
    Write-Host ""
    Write-Host "  Processing $($s.Sub)..." -ForegroundColor Cyan
    if (-not $s.Src -or -not (Test-Path $s.Src)) {
        Warn "    Source missing, skipping"
        continue
    }

    if (-not (Test-Path $s.Dst)) {
        New-Item -ItemType Directory -Path $s.Dst -Force | Out-Null
        Ok "    Created destination: $($s.Dst)"
    }

    $srcPath = $s.Src.TrimEnd('\')
    $dstPath = $s.Dst.TrimEnd('\')

    Write-Host "    robocopy `"$srcPath`" `"$dstPath`" /E /MOVE /R:3 /W:5"
    $proc = Start-Process -FilePath "robocopy.exe" -ArgumentList @(
        "`"$srcPath`""
        "`"$dstPath`""
        "/E","/MOVE","/R:3","/W:5"
    ) -NoNewWindow -Wait -PassThru
    $rc = $proc.ExitCode
    if ($rc -lt 8) {
        Ok "    robocopy exit=$rc (0=ok, 1=files, 2=dirs, 3=both, 4=mismatch)"
    } else {
        Fail "    robocopy exit=$rc - check manually"
    }
}

# --- Step 3: Update Known Folder Move registry (HKLM) ---
Say "Step 3: Update Known Folder Move registry (HKLM\..\SyncRootManager)"
$regBase = 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\SyncRootManager'

# KFM namespace GUIDs:
# Desktop   = {B4BFCC3A-DB2C-424C-B029-7FE99A87C641}
# Documents = {F42EE2D3-909F-4907-8871-4C22FC0BF756}  (or ED7BA470...)
# Pictures  = {0DDD015D-B06C-45D5-8C4C-F59713854639}
# Try multiple known GUIDs per folder
$kfmKeys = @(
    @{ Sub = 'Desktop';   Keys = @('Desktop!{B4BFCC3A-DB2C-424C-B029-7FE99A87C641}') },
    @{ Sub = 'Documents'; Keys = @('Documents!{ED7BA470-8E54-465E-825C-99712043E01C}', 'Documents!{F42EE2D3-909F-4907-8871-4C22FC0BF756}') },
    @{ Sub = 'Pictures';  Keys = @('Pictures!{0DDD015D-B06C-45D5-8C4C-F59713854639}') }
)

foreach ($k in $kfmKeys) {
    $matched = $false
    foreach ($keyName in $k.Keys) {
        $keyPath = Join-Path $regBase $keyName
        if (Test-Path $keyPath) {
            try {
                Set-ItemProperty -Path $keyPath -Name 'FolderPathEnabled' -Value 0 -ErrorAction Stop
                Ok "  $($k.Sub): FolderPathEnabled = 0"
                $matched = $true
                break
            } catch {
                Warn "  $($k.Sub) ($keyName): $($_.Exception.Message)"
            }
        }
    }
    if (-not $matched) {
        Warn "  $($k.Sub): no KFM key found (OneDrive may already be unlinked)"
    }
}

# --- Step 3b: User Shell Folders (HKCU) - this is what Explorer actually reads ---
Say "Step 3b: Update User Shell Folders (HKCU)"
$shellBase = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders'
$shellMappings = @(
    @{ Name = 'Desktop';    Value = Join-Path $localRoot 'Desktop'   },
    @{ Name = 'Personal';   Value = Join-Path $localRoot 'Documents' },
    @{ Name = 'My Pictures'; Value = Join-Path $localRoot 'Pictures' }
)

foreach ($m in $shellMappings) {
    try {
        # Use New-ItemProperty if key doesn't exist, else Set-ItemProperty
        if (Get-ItemProperty -Path $shellBase -Name $m.Name -ErrorAction SilentlyContinue) {
            Set-ItemProperty -Path $shellBase -Name $m.Name -Value $m.Value -ErrorAction Stop
        } else {
            New-ItemProperty -Path $shellBase -Name $m.Name -Value $m.Value -PropertyType ExpandString -Force | Out-Null
        }
        Ok "  $(${m.Name}) -> $($m.Value)"
    } catch {
        Warn "  $($m.Name): $($_.Exception.Message)"
    }
}

# --- Step 4: Clean up empty OneDrive source folders ---
Say "Step 4: Clean up empty OneDrive subfolders"
foreach ($s in $sources) {
    if ($s.Src -and (Test-Path $s.Src)) {
        $remaining = @(Get-ChildItem $s.Src -Force -ErrorAction SilentlyContinue)
        if ($remaining.Count -eq 0) {
            try {
                Remove-Item $s.Src -Force -ErrorAction Stop
                Ok "  Removed empty: $($s.Src)"
            } catch {
                Warn "  Could not remove $($s.Src): $($_.Exception.Message)"
            }
        } else {
            Warn "  Not empty: $($s.Src) ($($remaining.Count) items remain)"
        }
    }
}

# --- Step 5: Restart OneDrive (so it picks up new state) ---
Say "Step 5: Restart OneDrive"
$odExe = "$env:LOCALAPPDATA\Microsoft\OneDrive\OneDrive.exe"
if (Test-Path $odExe) {
    Start-Process -FilePath $odExe -ErrorAction SilentlyContinue
    Ok "  Launched: $odExe"
} else {
    Warn "  OneDrive.exe not found at $odExe"
}

# --- Step 6: Verify ---
Say "Step 6: Verify"
Start-Sleep -Seconds 3
foreach ($s in $sources) {
    $exists = Test-Path $s.Dst
    if ($exists) {
        $count = (Get-ChildItem $s.Dst -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object).Count
        $size  = try { (Get-ChildItem -Path $s.Dst -Recurse -File -Force -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum } catch { 0 }
        Write-Host ("    {0,-12} exists={1}  items={2,6}  size={3} MB" -f $s.Sub, $exists, $count, [Math]::Round($size/1MB, 1))
    } else {
        Write-Host ("    {0,-12} MISSING" -f $s.Sub) -ForegroundColor Red
    }
}

# --- Step 7: Verify User Shell Folders ---
Say "Step 7: Verify User Shell Folders registry"
foreach ($m in $shellMappings) {
    $val = (Get-ItemProperty -Path $shellBase -Name $m.Name -ErrorAction SilentlyContinue).($m.Name)
    Write-Host "  $(${m.Name}) = $val"
}

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "DONE" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps (manual if you want):"
Write-Host "  - Test by opening Explorer - Desktop/Documents/Pictures should now be local"
Write-Host "  - If you want to fully unlink OneDrive: Settings > Account > Unlink this PC"
Write-Host "  - Restart may be required for some apps to see the change"