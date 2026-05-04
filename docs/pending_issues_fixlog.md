# Pending Issues Fix Log

> **Last Updated:** 2026-04-21
> **Status:** 4 Fixed, 2 Pending

---

## Issue 1: PTZ Position Tracking REMOVED ✅ FIXED

### Decision
After investigation, user decided to **remove position tracking entirely** and use **hardware presets only**. Camera does not expose absolute position API (all queries return "Not Supported").

### Problem
- Position tracking (relative system) was causing confusion
- Server tracked "seconds of button press" from origin, but camera stored absolute positions
- Drift occurred when server position didn't match actual camera position

### Solution
**Use only hardware presets** - camera stores exact absolute position internally:
- `set_preset(N, name)` → saves current position to hardware preset N
- `goto_preset(N)` → moves camera to hardware preset N position
- Position tracking code removed from ptz_controller.py

### Files Modified
- `src/cameras/ptz/ptz_controller.py` - removed PositionTracker class, simplified goto_preset()
- `src/server/routes/ptz.py` - get_ptz_position() returns "not supported"
- `src/server/routes/preset_automation.py` - save_preset_position() uses hardware set_preset()
- `src/cameras/preset_service.py` - _execute_ptz() uses hardware goto_preset()
- `src/server/templates/stream_view.html` - updated to use /ptz/presets endpoints

---

## Issue 2: Bats Auto-stop Timer ✅ FIXED (Partial)

### Problem
Auto-stop timer (210 seconds) for bats was not working - the timer callback was failing due to async/threading conflicts with the database connection pool.

### Root Cause
The `_auto_stop()` timer callback was using `asyncio.run()` to call the async `_stop()` method which uses `asyncpg` database operations. When `asyncio.run()` creates a new event loop, the database connection pool (which was created in the main event loop) couldn't be used, causing "connection was closed in the middle of operation" errors.

### Fix Applied

**File:** `src/iot/bat_service.py`

Simplified `_schedule_stop()` to only do synchronous MQTT OFF commands in the timer callback:
```python
def _schedule_stop(self, bat_id: int, delay_seconds: float):
    def _auto_stop():
        try:
            with self._lock:
                active = self._active_movements.get(bat_id)
                if not active:
                    return
                # Get relay info...
                self._active_movements.pop(bat_id, None)

            # Turn OFF both relays (sync operation)
            mqtt_client.send_relay_command(device_topic, active_channel, "off")
            mqtt_client.send_relay_command(device_topic, inactive_channel, "off")
        except Exception as e:
            logger.error(f"Bat {bat_id} auto-stop error: {e}")
```

### Test Result
```
POST /api/bats/1/up (timeout=5s) → Started
After 7s → moving_state: stopped ✅ (relays OFF)
```

### Note
Database updates (position in bats table, duration in bat_logs) are not updated during auto-stop due to async/threading limitations. The position field in the API response may show stale values until the next manual stop command. However, the core safety feature (turning off relays) works correctly.

### Files Modified
- `src/iot/bat_service.py`

---

## Issue 3: Bats Safety Lock ✅ FIXED

### Problem
Safety lock (cannot send UP while DOWN is active, and vice versa) was NOT implemented - the code allowed opposite direction commands while bat was moving.

### Root Cause
The `_move()` method in `bat_service.py` did not check if the bat was already moving in the opposite direction before starting a new move.

### Fix Applied

**File:** `src/iot/bat_service.py`

Added safety check in `_move()` method:
```python
# Safety: Check if bat is currently moving in opposite direction
with self._lock:
    current_move = self._active_movements.get(bat_id)
    if current_move and current_move.get('direction') != direction:
        return {"ok": False, "message": f"Safety: bat is moving {current_move['direction']}, cannot move {direction}. Stop first."}
```

### Test Results
```
# Test 1: Move UP then try DOWN
POST /api/bats/1/up → {"ok":true,"direction":"up"...}
POST /api/bats/1/down → {"detail":"Safety: bat is moving up, cannot move down. Stop first."} ✅

# Test 2: Move DOWN then try UP
POST /api/bats/1/stop → {"ok":true...}
POST /api/bats/1/down → {"ok":true,"direction":"down"...}
POST /api/bats/1/up → {"detail":"Safety: bat is moving down, cannot move up. Stop first."} ✅
```

### Files Modified
- `src/iot/bat_service.py`

---

## Issue 4: iOS Push Notifications 🔲 PENDING

### Problem
iOS Safari does not support WebPush notifications.

### Required for iOS
- Firebase Cloud Messaging (FCM) integration
- iOS Push Certificate setup
- PWA for iOS Safari support (if possible)

### Status
Not started.

---

## Issue 5: LAN/Cloud Auto-detect 🔲 PENDING

### Problem
Webapp should auto-detect if user is on LAN (connect directly) vs Cloud (connect via internet).

### Status
Not started.

### Implementation Notes
- Check `window.location.hostname` vs known LAN ranges
- Or use explicit config in `settings.local.json`

---

## Issue 6: Offline Capability 🔲 PENDING

### Problem
Service Worker not fully implemented for offline use.

### Status
Not started.

### Implementation Notes
- `static/sw.js` exists but may not handle all cases
- Need to cache API responses for offline viewing
- Need to queue commands when offline

---

## Changelog

### 2026-04-21
- ✅ Fixed Issue 1: PTZ Position Tracking REMOVED
  - Removed PositionTracker class and relative position tracking
  - Now uses hardware presets only (absolute position stored in camera)
  - Updated ptz_controller.py, preset_automation.py, preset_service.py
  - Updated stream_view.html to use /ptz/presets endpoints
- ✅ Fixed Issue 3: Bats Safety Lock
  - Added safety check in `_move()` to prevent opposite direction while moving
- ✅ Fixed Issue 2: Bats Auto-stop Timer (Partial)
  - MQTT relay OFF works correctly after timeout
  - Database updates skipped due to async/threading limitations
- ✅ Fixed: presets-v2 500 errors
  - `preset_automation.py:save_preset_position` called `get_relative_position()` which no longer exists
  - Fixed to use hardware `set_preset()` instead
  - `preset_service.py:_execute_ptz` called `goto_preset(0, pan, tilt)` with old 3-arg signature
  - Fixed to use hardware `goto_preset(preset_number)` only
  - Added `preset_number` to config in `get_preset_by_id()`
