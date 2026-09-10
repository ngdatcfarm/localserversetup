# CFarm Guardian - User-Level Auto-Start Installer
# Uses Windows shell:startup folder (no admin required).
# Drops a .lnk that runs start_guardian.bat on every user login.
# Uses run_silent.vbs wrapper so no cmd console flashes on login.
# This is LAYER 1 of the auto-start stack:
#   Layer 1: shell:startup (works now, no admin, on every login)
#   Layer 2: Task Scheduler (admin, restart on crash within 1 min)
#   Layer 3: guardian.py self-respawn (in-process, rate-limited)

$ErrorActionPreference = "Stop"

$StartupFolder = [Environment]::GetFolderPath("Startup")
$LinkPath  = Join-Path $StartupFolder "CFarmGuardian.lnk"
$VbsPath   = "E:\cfarm\scripts\run_silent.vbs"
$BatPath   = "E:\cfarm\scripts\start_guardian.bat"
$WorkDir   = "E:\cfarm"
$IconLoc   = "E:\cfarm\cloudflared.exe,0"  # any exe with an icon
$Desc      = "CFarm Guardian - auto-start (silent)"

if (-not (Test-Path $VbsPath)) {
    Write-Host "[ERROR] $VbsPath not found"
    exit 1
}

Write-Host "[1/3] Creating shortcut at $LinkPath"

$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut($LinkPath)
# Point shortcut at wscript.exe + VBS wrapper + bat path
# This way Windows uses wscript (no console) which calls the bat hidden
$shortcut.TargetPath = "wscript.exe"
$shortcut.Arguments  = "`"$VbsPath`" `"$BatPath`""
$shortcut.WorkingDirectory = $WorkDir
$shortcut.IconLocation = $IconLoc
$shortcut.Description = $Desc
$shortcut.WindowStyle = 7   # Minimized, just in case
$shortcut.Save()

if (Test-Path $LinkPath) {
    Write-Host "[2/3] Shortcut created successfully"
} else {
    Write-Host "[2/3] FAILED to create shortcut"
    exit 1
}

Write-Host "[3/3] Verifying..."
Get-Item $LinkPath | Select-Object FullName, Length, LastWriteTime | Format-List

Write-Host ""
Write-Host "========================================="
Write-Host "  Layer 1 (shell:startup) installed SILENTLY!"
Write-Host "========================================="
Write-Host ""
Write-Host "  Shortcut:  $LinkPath"
Write-Host "  Target:    wscript.exe (no console window)"
Write-Host "  Wraps:     $VbsPath"
Write-Host "  Calls:     $BatPath"
Write-Host "  When:      Every time user 'nguye' logs in - NO console flash"
Write-Host ""
Write-Host "  Next: Run scripts\install_task_scheduler.bat as Administrator for"
Write-Host "        Layer 2 (auto-restart on crash, every 1 min)."
Write-Host ""
