# Fix .txt file association - bypass broken AppX Notepad, use Win32 notepad.exe

$ErrorActionPreference = 'Stop'

# Current broken state:
$current = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.txt\UserChoice' -ErrorAction SilentlyContinue
Write-Host "Current UserChoice Progid: $($current.Progid)"
Write-Host ""

# Strategy 1: Set UserChoice to a ProgID that points to notepad.exe
# We use "Applications\notepad.exe" which is a built-in shell ProgID for notepad
# Or create a custom one with OpenWithProgids

# The most reliable fix: use the legacy ProgID "txtfile" with ftype mapping
Write-Host "=== Strategy 1: Set ftype txtfile + assoc ==="
cmd /c "ftype txtfile=`"%SystemRoot%\system32\notepad.exe`" `%1`"" 2>&1
cmd /c "assoc .txt=txtfile" 2>&1

# Verify
Write-Host ""
Write-Host "=== Verify ==="
$assoc = cmd /c "assoc .txt" 2>&1
$ftype = cmd /c "ftype txtfile" 2>&1
Write-Host "assoc: $assoc"
Write-Host "ftype: $ftype"

# Also remove the broken UserChoice so assoc/ftype can take effect
Write-Host ""
Write-Host "=== Remove broken UserChoice ==="
$ucPath = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.txt\UserChoice'
if (Test-Path $ucPath) {
    Remove-Item $ucPath -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "  Removed UserChoice"
} else {
    Write-Host "  (no UserChoice)"
}

# Notify shell of change
Write-Host ""
Write-Host "=== Notify shell ==="
$signature = @'
[DllImport("shell32.dll", CharSet=CharSet.Auto)]
public static extern void SHChangeNotify(uint wEventId, uint uFlags, IntPtr dwItem1, IntPtr dwItem2);
'@
try {
    Add-Type -MemberDefinition $signature -Name "Shell32" -Namespace "Win32"
    [Win32.Shell32]::SHChangeNotify(0x08000000, 0, [IntPtr]::Zero, [IntPtr]::Zero)
    Write-Host "  SHChangeNotify sent"
} catch {
    Write-Host "  $($_.Exception.Message)"
}

# Final verification - try to open a .txt file
Write-Host ""
Write-Host "=== Final test: open a .txt file ==="
$testTxt = "C:\Users\nguye\Desktop\_final_test_$(Get-Random).txt"
"hello after fix" | Out-File $testTxt -Encoding UTF8
Start-Sleep -Seconds 2
try {
    $p = Start-Process -FilePath $testTxt -PassThru -ErrorAction Stop
    Write-Host "  OK PID=$($p.Id)  ProcessName=$($p.ProcessName)" -ForegroundColor Green
    Start-Sleep -Seconds 2
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
} catch {
    Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
}
Remove-Item $testTxt -Force -ErrorAction SilentlyContinue