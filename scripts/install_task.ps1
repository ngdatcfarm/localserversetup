# CFarm Guardian - Task Scheduler Registration (PowerShell)
# Run as Administrator or as current user (works for user-level ONLOGON tasks)

$ErrorActionPreference = "Stop"

$TaskName    = "CFarmGuardianAutoStart"
$VbsPath     = "E:\cfarm\scripts\run_silent.vbs"
$ScriptPath  = "E:\cfarm\scripts\start_guardian.bat"
$Description = "CFarm Guardian - auto-start on user logon; restart every 1 minute if it dies"

# Remove any existing task
try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "[1/4] Removed any pre-existing task"
} catch {
    Write-Host "[1/4] No pre-existing task to remove"
}

# Build task components.
# Use wscript.exe + VBS wrapper so the .bat runs HIDDEN (no console flash).
$action = New-ScheduledTaskAction `
    -Execute "wscript.exe" `
    -Argument "`"$VbsPath`" `"$ScriptPath`"" `
    -WorkingDirectory "E:\cfarm"

# PowerShell 5.1 doesn't support -Delay; use CIM method or skip delay.
# A 30s startup delay is also handled inside start_guardian.bat's first health check.
$trigger = New-ScheduledTaskTrigger -AtLogOn
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive
$settings = New-ScheduledTaskSettingsSet `
    -RestartCount 99 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Hours 0)  # unlimited runtime

# Register
try {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger `
        -Principal $principal `
        -Settings $settings `
        -Force `
        -Description $Description | Out-Null
    Write-Host "[2/4] Task '$TaskName' registered successfully"
} catch {
    Write-Host "[2/4] FAILED to register task: $_"
    Write-Host "       Try running this script as Administrator."
    exit 1
}

# Verify
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "[3/4] Verified task exists - State: $($task.State)"
} else {
    Write-Host "[3/4] ERROR: Task not found after registration"
    exit 1
}

# Trigger it now
Write-Host "[4/4] Triggering task to start guardian now..."
Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "========================================="
Write-Host "  Task Scheduler setup complete!"
Write-Host "========================================="
Write-Host ""
Write-Host "  Task name:  $TaskName"
Write-Host "  Script:     $ScriptPath"
Write-Host "  Trigger:    At logon (with 30s delay)"
Write-Host "  Restart:    Every 1 min if task fails (up to 99 times)"
Write-Host ""
Write-Host "  Status:     Get-ScheduledTask -TaskName '$TaskName' | Format-List"
Write-Host "  Run now:    Start-ScheduledTask -TaskName '$TaskName'"
Write-Host "  Remove:     Unregister-ScheduledTask -TaskName '$TaskName' -Confirm:\$false"
Write-Host ""
