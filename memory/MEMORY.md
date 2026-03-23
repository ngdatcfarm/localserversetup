# Local-server Project

## Mục tiêu dự án
Xây dựng local server để:
- **Đọc**: Thu thập hình ảnh từ các camera IP trong mạng LAN
- **Ghi**: Lưu trữ hình ảnh, snapshots, recordings
- **Phân phối**: Stream hình ảnh đến các thiết bị di động trong LAN với định dạng tương thích

## Thông tin repo
- **GitHub**: https://github.com/ngdatcfarm/localserversetup
- **Thư mục**: E:\Local-server

## Cấu trúc thư mục hiện tại

```
Local-server/
├── src/
│   ├── api/           # API endpoints (cloud, internal)
│   ├── cameras/      # Camera handling (capture, config, stream, ptz)
│   ├── models/       # Data models
│   ├── server/      # Server core (main, routes, templates)
│   ├── services/    # Business logic (analysis, scheduler, storage)
│   └── utils/       # Utilities
├── static/          # Static files (css, images, js)
├── config/          # Configuration files
├── data/
│   ├── exports/     # Exported data
│   ├── recordings/ # Video recordings
│   └── snapshots/  # Image snapshots
├── logs/            # Application logs
├── cache/           # Cache storage
└── memory/          # Project memory
```

## Tiến trình
- [x] Tạo cấu trúc thư mục
- [x] Tạo cấu trúc dashboard + camera config ✅
- [x] Triển khai camera capture service ✅
- [x] GPU acceleration (NVDEC/CUDA) ✅
- [x] Fix callback architecture ✅
- [x] Fix async MJPEG streaming ✅
- [x] Fix bugs & code cleanup ✅
- [x] Triển khai API endpoints ✅
- [x] Triển khai web UI ✅
- [x] PTZ control module ✅
- [ ] Triển khai HLS streaming
- [ ] Triển khai storage service (snapshot/recording)
- [ ] ONVIF camera discovery
- [ ] Scheduler service (hẹn giờ ghi)
- [ ] Analysis service (motion detection, AI)

## Công nghệ đã chọn
- **Backend**: Python FastAPI
- **Frontend**: HTML + TailwindCSS + Vanilla JS
- **Storage**: YAML config file
- **Streaming**: MJPEG (done), HLS (planned)
- **Protocol**: RTSP cho camera IP
- **GPU**: NVDEC decode, CUDA resize (auto-fallback to CPU)

## GPU Acceleration (v0.2.0)
- **NVDEC**: Hardware decode RTSP H.264/H.265 qua `cv2.cudacodec.VideoReader`
- **CUDA resize**: `cv2.cuda.resize` cho frame processing
- **Auto-fallback**: Tự động dùng CPU nếu GPU không khả dụng
- **Yêu cầu**: `opencv-contrib-python` build với CUDA, hoặc build OpenCV from source với `-D WITH_CUDA=ON`
- **GTX 1650**: Hỗ trợ NVDEC (decode) + NVENC (encode)

## Changes in v0.2.0 (2026-03-23)
1. **rtsp_client.py**: NVDEC hardware decode, CUDA resize, auto-fallback CPU, latest frame cache
2. **camera_manager.py**: Clean callback architecture với `add_frame_callback()`, expose `decode_method` + `resolution` in status
3. **mjpeg_stream.py**: Async generator dùng `asyncio.Event` thay vì `time.sleep`, centralized frame callback
4. **main.py**: Fix duplicate import, đúng startup order (register callback → start cameras)
5. **routes/cameras.py**: Fix wrong camera existence check, remove unused imports, proper error responses

## Chi tiết các file source code

### Core Files
```
src/
├── server/
│   ├── main.py              # FastAPI app chính, startup/shutdown events
│   ├── routes/
│   │   ├── cameras.py      # REST API: CRUD cameras, start/stop, test
│   │   └── ptz.py          # PTZ control API
│   └── templates/
│       └── index.html      # Dashboard UI
├── cameras/
│   ├── capture/
│   │   ├── rtsp_client.py  # RTSP client: NVDEC/CPU decode, auto-reconnect
│   │   └── camera_manager.py # Quản lý nhiều camera, frame callbacks
│   ├── stream/
│   │   └── mjpeg_stream.py # MJPEG streaming, snapshot endpoint
│   └── ptz/
│       └── ptz_controller.py # Điều khiển xoay/lắc camera
├── models/
│   └── camera.py           # CameraConfig, CameraStatus Pydantic models
└── services/
    └── storage/
        └── config_service.py # Đọc/ghi config YAML
```

### Các module trống cần phát triển
- `src/services/scheduler/` - Hẹn giờ ghi video, chụp snapshot định kỳ
- `src/services/analysis/` - Motion detection, AI object detection
- `src/api/cloud/` - Cloud sync API
- `src/api/internal/` - Internal API

## API Endpoints

### Camera Management
- `GET /api/cameras` - List all cameras
- `POST /api/cameras` - Add camera
- `GET /api/cameras/{id}` - Get camera
- `PUT /api/cameras/{id}` - Update camera
- `DELETE /api/cameras/{id}` - Delete camera
- `POST /api/cameras/{id}/start` - Start camera stream
- `POST /api/cameras/{id}/stop` - Stop camera stream
- `GET /api/cameras/{id}/test` - Test connection (reports decode method)
- `GET /api/cameras/{id}/status` - Get camera status (includes decode_method, resolution)
- `GET /api/cameras/status/all` - Get all cameras status

### Streaming
- `GET /stream/{id}` - Stream viewer page
- `GET /stream/{id}/mjpeg` - MJPEG live stream
- `GET /stream/{id}/snapshot` - Single JPEG snapshot

### PTZ Control
- `POST /api/ptz/{camera_id}/move` - Di chuyển (up/down/left/right)
- `POST /api/ptz/{camera_id}/zoom` - Zoom in/out
- `POST /api/ptz/{camera_id}/preset` - Go to preset

### System
- `GET /` - Dashboard
- `GET /health` - Health check

## Tính năng đã có

| Tính năng | Mô tả | Status |
|-----------|-------|--------|
| RTSP Client | Kết nối camera IP qua RTSP | ✅ |
| GPU (NVDEC) | Hardware decode H.264/H.265 | ✅ |
| CPU Fallback | Auto-fallback khi không có GPU | ✅ |
| Camera Manager | Quản lý nhiều camera | ✅ |
| MJPEG Streaming | Stream qua HTTP | ✅ |
| Snapshot | Lấy ảnh đơn | ✅ |
| REST API | CRUD cameras | ✅ |
| PTZ Control | Điều khiển xoay/lắc | ✅ |
| Auto-reconnect | Tự động reconnect | ✅ |
| Config YAML | Cấu hình trong file | ✅ |
| HLS Streaming | Stream định dạng HLS | ⏳ |
| Recording | Ghi video | ⏳ |
| Scheduler | Hẹn giờ ghi/chụp | ⏳ |
| Motion Detection | Phát hiện chuyển động | ⏳ |
| ONVIF | Tự động tìm camera | ⏳ |

## Cách chạy
```bash
cd E:/Local-server
pip install -r requirements.txt
python -m uvicorn src.server.main:app --host 0.0.0.0 --port 8000
```
Truy cập: http://localhost:8000

## Camera đã test
- IP: 192.168.1.27 (Dahua)
- Username: admin / Password: Abc@@1234
- RTSP Path: /unicast/c1/s0/live
- **Resolution**: 2304x1296 (2K)
- **FPS**: 15-16 fps
- **Status**: ✅ Connected

## Cấu hình (config/cameras.yaml)
```yaml
server:
  host: 0.0.0.0
  port: 8000

cameras:
  - id: cam_001
    name: Camera cổng
    ip: 192.168.1.27
    port: 554
    username: admin
    password: Abc@@1234
    rtsp_path: /unicast/c1/s0/live
    enabled: true
    stream_type: main

storage:
  snapshot_dir: data/snapshots
  recording_dir: data/recordings
  export_dir: data/exports

stream:
  hls_dir: data/hls
  segment_duration: 2
```
