' ============================================================
' CFarm Guardian - Silent Launcher
' ============================================================
' Runs a .bat file in a HIDDEN cmd window (no console flash).
' Use this from shell:startup shortcut, Task Scheduler, or
' anywhere you'd otherwise call a .bat directly and see a
' black console window appear briefly.
'
' Usage:
'   wscript.exe run_silent.vbs "<path-to-bat>"
'   wscript.exe run_silent.vbs "E:\cfarm\scripts\start_guardian.bat"
' ============================================================

If WScript.Arguments.Count < 1 Then
    WScript.Echo "Usage: run_silent.vbs <path-to-bat> [args...]"
    WScript.Quit 1
End If

Dim batPath
batPath = WScript.Arguments(0)

' Build the rest of the arguments into a single string
Dim argStr
argStr = ""
Dim i
For i = 1 To WScript.Arguments.Count - 1
    argStr = argStr & " """ & WScript.Arguments(i) & """"
Next

' Use WshShell.Run with WindowStyle=0 (HIDDEN) and bWaitOnReturn=False
' so we don't block and the child gets its own process group.
Dim shell
Set shell = CreateObject("WScript.Shell")

' 0 = hidden window
' False = don't wait for completion (return immediately)
shell.Run """" & batPath & """ " & argStr, 0, False
