# Try to fix .txt UserChoice via SetUserChoice API (works in user context)
# This bypasses the UserChoice registry protection

$ErrorActionPreference = 'Continue'

# P/Invoke SetUserChoice
$src = @"
using System;
using System.Runtime.InteropServices;

public class UC {
    [DllImport("shell32.dll", CharSet=CharSet.Auto, SetLastError=true)]
    public static extern uint SetUserChoice(string pszExt, uint dwFlags, string pszNewChoice);

    [DllImport("shell32.dll", CharSet=CharSet.Auto, SetLastError=true)]
    public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
}
"@
try {
    Add-Type -TypeDefinition $src -ErrorAction Stop
    Write-Host "SetUserChoice P/Invoke loaded" -ForegroundColor Green
} catch {
    Write-Host "P/Invoke failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Try various ProgIDs
$progids = @(
    'Win32\notepad.exe',
    'Applications\notepad.exe',
    'txtfile',
    'txtfilelegacy',
    'Microsoft.WindowsNotepad.8wekyb3d8bbwe'
)

$chosen = $null
foreach ($progid in $progids) {
    Write-Host ""
    Write-Host "=== Trying SetUserChoice .txt = $progid ==="
    try {
        $ret = [UC]::SetUserChoice('.txt', 0, $progid)
        Write-Host "  SetUserChoice returned: $ret (0 = success)"
        if ($ret -eq 0) {
            $chosen = $progid
            break
        }
    } catch {
        Write-Host "  Exception: $($_.Exception.Message)"
    }
}

# Notify shell of change
[UC]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
Write-Host ""
Write-Host "Shell notified of change"

# Verify
Write-Host ""
Write-Host "=== Verify UserChoice ==="
$uc = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.txt\UserChoice' -ErrorAction SilentlyContinue
Write-Host "  ProgId = $($uc.Progid)"
Write-Host "  Hash   = $($uc.Hash)"

# Test
Write-Host ""
Write-Host "=== Test: open .txt file ==="
$testTxt = "C:\Users\nguye\Desktop\_usertest_$(Get-Random).txt"
"hello after SetUserChoice" | Out-File $testTxt -Encoding UTF8
Start-Sleep -Seconds 2
try {
    $p = Start-Process -FilePath $testTxt -PassThru -ErrorAction Stop
    Write-Host "  OK PID=$($p.Id)  ProcessName=$($p.ProcessName)" -ForegroundColor Green
    Start-Sleep -Seconds 1
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
} catch {
    Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
}
Remove-Item $testTxt -Force -ErrorAction SilentlyContinue