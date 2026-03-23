# Nghiên cứu về Camera IP

## Tổng quan

Camera IP (Internet Protocol Camera) là thiết bị ghi hình kỹ thuật số gửi dữ liệu qua mạng IP. Đây sẽ là "con mắt" của hệ thống local server.

---

## 1. Protocol kết nối

### RTSP (Real Time Streaming Protocol)
- **Phổ biến nhất** cho camera IP
- Port mặc định: 554
- URL format: `rtsp://<username>:<password>@<ip>:<port>/<path>`
- Ví dụ: `rtsp://admin:password@192.168.1.100:554/stream1`
- Hỗ trợ: TCP, UDP, RTP

### ONVIF (Open Network Video Interface Forum)
- Chuẩn giao tiếp mở
- Cho phép discover camera tự động
- Điều khiểu PTZ (Pan/Tilt/Zoom)
- Cổng: 8000, 8080

### HTTP/MJPEG
- JPEG frames qua HTTP
- Đơn giản, ít latency
- Ví dụ: `http://<ip>/mjpeg`

---

## 2. Định dạng Video

| Format | Ứng dụng | Ưu điểm | Nhược điểm |
|--------|----------|---------|-------------|
| H.264 | Phổ biến | Nén tốt, chất lượng cao | Tốn CPU decode |
| H.265/HEVC | Mới hơn | Nén tốt hơn 50% | Tương thích kém hơn |
| MJPEG | Legacy | Dễ xử lý | File size lớn |

---

## 3. Stream Types

### Main Stream (Primary)
- Resolution cao (1080p, 4MP,...)
- Bitrate cao
- Dùng cho recording

### Sub Stream (Secondary)
- Resolution thấp hơn (480p, 720p)
- Bitrate thấp
- Dùng cho mobile viewing, preview

---

## 4. Các thương hiệu phổ biến

### Hikvision
- Protocol: RTSP (DaHua-compatible)
- URL: `rtsp://admin:<password>@<ip>:554/Streaming/Channels/101`
- ONVIF port: 8000

### Dahua
- URL: `rtsp://admin:<password>@<ip>:554/cam/realmonitor?channel=1&subtype=0`
- Path pattern: `/unicast/c1/s0/live` (Main stream)
- Path pattern: `/unicast/c2/s0/live` (Sub stream)

### Reolink
- URL: `rtsp://admin:<password>@<ip>:554/h264/ch_0/main.av`

### Generic/Other
- Thường hỗ trợ RTSP chuẩn
- Cần kiểm tra documentation của nhà sản xuất

---

## 5. Libraries/Tools cho Python

### ffmpeg / ffmpeg-python
- Chuyển đổi stream, transcoding
- HLS output

### opencv-python (cv2)
- Đọc RTSP stream
- Xử lý frame, ghi file

### onvif-gentools
- Camera discovery
- Điều khiển PTZ

### aiortc / av
- Async RTSP client
- Hiệu năng tốt

---

## 6. Kiến trúc Capture System

```
Camera IP (RTSP)
      │
      ▼
┌─────────────┐
│  RTSP Client│ ─── Connect, authenticate
└─────────────┘
      │
      ▼
┌─────────────┐
│  Frame Parser│ ─── Decode H.264/H.265
└─────────────┘
      │
      ├──────────────────┬──────────────────┐
      ▼                  ▼                  ▼
┌───────────┐    ┌───────────┐    ┌───────────┐
│ Snapshot  │    │ Recording │    │  Streaming│
│  Service  │    │  Service  │    │  Service  │
└───────────┘    └───────────┘    └───────────┘
```

---

## 7. Thông số cần lưu trữ

### Camera Config
```json
{
  "id": "cam_001",
  "name": "Camera cổng",
  "ip": "192.168.1.100",
  "port": 554,
  "username": "admin",
  "password": "xxx",
  "rtsp_path": "/stream1",
  "enabled": true,
  "sub_stream": false
}
```

---

## 8. Xử lý vấn đề thường gặp

| Vấn đề | Nguyên nhân | Giải pháp |
|--------|-------------|------------|
| Không kết nối được | Sai username/password | Kiểm tra credentials |
| Timeout | Network/firewall | Kiểm tra port, NAT |
| Stream chậm | Bandwidth thấp | Dùng sub-stream |
| Buffer overflow | CPU quá tải | Tăng buffer, giảm FPS |

---

## 9. Camera thực tế (Test)

### Camera 1 - Dahua
| Thông số | Giá trị |
|----------|---------|
| IP | 192.168.1.27 |
| Port | 554 |
| Username | admin |
| Password | Abc@@1234 |
| RTSP Path | /unicast/c1/s0/live |
| Brand | Dahua |
| Full URL | `rtsp://admin:Abc@@1234@192.168.1.27:554/unicast/c1/s0/live` |

---

## 10. Hardware specs (Local Server)

| Component | Spec |
|-----------|------|
| CPU | Intel Core i7 9700 |
| GPU | NVIDIA GTX 1650 |
| RAM | 24GB |
| Storage | 100GB SSD (free), 500GB HDD (free) |

**Khả năng:**
- Hardware encoding H.264/H.265 với NVENC (GTX 1650)
- Xử lý nhiều camera cùng lúc
- Lưu trữ recordings dài hạn

---

## 11. Bước tiếp theo

- [ ] Chọn Python library cho RTSP (opencv vs aiortc)
- [ ] Tạo camera config model
- [ ] Implement RTSP client cơ bản
- [ ] Test với camera thực (192.168.1.27)
