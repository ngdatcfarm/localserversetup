# Camera Server Project - Memory

## Mục tiêu dự án
Xây dựng local server để:
- **Đọc**: Thu thập hình ảnh từ các camera IP trong mạng LAN
- **Ghi**: Lưu trữ hình ảnh, snapshots, recordings
- **Phân phối**: Stream hình ảnh đến các thiết bị di động trong LAN với định dạng tương thích

## Công nghệ đã chọn
- **Backend**: Python FastAPI 0.109.0 + Uvicorn 0.27.0
- **Frontend**: HTML + TailwindCSS (CDN) + Vanilla JS + Font Awesome icons
- **Data Models**: Pydantic 2.5.3
- **Config Storage**: YAML (PyYAML 6.0.1)
- **Video Capture**: OpenCV 4.9.0.80 (opencv-contrib-python)
- **Streaming**: MJPEG (done), HLS (planned)
- **Protocol**: RTSP cho camera IP
- **GPU**: NVDEC decode, CUDA resize (auto-fallback to CPU)
- **PTZ Control**: Uniview LAPI qua HTTP (httpx 0.27.0)
- **Templates**: Jinja2 3.1.3

## Cấu trúc thư mục chi tiết

```
localserversetup/
├── requirements.txt              # Python dependencies
├── config/
│   └── cameras.yaml              # Camera + server + storage config (YAML)
├── memory/
│   ├── MEMORY.md                 # File này - project memory
│   └── ip-camera-research.md     # Nghiên cứu về camera IP protocols
├── src/
│   ├── models/
│   │   ├── __init__.py           # Exports: CameraConfig, CameraStatus
│   │   └── camera.py             # Pydantic models
│   ├── cameras/
│   │   ├── capture/
│   │   │   ├── __init__.py       # Exports: RTSPClient, test_connection, StreamStats, CameraManager, camera_manager
│   │   │   ├── rtsp_client.py    # RTSP client (NVDEC GPU + CPU fallback)
│   │   │   └── camera_manager.py # Multi-camera orchestration (singleton)
│   │   ├── stream/
│   │   │   ├── __init__.py
│   │   │   └── mjpeg_stream.py   # MJPEG streaming (async) + stream routes
│   │   ├── ptz/
│   │   │   ├── __init__.py
│   │   │   └── ptz_controller.py # PTZ control qua Uniview LAPI
│   │   └── config/
│   │       └── __init__.py
│   ├── services/
│   │   ├── storage/
│   │   │   ├── __init__.py       # Exports: ConfigService
│   │   │   └── config_service.py # YAML config CRUD service
│   │   ├── analysis/
│   │   │   └── __init__.py       # Placeholder - future AI analysis
│   │   └── scheduler/
│   │       └── __init__.py       # Placeholder - future scheduling
│   ├── server/
│   │   ├── __init__.py
│   │   ├── main.py               # FastAPI app, startup/shutdown lifecycle
│   │   ├── routes/
│   │   │   ├── __init__.py       # Exports: cameras_router, ptz_router
│   │   │   ├── cameras.py        # Camera CRUD + control API
│   │   │   └── ptz.py            # PTZ control API
│   │   └── templates/
│   │       ├── index.html        # Dashboard UI (camera grid, add/edit modal)
│   │       └── stream_view.html  # Stream viewer (fullscreen + PTZ joystick)
│   ├── api/
│   │   ├── cloud/
│   │   │   └── __init__.py       # Placeholder - cloud API
│   │   └── internal/
│   │       └── __init__.py       # Placeholder - internal API
│   └── utils/
│       └── __init__.py           # Placeholder - utilities
├── data/                          # (planned)
│   ├── exports/
│   ├── recordings/
│   └── snapshots/
├── static/                        # (planned) Static files
├── logs/                          # (planned) Application logs
└── cache/                         # (planned) Cache storage
```

## Kiến trúc hệ thống

### Application Flow
```
Startup (main.py):
  1. setup_mjpeg() → đăng ký frame callback với camera_manager
  2. ConfigService load cameras.yaml
  3. camera_manager.add_camera() cho mỗi camera enabled
     → RTSPClient connect (NVDEC → CPU fallback)
     → Background thread _read_loop()

Frame Pipeline:
  RTSPClient._read_loop()
    → _read_frame() [GPU hoặc CPU]
    → cache _latest_frame
    → update FPS stats
    → on_frame callback
      → camera_manager._dispatch_frame()
        → on_camera_frame() [mjpeg_stream.py]
          → frame_to_jpeg() encode JPEG (quality=85)
          → cache trong _frames_cache[camera_id]
          → signal asyncio.Event

MJPEG Streaming:
  Client GET /stream/{id}/mjpeg
    → generate_mjpeg() async generator
    → await asyncio.Event (2s timeout)
    → yield multipart MJPEG boundary + JPEG frame

PTZ Control:
  Client POST /api/cameras/{id}/ptz/move
    → PTZController._send_command()
    → HTTP PUT to camera LAPI endpoint
    → Digest auth (fallback Basic)
```

### Key Design Patterns
- **Singleton**: `camera_manager` = module-level CameraManager instance
- **Observer/Callback**: Frame callbacks registered qua `add_frame_callback()`
- **Async Generator**: MJPEG streaming dùng `asyncio.Event` (non-blocking)
- **Auto-fallback**: GPU → CPU transparent fallback
- **Auto-reconnect**: 30 frame failures → reconnect (5s interval)
- **Thread-safe**: `threading.Lock` cho shared state

## Key Classes

### CameraConfig (src/models/camera.py)
- Pydantic model: id, name, ip, port(554), username, password, rtsp_path, enabled, stream_type
- Property `rtsp_url`: tạo full RTSP URL với URL-encoded password

### CameraStatus (src/models/camera.py)
- Fields: id, online, fps, resolution(tuple), last_frame(timestamp), error

### RTSPClient (src/cameras/capture/rtsp_client.py)
- RTSP stream capture với GPU acceleration
- `connect()`: try NVDEC → fallback CPU (FFmpeg backend)
- `_read_loop()`: background thread đọc frame liên tục
- `get_latest_frame()`: non-blocking access cached frame
- Auto-detect GPU: `cv2.cuda.getCudaEnabledDeviceCount()`

### StreamStats (src/cameras/capture/rtsp_client.py)
- Dataclass: fps, frame_count, bytes_read, connected, error, decode_method("cpu"/"nvdec"), width, height

### CameraManager (src/cameras/capture/camera_manager.py)
- Singleton quản lý tất cả cameras
- `add_camera()`, `remove_camera()`, `start_camera()`, `stop_camera()`
- `add_frame_callback()`: đăng ký callback cho frame events
- `get_status()`, `get_all_status()`: trạng thái runtime

### PTZController (src/cameras/ptz/ptz_controller.py)
- Uniview LAPI HTTP control
- `move(direction, speed)`, `stop(direction)`
- Directions: up, down, left, right (IntEnum PTZCommand)
- Auth: Digest first → Basic fallback
- **Relative Position Tracking**: Server track vị trí tương đối (tính bằng giây giữ nút)
- **PositionTracker**: Class quản lý relative position (pan, tilt)
- **Tare**: Đặt vị trí hiện tại làm gốc tọa độ (0,0)
- **Auto-tare**: Khi camera offline rồi online, sau 30s sẽ auto-tare

### ConfigService (src/services/storage/config_service.py)
- YAML config CRUD
- `get_cameras()`, `add_camera()`, `update_camera()`, `delete_camera()`
- Auto-create default config nếu file chưa tồn tại

## API Endpoints

### Camera Management
| Method | Path | Mô tả |
|--------|------|--------|
| GET | /api/cameras | List all cameras |
| POST | /api/cameras | Add camera (201) |
| GET | /api/cameras/{id} | Get camera config |
| PUT | /api/cameras/{id} | Update camera |
| DELETE | /api/cameras/{id} | Delete camera (204) |
| POST | /api/cameras/{id}/start | Start stream |
| POST | /api/cameras/{id}/stop | Stop stream |
| GET | /api/cameras/{id}/test | Test RTSP connection |
| GET | /api/cameras/{id}/status | Camera status (fps, resolution, decode_method) |
| GET | /api/cameras/status/all | All cameras status |

### PTZ Control
| Method | Path | Body | Mô tả |
|--------|------|------|--------|
| POST | /api/cameras/{id}/ptz/move | {direction, speed} | Start PTZ movement (gửi liên tục mỗi 0.5s để đếm giây) |
| POST | /api/cameras/{id}/ptz/stop | {direction, speed} | Stop PTZ movement |
| GET | /api/cameras/{id}/ptz/position | - | Lấy vị trí tương đối (pan, tilt) |
| POST | /api/cameras/{id}/ptz/tare | - | Đặt vị trí hiện tại làm gốc tọa độ |
| POST | /api/cameras/{id}/ptz/presets/{n}/set | {name} | Lưu preset (relative position) |
| POST | /api/cameras/{id}/ptz/presets/{n}/goto | - | Di chuyển đến preset (relative position) |

### Streaming
| Method | Path | Mô tả |
|--------|------|--------|
| GET | /stream/{id} | Stream viewer page (stream_view.html) |
| GET | /stream/{id}/mjpeg | Raw MJPEG stream (multipart/x-mixed-replace) |
| GET | /stream/{id}/snapshot | Single JPEG snapshot |

### System
| Method | Path | Mô tả |
|--------|------|--------|
| GET | / | Dashboard (index.html) |
| GET | /health | Health check |

## Web UI

### Dashboard (index.html)
- Dark theme (bg-gray-900), blue accents
- Header: camera count + "Add Camera" button
- Stats row: Total / Online / Offline counts
- Camera grid: responsive (1/2/3 cols)
- Camera cards: thumbnail, LIVE/OFF badge, FPS counter, edit/delete
- Bottom sheet modal: add/edit camera form
- Toast notifications (auto-hide 3s)
- Polling: cập nhật status mỗi 3 giây
- Mobile: FAB button, horizontally scrollable stats

### Stream Viewer (stream_view.html)
- Fullscreen stream viewer
- PTZ joystick ring (up/down/left/right) + speed slider (1-10)
- Auto-hide UI (5s inactivity, tap to toggle)
- Keyboard support (arrow keys)
- Touch + Mouse support
- Offline state: camera icon + retry button
- Glassmorphism controls (backdrop-blur)

## GPU Acceleration (v0.2.0)
- **NVDEC**: Hardware decode RTSP H.264/H.265 qua `cv2.cudacodec.VideoReader`
- **CUDA resize**: `cv2.cuda.resize` cho frame processing
- **Auto-fallback**: Tự động dùng CPU nếu GPU không khả dụng
- **Detection**: `cv2.cuda.getCudaEnabledDeviceCount()` + check `cv2.cudacodec` module
- **Yêu cầu**: `opencv-contrib-python` build với CUDA, hoặc build OpenCV from source `-D WITH_CUDA=ON`
- **GTX 1650**: Hỗ trợ NVDEC (decode) + NVENC (encode)

## Tiến trình

### Đã hoàn thành ✅
- [x] Tạo cấu trúc thư mục (2026-03-22)
- [x] Tạo dashboard + camera config UI (2026-03-22)
- [x] Triển khai camera capture service (2026-03-22)
- [x] Triển khai API endpoints (2026-03-22)
- [x] Triển khai web UI (2026-03-22)
- [x] GPU acceleration NVDEC/CUDA (2026-03-23)
- [x] Fix callback architecture (2026-03-23)
- [x] Fix async MJPEG streaming (2026-03-23)
- [x] Fix bugs & code cleanup (2026-03-23)
- [x] PTZ control (Uniview LAPI) (2026-03-23)
- [x] Stream viewer page với PTZ joystick (2026-03-23)

### Chưa làm ⏳
- [ ] Triển khai HLS streaming
- [ ] Triển khai storage service (snapshot/recording)
- [ ] ONVIF camera discovery
- [ ] Cloud API integration
- [ ] Analytics/AI analysis module
- [ ] Task scheduling

### Đang phát triển 🚧
- [x] Relative Position PTZ (2026-03-24) - Hệ tọa độ tự tạo tính bằng giây giữ nút
- [x] Preset với UNV LAPI (2026-03-24) - Hardware preset hoạt động!
- [x] Tare/Rectify function (2026-03-24) - Đặt gốc tọa độ qua PUT /LAPI/V1.0/Channels/0/PTZ/Rectify
- [x] Auto-tare khi camera online (2026-03-24) - Tự động tare sau 30s khi camera reconnect

## Changelog

### v0.3.0 (2026-03-24)
1. **ptz_controller.py**: Thêm Relative Position Tracking - server đếm số giây giữ nút để tạo hệ tọa độ
2. **PositionTracker**: Class mới track vị trí tương đối (pan, tilt tính bằng giây)
3. **config_service.py**: Cập nhật set_preset lưu thêm pan/tilt
4. **routes/ptz.py**: Thêm API /ptz/tare, /ptz/position, cập nhật preset APIs dùng relative position
5. **camera_manager.py**: Thêm auto-tare khi camera reconnect
6. **stream_view.html**: Thêm nút Tare, Crosshairs, cập nhật PTZ gửi liên tục mỗi 0.5s

### v0.2.0 (2026-03-23)
1. **rtsp_client.py**: NVDEC hardware decode, CUDA resize, auto-fallback CPU, latest frame cache
2. **camera_manager.py**: Clean callback architecture với `add_frame_callback()`, expose `decode_method` + `resolution` in status
3. **mjpeg_stream.py**: Async generator dùng `asyncio.Event` thay vì `time.sleep`, centralized frame callback
4. **main.py**: Fix duplicate import, đúng startup order (register callback → start cameras)
5. **routes/cameras.py**: Fix wrong camera existence check, remove unused imports, proper error responses
6. **ptz_controller.py**: NEW - Uniview LAPI PTZ control
7. **routes/ptz.py**: NEW - PTZ API endpoints
8. **stream_view.html**: NEW - Fullscreen stream viewer với PTZ joystick

### v0.1.0 (2026-03-22)
- Initial project structure
- Camera config model (Pydantic)
- RTSP client (CPU only)
- Camera manager
- MJPEG streaming
- Config service (YAML CRUD)
- Dashboard UI
- Camera management API

## Hardware specs (Local Server)

| Component | Spec |
|-----------|------|
| CPU | Intel Core i7 9700 |
| GPU | NVIDIA GTX 1650 |
| RAM | 24GB |
| Storage | 100GB SSD (free), 500GB HDD (free) |

## Camera đã test
- **Brand**: UNV (Uniview)
- **IP**: 192.168.1.27
- **HTTP Port**: 80
- **RTSP Port**: 554
- **Username**: admin / **Password**: Abc@@1234
- **RTSP Path**: /unicast/c1/s0/live
- **Full URL**: `rtsp://admin:Abc@@1234@192.168.1.27:554/unicast/c1/s0/live`
- **Resolution**: 2304x1296 (2K)
- **FPS**: 15-16 fps
- **PTZ**: ✅ Move/Stop hoạt động, Relative Position tracking hoạt động, Preset đang test
- **Status**: ✅ Connected & Streaming

## Cách chạy
```bash
cd /path/to/localserversetup
pip install -r requirements.txt
python -m uvicorn src.server.main:app --host 0.0.0.0 --port 8000
```
Truy cập: http://localhost:8000

---

# CFarm Local Server - IoT Project

## ESP32 Device Connection Issues (2026-04-02)

### Vấn đề ban đầu
ESP32 hiển thị:
```
[HEARTBEAT] Local MQTT not connected!
[HEARTBEAT] Cloud publish: FAILED
Connecting to LOCAL MQTT... FAILED rc=-2
```

### Root Causes
1. **Mosquitto chỉ bind localhost**: Windows Mosquitto service mặc định bind 127.0.0.1:1883, không thể truy cập từ LAN (192.168.1.x)
2. **Thiếu password file**: ESP32 firmware dùng username `cfarm_device` nhưng Windows Mosquitto không có password file

### Giải pháp

**Bước 1:** Tạo config file mới với bind all interfaces
```conf
# mosquitto_fixed.conf
listener 1883 0.0.0.0
allow_anonymous true
acl_file E:\Local-server\docker\mosquitto\config\acl
password_file E:\Local-server\docker\mosquitto\config\passwd
```

**Bước 2:** Tạo password file cho ESP32 devices
```bash
"C:\Program Files\Mosquitto\mosquitto_passwd.exe" -c -b "E:\Local-server\docker\mosquitto\config\passwd" cfarm_device cfarm_device_2026
```

**Bước 3:** Restart Mosquitto service với config mới

### Files đã tạo/sửa
- `E:\Local-server\docker\mosquitto\config\mosquitto_fixed.conf` - Config mới
- `E:\Local-server\docker\mosquitto\config\passwd` - Password file (user: cfarm_device)
- `E:\Local-server\fix_mosquitto.bat` - Script fix nhanh

### Kết quả sau fix
```
Connecting to LOCAL MQTT... OK
Subscribed to: cfarm/esp32-01/cmd
[HEARTBEAT] Local publish: OK hoặc FAILED (còn tùy)
[HEARTBEAT] Cloud publish: FAILED (cloud broker credentials có thể sai)
```

### Cloud MQTT
- Cloud broker: 103.166.183.215:1883 (port open)
- Credentials trong firmware: cfarm_server / Abc@@123
- Có thể password không đúng → cần xác nhận

### ESP32 Firmware
- File: `firmware/esp32_relay_8ch_hybrid/esp32_relay_8ch_hybrid.ino`
- Device code: esp32-01
- LOCAL_MQTT_SERVER: 192.168.1.9
- CLOUD_MQTT_SERVER: 103.166.183.215

## Database Device
```sql
-- Device esp32-01 đã tồn tại trong DB
SELECT * FROM devices WHERE device_code = 'esp32-01';
-- id=4, type=relay_8ch, barn_id=6, is_online=FALSE
```

---

## 2026-04-06: Disk Failure & Recovery

### Vấn đề
- Ổ cứng C:\ bị die
- Backup trên GitHub + F:/Backup + E:/Local-server (partial)

### Recovery Steps
1. Clone repo từ GitHub về C:\Local server
2. Copy Docker volumes từ E:/Local-server/docker/db/data (corrupted)
3. Restore Mosquitto password file
4. Clear corrupted DB, reinitialize với scripts/001_create_tables.sql
5. Chạy migrations 002-031 để tạo schema
6. Cập nhật config/cameras.yaml với MQTT credentials
7. Update port từ 8000 → 8002 (port 8000 bị zombie)

### Trạng thái hiện tại (2026-04-07 PM)
```
Server:        port 8002 ✅
Database:      Docker PostgreSQL port 5434, 77 tables
MQTT:          Mosquitto Docker, 3 users (cfarm_server, cfarm_device, cfarm_cloud)
Cloud Sync:    disabled (tạm thời - theo quyết định tập trung local trước)
Cameras:       cam_001 (192.168.1.72), cam_0002 (192.168.1.108)
Care Ops:      ✅ Đã test Feed, Death, Medication, Weight trên cycle 1
```

### Docker PostgreSQL Setup (2026-04-07 PM)
- **Port:** 5434 (port 5432 bị Windows PostgreSQL chiếm)
- **Config:** `config/cameras.yaml` → database.port = 5434
- **Backup:** `docker cp cfarm-db:/var/lib/postgresql/data F:/Backup/cfarm_db`

### Care Operations Test (2026-04-07 PM)
- Farm: farm-test → Barn: barn-01 → Cycle: 1 (Dot 1 - 2026, 3000 con)
- Log Feed: 100kg ✅ | Log Death: -3 con ✅ | Log Medication: 50g ✅ | Log Weight: 2.5kg ✅
- Dashboard: mortality_rate=0.1%, feed_per_bird=33.4g ✅

### Files đã tạo
- `start_server.bat` - Startup script (port 8002)
- `scripts/backup.ps1` - Backup script to F:\Backup\cfarm_backup

### Port 8000 Issue
Port 8000 bị zombie processes từ các lần test trước. Giải pháp:
- Dùng port 8002 tạm thời
- Hoặc reboot máy để clear hoàn toàn

---

## 2026-04-08: Push Notification System

### Kiến trúc
```
Alert Trigger → AlertService._check_alerts()
             → notification_service.send_alert()
             → WebPush to all subscribers
             → Service Worker shows notification
```

### Components
1. **Backend:** `src/server/routes/notifications.py` - Push notification APIs
2. **Service:** `src/iot/notification_service.py` - WebPush via pywebpush
3. **Service Worker:** `static/sw.js` - Handle push events
4. **Frontend:** `static/js/pages/alerts.js` - Tab "Thong bao"

### SSL Certificate
- Self-signed certificate cho LAN: `cert.pem`, `cert.key`
- CN: `cfarm-local`
- Port: **8443** (HTTPS)
- File download: `/cfarm.crt`

### VAPID Configuration
```yaml
push_notifications:
  vapid_public_key: |
    MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEJ2kaoQzRwM9ZbT+CJaPbH01UJTMke7BL7Wdqam78pkkutZ2bzTtp9x+cG+T+NAcZiXFIOc0REHh9wQB/JAWWOA==
  vapid_private_key: |
    MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQgyXbcXCPZW6F4SLns...
```

### Push Notification APIs
| Method | Path | Mô tả |
|--------|------|--------|
| GET | /api/notifications/status | Check readiness |
| GET | /api/notifications/vapid-public-key | Get VAPID key |
| POST | /api/notifications/subscribe | Register subscription |
| POST | /api/notifications/unsubscribe | Remove subscription |
| GET | /api/notifications/subscriptions | List subscriptions |
| POST | /api/notifications/test | Send test notification |

### Server Commands
```bash
# Start với HTTPS
python -m uvicorn src.server.main:app --host 0.0.0.0 --port 8443 --ssl-keyfile cert.key --ssl-certfile cert.pem

# Test notification API
curl https://localhost:8443/api/notifications/status
```

### Platform Support
| Platform | Browser | Certificate | Status |
|----------|---------|-------------|--------|
| Windows | Chrome | Self-signed + Proceed | ✅ Works |
| Windows | Firefox | Self-signed + Accept | ✅ Works |
| Android | Chrome | Self-signed + Import to System | ✅ Works |
| Android | Firefox | Self-signed + Import to System | ✅ Works |
| iPhone | Safari | Cần CA thật (Let's Encrypt) | ❌ Not supported |

### Giải pháp cho iOS
- **Let's Encrypt** (miễn phí) - Cần domain + port 80
- **Firebase Cloud Messaging (FCM)** - Push qua Google, iOS supported
- **PWA** - Vẫn cần CA thật

### Cần làm sau
1. Firebase Cloud Messaging cho iOS
2. PWA Enhancement
3. Let's Encrypt (optional)

---

## Cloud Server (app.cfarm.vn)

### MySQL Credentials
- **User:** cfarm_user
- **Pass:** cfarm_pass
- **Database:** cfarm
- **SSH:** root@103.166.183.215:24700

### Cloud Role
- Remote control via MQTT (cfarm.vn/{device_code}/cmd)
- View synced data from local server
- Push notifications (WebPush)

### Local Server Role (Local Server - C:\Local server)
- Full farm management (barns, cycles, care ops, inventory)
- Direct MQTT control of ESP32 devices
- Database: PostgreSQL on Docker port 5434
