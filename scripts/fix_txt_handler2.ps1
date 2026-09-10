# Fix .txt association - try multiple approaches

$ErrorActionPreference = 'Continue'

Write-Host "=== Check all relevant ProgIDs ==="
$progids = @(
    'txtfile',
    'txtfilelegacy',
    'Applications\notepad.exe',
    'Microsoft.WindowsNotepad.8wekyb3d8bbwe'
)
foreach ($p in $progids) {
    $cmd = cmd /c "ftype `"$p`"" 2>&1
    Write-Host "  $p => $cmd"
    Write-Host ""
}

Write-Host "=== HKEY_CLASSES_ROOT check ==="
# What extensions are registered in HKCR?
Get-ChildItem 'HKLM:\Software\Classes' -ErrorAction SilentlyContinue |
    Where-Object { $_.PSChildName -match '^(txt|notepad|Text)' } |
    ForEach-Object { Write-Host "  HKLM:\Software\Classes\$($_.PSChildName)" }

Get-ChildItem 'HKCU:\Software\Classes' -ErrorAction SilentlyContinue |
    Where-Object { $_.PSChildName -match '^(txt|notepad|Text)' } |
    ForEach-Object { Write-Host "  HKCU:\Software\Classes\$($_.PSChildName)" }

Write-Host ""
Write-Host "=== Try: set assoc to txtfilelegacy ==="
cmd /c "assoc .txt=txtfilelegacy" 2>&1
cmd /c "ftype txtfilelegacy" 2>&1

Write-Host ""
Write-Host "=== Try: set UserChoice to Applications\\notepad.exe ==="
$ucPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.txt'
if (Test-Path $ucPath) {
    # Remove existing UserChoice
    Remove-Item "$ucPath\UserChoice" -Recurse -Force -ErrorAction SilentlyContinue
    # Set to Applications\notepad.exe
    New-Item -Path "$ucPath\UserChoice" -Force | Out-Null
    Set-ItemProperty -Path "$ucPath\UserChoice" -Name 'ProgId' -Value 'Applications\notepad.exe'
    Write-Host "  Set UserChoice Progid = Applications\notepad.exe"
}

# Notify shell
$signature = @'
[DllImport("shell32.dll", CharSet=CharSet.Auto)]
public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
'@
try {
    Add-Type -MemberDefinition $signature -Name "Shell32" -Namespace "Win32" -ErrorAction SilentlyContinue
    [Win32.Shell32]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
    Write-Host "  Shell notified"
} catch { Write-Host "  $($_.Exception.Message)" }

# Test
Write-Host ""
Write-Host "=== Test 1: Direct notepad.exe launch (no file) ==="
try {
    $p = Start-Process -FilePath "C:\Windows\System32\notepad.exe" -PassThru -ErrorAction Stop
    Write-Host "  OK PID=$($p.Id)" -ForegroundColor Green
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
} catch {
    Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "=== Test 2: Open .txt file (now with new assoc) ==="
$testTxt = "C:\Users\nguye\Desktop\_verify_fix_$(Get-Random).txt"
"hi" | Out-File $testTxt -Encoding UTF8
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

Write-Host ""
Write-Host "=== Test 3: cmd start notepad ==="
try {
    $p = Start-Process -FilePath cmd.exe -ArgumentList "/c","start","notepad.exe" -PassThru -NoNewWindow -ErrorAction Stop
    Write-Host "  cmd start returned PID=$($p.Id)" -ForegroundColor Green
    Start-Sleep -Seconds 2
    Get-Process notepad -ErrorAction SilentlyContinue | Stop-Process -Force
} catch {
    Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
}