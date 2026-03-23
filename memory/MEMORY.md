# Camera Server Project

## Mục tiêu dự án
Xây dựng local server để:
- **Đọc**: Thu thập hình ảnh từ các camera IP trong mạng LAN
- **Ghi**: Lưu trữ hình ảnh, snapshots, recordings
- **Phân phối**: Stream hình ảnh đến các thiết bị di động trong LAN với định dạng tương thích

## Cấu trúc thư mục hiện tại

```
camera-server/
├── src/
│   ├── api/           # API endpoints (cloud, internal)
│   ├── cameras/      # Camera handling (capture, config, stream)
│   ├── models/       # Data models
│   ├── server/      # Server core (middleware, routes, templates)
│   ├── services/    # Business logic (analysis, scheduler, storage)
│   └── utils/       # Utilities
├── static/          # Static files (css, images, js)
├── config/          # Configuration files
├── data/
│   ├── exports/     # Exported data
│   ├── recordings/ # Video recordings
│   └── snapshots/  # Image snapshots
├── logs/            # Application logs
└── cache/           # Cache storage
```

## Tiến trình
- [x] Tạo cấu trúc thư mục
- [x] Tạo cấu trúc dashboard + camera config ✅ (2026-03-22)
- [x] Triển khai camera capture service ✅ (2026-03-22)
- [x] GPU acceleration (NVDEC/CUDA) ✅ (2026-03-23)
- [x] Fix callback architecture ✅ (2026-03-23)
- [x] Fix async MJPEG streaming ✅ (2026-03-23)
- [x] Fix bugs & code cleanup ✅ (2026-03-23)
- [x] Triển khai API endpoints ✅ (2026-03-22)
- [x] Triển khai web UI ✅ (2026-03-22)
- [ ] Triển khai HLS streaming
- [ ] Triển khai storage service (snapshot/recording)
- [ ] ONVIF camera discovery

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

## Files đã tạo
```
camera-server/
├── requirements.txt          # Python dependencies
├── config/
│   └── cameras.yaml         # Camera configurations
└── src/
    ├── models/
    │   └── camera.py        # CameraConfig model
    ├── cameras/
    │   ├── capture/
    │   │   ├── rtsp_client.py    # RTSP client (NVDEC + CPU fallback)
    │   │   └── camera_manager.py  # Camera manager
    │   └── stream/
    │       └── mjpeg_stream.py   # MJPEG streaming (async)
    ├── services/storage/
    │   └── config_service.py # Config CRUD service
    └── server/
        ├── main.py          # FastAPI app
        ├── routes/
        │   └── cameras.py   # Camera API endpoints
        └── templates/
            └── index.html   # Dashboard UI
```

## API Endpoints
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
- `GET /stream/{id}` - MJPEG live stream
- `GET /stream/{id}/snapshot` - Single JPEG snapshot

## Cách chạy
```bash
cd E:/camera-server
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
