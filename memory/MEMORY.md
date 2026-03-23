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
- [ ] Triển khai streaming service (HLS/MJPEG)
- [ ] Triển khai storage service (snapshot/recording)
- [x] Triển khai API endpoints ✅ (2026-03-22)
- [x] Triển khai web UI ✅ (2026-03-22)

## Công nghệ đã chọn
- **Backend**: Python FastAPI
- **Frontend**: HTML + TailwindCSS + Vanilla JS
- **Storage**: YAML config file
- **Streaming**: HLS, MJPEG (sẽ implement sau)
- **Protocol**: RTSP cho camera IP

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
    │   └── capture/
    │       ├── rtsp_client.py    # RTSP client (OpenCV)
    │       └── camera_manager.py  # Camera manager
    ├── services/storage/
    │   └── config_service.py # Config CRUD service
    └── server/
        ├── main.py          # FastAPI app
        ├── routes/
        │   └── cameras.py   # Camera API endpoints
        └── templates/
            └── index.html   # Dashboard UI
```

## API Endpoints (Camera Capture)
- `POST /api/cameras/{id}/start` - Start camera stream
- `POST /api/cameras/{id}/stop` - Stop camera stream
- `GET /api/cameras/{id}/test` - Test connection
- `GET /api/cameras/{id}/status` - Get camera status
- `GET /api/cameras/status/all` - Get all cameras status

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
