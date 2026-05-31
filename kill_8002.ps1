$pids = Get-NetTCPConnection -LocalPort 8002 -State Listen | Select-Object -ExpandProperty OwningProcess | Sort-Object -Unique
Write-Host "PIDs on 8002:" $pids
foreach ($p in $pids) {
    Write-Host "Stopping PID $p"
    Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
}
Write-Host "Done"