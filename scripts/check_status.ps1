Write-Output "=== All python processes with command lines ==="
Get-CimInstance Win32_Process -Filter "Name LIKE '%python%'" |
    Select-Object ProcessId, Name, CreationDate, CommandLine |
    Format-Table -AutoSize -Wrap

Write-Output ""
Write-Output "=== cloudflared process ==="
Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" |
    Select-Object ProcessId, Name, CreationDate, CommandLine |
    Format-Table -AutoSize -Wrap

Write-Output ""
Write-Output "=== PID files state ==="
foreach ($f in 'guardian.pid', 'guardian.watchdog.pid', 'tunnel.watchdog.pid') {
    $p = "E:\cfarm\logs\$f"
    if (Test-Path $p) {
        $pid_val = (Get-Content $p -ErrorAction SilentlyContinue).Trim()
        $alive = "?"
        if ($pid_val -and ($pid_val -match '^\d+$')) {
            $proc = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $pid_val) -ErrorAction SilentlyContinue
            $alive = if ($proc) { "YES" } else { "NO" }
        }
        Write-Output ("  {0,-26} file_pid={1,-7} alive={2}" -f $f, $pid_val, $alive)
    } else {
        Write-Output ("  {0,-26} MISSING" -f $f)
    }
}

Write-Output ""
Write-Output "=== Port 2000 (cloudflared metrics) ==="
Get-NetTCPConnection -LocalPort 2000 -State Listen -ErrorAction SilentlyContinue |
    Format-Table LocalAddress, LocalPort, State, OwningProcess -AutoSize

Write-Output ""
Write-Output "=== Public tunnel health ==="
try {
    $r = Invoke-WebRequest -Uri 'https://doihong.io.vn/health' -TimeoutSec 8 -UseBasicParsing
    Write-Output ("  HTTP " + $r.StatusCode + " in " + ($r.Headers['Cf-Cache-Status'] -join ',') + " body=" + $r.Content.Substring(0, [Math]::Min(120, $r.Content.Length)))
} catch {
    Write-Output ("  FAIL: " + $_.Exception.Message)
}