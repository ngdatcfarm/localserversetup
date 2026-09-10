# Diagnose and fix the AppX Notepad issue

$ErrorActionPreference = 'Continue'

Write-Host "=== A. Check AppX Notepad status ==="
$appx = Get-AppxPackage -AllUsers -Name "Microsoft.WindowsNotepad" -ErrorAction SilentlyContinue
if ($appx) {
    $appx | Format-List Name, PackageFullName, InstallLocation, Status, SignatureKind | Out-String | Write-Host
} else {
    Write-Host "  Microsoft.WindowsNotepad NOT installed"
}

Write-Host ""
Write-Host "=== B. All AppX packages with 'Notepad' or 'txt' in name ==="
Get-AppxPackage -AllUsers -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match 'Notepad|txt' } |
    Select-Object Name, PackageFullName, Status |
    Format-Table -AutoSize -Wrap

Write-Host ""
Write-Host "=== C. Check current effective .txt handler in registry ==="
# Windows usually locks UserChoice, but the underlying association is in HKCR
$ext = Get-ItemProperty 'HKCR:\.txt' -ErrorAction SilentlyContinue
Write-Host "  HKCR\.txt default: $($ext.'(default)')"

# Check both user and machine classes
$extLM = Get-ItemProperty 'Registry::HKEY_LOCAL_MACHINE\Software\Classes\.txt' -ErrorAction SilentlyContinue
Write-Host "  HKLM\..\Classes\.txt default: $($extLM.'(default)')"

Write-Host ""
Write-Host "=== D. Check WindowsApps Notepad (the actual .exe inside AppX) ==="
$appxPath = "C:\Program Files\WindowsApps\Microsoft.WindowsNotepad*"
Get-ChildItem $appxPath -ErrorAction SilentlyContinue |
    ForEach-Object {
        Write-Host "  AppX dir: $($_.FullName)"
        Get-ChildItem $_.FullName -Recurse -Filter "Notepad.exe" -ErrorAction SilentlyContinue |
            ForEach-Object { Write-Host "    Notepad.exe: $($_.FullName)  Size=$($_.Length)" }
    }

Write-Host ""
Write-Host "=== E. Is current user admin? ==="
$id = [Security.Principal.WindowsIdentity]::GetCurrent()
$pr = New-Object Security.Principal.WindowsPrincipal($id)
$isAdmin = $pr.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "  Current user admin: $isAdmin"

Write-Host ""
Write-Host "=== F. Test: just use 'type' command to view file (alternative to opening) ==="
$testTxt = "C:\Users\nguye\Desktop\_type_test_$(Get-Random).txt"
"hello" | Out-File $testTxt -Encoding UTF8
$out = cmd /c "type `"$testTxt`"" 2>&1
Write-Host "  cmd type: $out" -ForegroundColor Green
Remove-Item $testTxt -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== G. Try to reinstall Notepad AppX (admin) ==="
if ($isAdmin) {
    try {
        Add-AppxPackage -DisableDevelopmentMode -Register "C:\Program Files\WindowsApps\Microsoft.WindowsNotepad*\AppXManifest.xml" -ErrorAction Stop
        Write-Host "  Re-registered Notepad" -ForegroundColor Green
    } catch {
        Write-Host "  Reinstall failed: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "  Skipped (not admin)"
}

Write-Host ""
Write-Host "=== H. List available handlers for .txt ==="
# OpenWithProgids
$oPath = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.txt\OpenWithProgids'
if (Test-Path $oPath) {
    $props = Get-ItemProperty $oPath -ErrorAction SilentlyContinue
    $props.PSObject.Properties | Where-Object { $_.Name -notmatch '^PS' -and $_.Value -ne 0 } |
        ForEach-Object { Write-Host "  OpenWithProgid: $($_.Name)" }
}

Write-Host ""
Write-Host "=== I. Set UserChoice via .DEFAULT (system-wide) - usually requires admin ==="
# If admin, write UserChoice
$defPath = 'Registry::HKEY_USERS\.DEFAULT\Software\Microsoft\Windows\CurrentVersion\Explorer\FileExts\.txt'
if (Test-Path $defPath) {
    Write-Host "  .DEFAULT .txt exists"
} else {
    Write-Host "  .DEFAULT .txt missing"
}

Write-Host ""
Write-Host "=== J. Try to launch AppX Notepad directly ==="
# Find the AppX Notepad's actual exe
$appxDirs = Get-ChildItem "C:\Program Files\WindowsApps\Microsoft.WindowsNotepad*" -ErrorAction SilentlyContinue
foreach ($d in $appxDirs) {
    $exe = Get-ChildItem $d.FullName -Recurse -Filter "Notepad.exe" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($exe) {
        Write-Host "  Trying: $($exe.FullName)"
        try {
            $p = Start-Process -FilePath $exe.FullName -PassThru -ErrorAction Stop
            Write-Host "  OK PID=$($p.Id)" -ForegroundColor Green
            Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Host "  FAIL: $($_.Exception.Message)" -ForegroundColor Red
        }
        break
    }
}