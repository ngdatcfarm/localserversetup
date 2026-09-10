# CFarm Guardian - Layer 2 Admin Setup

**This step requires Administrator privileges. Run once.**

## Why Layer 2 matters

The auto-restart stack has 4 layers:

| Layer | Mechanism | Requires admin | When it kicks in |
|---|---|---|---|
| 1     | shell:startup shortcut | No  | User login |
| 1.5   | guardian_watchdog.py  | No  | Always (when PC is on) |
| 1.6   | tunnel_watchdog.py    | No  | Always (when PC is on) |
| **2** | **Task Scheduler `CFarmGuardianAutoStart`** | **Yes** | When watchdog dies unexpectedly |
| 3     | guardian.py self-respawn | No | Inside guardian process |

Layer 1 (startup shortcut) only fires on user login. If the PC is on but the user hasn't logged in yet, or if the user session is in a weird state, Layer 1 doesn't help. **Layer 2 (Task Scheduler) covers this gap** by running every 1 minute via the OS scheduler service — completely independent of the user session.

## Setup steps

1. **Open an elevated Command Prompt**
   - Press `Win + X`
   - Choose "Terminal (Admin)" or "Command Prompt (Admin)"
   - Click "Yes" on the UAC prompt

2. **Run the installer**
   ```bat
   cd E:\cfarm\scripts
   install_task_scheduler.bat
   ```

3. **Verify** the task exists:
   ```powershell
   Get-ScheduledTask -TaskName CFarmGuardianAutoStart | Format-List
   ```
   Expected output should show:
   - State: Ready
   - Principal.UserId: <your-username>
   - Actions[0]: wscript.exe "E:\cfarm\scripts\run_silent.vbs" "E:\cfarm\scripts\start_guardian.bat"

4. **Test** by triggering it manually:
   ```powershell
   Start-ScheduledTask -TaskName CFarmGuardianAutoStart
   ```
   Within ~10 seconds you should see the guardian process appear in Task Manager (look for `pythonw.exe` running guardian.py).

## Troubleshooting

- **"Access is denied"** when registering → You didn't run the elevated cmd as Administrator. Re-open with Win+X → Terminal (Admin).
- **Task registered but never fires** → Check `Get-ScheduledTaskInfo -TaskName CFarmGuardianAutoStart`. Look at `LastTaskResult` — non-zero means it ran but errored. Check `E:\cfarm\logs\guardian.start_wrapper.stderr.log`.
- **Layer 1 (startup shortcut) and Layer 2 both fire on login** → That's expected and harmless. The .bat file checks for existing PIDs before launching, so duplicates are prevented.

## Manual removal (if you ever want to undo)

```powershell
Unregister-ScheduledTask -TaskName CFarmGuardianAutoStart -Confirm:$false
```

The startup shortcut and all watchdog scripts continue to work without Layer 2 — Layer 2 is just an extra safety net for the case where the user is not logged in.