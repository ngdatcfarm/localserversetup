$ErrorActionPreference = 'SilentlyContinue'
$pids = Get-NetTCPConnection -LocalPort 8002 -State Listen | Select-Object -ExpandProperty OwningProcess
$pids += Get-Process python3.12, python | Select-Object -ExpandProperty Id
$pids = $pids | Sort-Object -Unique
Write-Host "Killing" $pids.Count "processes..."
foreach ($p in $pids) {
    Write-Host "Stop-Process" $p -ForegroundColor Yellow
    Stop-Process -Id $p -Force
}
Start-Sleep -Seconds 3
Write-Host "Done"