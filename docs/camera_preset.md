# Camera Preset System Documentation

> **Last Updated:** 2026-04-21
> **System Type:** Config-based (System 1) - Lưu trong `cameras.yaml`

---

## 1. Cấu trúc dữ liệu

### 1.1 Config File: `config/cameras.yaml`

```yaml
cameras:
- id: cam_001
  name: Camera cổng
  ip: 192.168.1.72
  port: 554
  username: admin
  password: Abc@@1234
  rtsp_path: /unicast/c1/s0/live
  enabled: true
  stream_type: main

presets:
  cam_001:
  - number: 1
    name: window
    pan: 2
    tilt: -3
  - number: 2
    name: feed
    pan: 5
    tilt: -3
  cam_0002:
  - number: 1
    name: overview
    pan: 0
    tilt: 0
```

### 1.2 Preset Object Structure

```javascript
// Preset object (from config)
{
  number: 1,           // Preset identifier (1-255)
  name: "window",       // Human-readable name
  pan: 2,               // Pan offset (seconds)
  tilt: -3              // Tilt offset (seconds)
}
```

---

## 2. API Endpoints

### 2.1 List Presets
```
GET /api/cameras/{camera_id}/ptz/presets
```

**Response:**
```json
{
  "local": [
    { "number": 1, "name": "window", "pan": 2, "tilt": -3 },
    { "number": 2, "name": "feed", "pan": 5, "tilt": -3 }
  ],
  "hardware": []
}
```

### 2.2 Set Preset (Save Current Position)
```
POST /api/cameras/{camera_id}/ptz/presets/{preset_number}/set
Body: { "name": "preset_name" }
```

**Logic:**
1. Capture current PTZ position from controller
2. Save to config with format: `{number, name, pan, tilt}`

**Response:**
```json
{
  "success": true,
  "preset": { "number": 1, "name": "window", "pan": 2, "tilt": -3 },
  "method": "relative"
}
```

### 2.3 Go To Preset
```
POST /api/cameras/{camera_id}/ptz/presets/{preset_number}/goto
```

**Logic:**
1. Look up preset from config by `number`
2. Get pan/tilt from preset config
3. Call `controller.goto_preset(preset_number, pan, tilt)` with relative position

**Response:**
```json
{
  "success": true,
  "preset_number": 1,
  "method": "relative",
  "target": { "pan": 2, "tilt": -3 }
}
```

### 2.4 Delete Preset
```
DELETE /api/cameras/{camera_id}/ptz/presets/{preset_number}
```

**Logic:**
1. Remove preset with matching `number` from config

**Response:**
```json
{
  "success": true,
  "message": "Preset 1 deleted"
}
```

---

## 3. Related Files

### 3.1 Backend
| File | Purpose |
|------|---------|
| `src/services/storage/config_service.py` | Read/write presets from cameras.yaml |
| `src/cameras/preset_service.py` | Preset CRUD (config-based) |
| `src/server/routes/ptz.py` | PTZ & Preset API endpoints |
| `src/cameras/ptz/ptz_controller.py` | PTZ hardware control |

### 3.2 Frontend
| File | Purpose |
|------|---------|
| `static/js/api.js` | API client for presets |
| `static/js/pages/cameras.js` | Camera management UI |
| `static/js/pages/stream_view.html` | Stream viewer with PTZ |

---

## 4. PTZ Controller

### 4.1 Relative Position System

PTZ uses **relative position** tracking:
- Camera tracks pan/tilt as seconds of button press
- Server maintains `PositionTracker` with current pan/tilt
- Hardware preset NOT used for position storage
- Camera can be "tared" to reset origin

### 4.2 Key Methods

```python
# In ptz_controller.py
async def goto_preset(self, preset_number, pan, tilt):
    """Go to relative position (pan, tilt)."""
    # Sends continuous movement commands for calculated seconds

async def set_preset(self, preset_number, name):
    """Save current relative position to hardware preset."""
    # Sets hardware preset AND returns current position

def get_relative_position():
    """Get current tracked position."""
    return {"pan": 0, "tilt": 0, "mode": "relative"}
```

---

## 5. Flow Diagrams

### 5.1 Save Preset Flow
```
User long-press preset button (2s)
  → cameras.js: savePresetPosition(cam, p)
  → API: POST /ptz/presets/{n}/set {name}
  → routes/ptz.py: set_preset()
  → config_service.set_preset() → cameras.yaml
  → Response: {success, preset: {number, name, pan, tilt}}
```

### 5.2 Go To Preset Flow
```
User click preset button
  → cameras.js: goToPreset(cam, p)
  → API: POST /ptz/presets/{n}/goto
  → routes/ptz.py: goto_preset()
  → Look up pan/tilt from config
  → ptz_controller.goto_preset(preset_number, pan, tilt)
  → Send movement commands to camera
  → Response: {success, target: {pan, tilt}}
```

### 5.3 Load Presets Flow
```
Page load / Refresh
  → cameras.js: loadPresetsForCamera(cam.id)
  → API: GET /ptz/presets
  → routes/ptz.py: get_presets()
  → config_service.get_presets() → cameras.yaml
  → Response: {local: [...], hardware: [...]}
```

---

## 6. Known Issues

- [ ] Need to verify preset_service.py is correctly integrated
- [ ] Need to verify frontend uses correct API endpoints
- [ ] Need to test save/goto/delete operations

---

## 7. Changelog

### 2026-04-21
- Rewrote preset_service.py to use config-based (System 1)
- Updated api.js to use `/ptz/presets` endpoints
- Updated cameras.js to use correct API methods
- Deprecated `/presets-v2` endpoints (database-based)
