# CFarm Local Server - Lộ trình chuyển đổi Local-First Architecture

> **Mục tiêu**: Chuyển toàn bộ hệ thống IoT từ Cloud-first sang Local-first.
> Local server là hub chính xử lý mọi dữ liệu ESP32. Cloud chỉ là hệ thứ cấp nhận bản sao.

---

## Tổng quan kiến trúc

```
ESP32 Sensors/Relays
    │ MQTT (LAN, <1ms)
    ▼
┌─────────────────────────────────────────┐
│         LOCAL SERVER (Primary)          │
│  Mosquitto Broker ← ESP32 devices      │
│  FastAPI Backend  ← Business logic      │
│  PostgreSQL/TimescaleDB ← Time-series   │
│  Webapp (SPA)     ← Hybrid LAN/Cloud   │
└──────────────┬──────────────────────────┘
               │ Sync API (HTTPS, batch)
               ▼
┌─────────────────────────────────────────┐
│         CLOUD cfarm.vn (Secondary)      │
│  PHP Backend ← Nhận data từ local       │
│  MySQL       ← Mirror data              │
│  Dashboard   ← Remote monitoring        │
└─────────────────────────────────────────┘
```

---

## Phase 1: Local MQTT Broker + Database ← ĐANG THỰC HIỆN

**Mục tiêu**: Dựng nền tảng hạ tầng local - MQTT broker và database

### Checklist
- [ ] Docker Compose cho Mosquitto MQTT Broker
- [ ] Cấu hình Mosquitto (auth, ACL, persistence)
- [ ] Docker Compose cho TimescaleDB (PostgreSQL + time-series)
- [ ] Database schema cho IoT data (devices, sensor_data, device_states, commands)
- [ ] Cập nhật MQTT client kết nối local broker (thay cloud)
- [ ] MQTT listener service nhận heartbeat + sensor data từ ESP32
- [ ] Lưu sensor data vào database
- [ ] Test kết nối ESP32 → Local MQTT → Database

### Quyết định kỹ thuật
- **MQTT Broker**: Mosquitto (nhẹ, ổn định, Docker-ready)
- **Database**: PostgreSQL + TimescaleDB extension (time-series tối ưu cho sensor data)
- **ORM**: SQLAlchemy async (tương thích FastAPI)

---

## Phase 2: Local API hoàn chỉnh

**Mục tiêu**: Port business logic từ cfarm.vn (PHP) sang local server (Python)

### Checklist
- [ ] Device management CRUD (register, update, delete)
- [ ] Curtain control service (đã có, cần kết nối DB)
- [ ] Sensor data collection & aggregation
- [ ] Device heartbeat tracking & offline detection
- [ ] Relay command logging
- [ ] Environmental data API (temperature, humidity)
- [ ] Automation rules engine (schedule, threshold triggers)
- [ ] Firmware OTA management

---

## Phase 3: Cloud Sync Service

**Mục tiêu**: Đồng bộ data từ local lên cloud, nhận remote commands

### Checklist
- [ ] Sync protocol design (batch + event-driven)
- [ ] Local → Cloud: batch sync sensor data (mỗi 5-15 phút)
- [ ] Local → Cloud: real-time device state changes
- [ ] Cloud → Local: remote command forwarding
- [ ] Conflict resolution (local = source of truth)
- [ ] Sync queue với retry logic
- [ ] API authentication giữa local ↔ cloud

---

## Phase 4: Hybrid Webapp

**Mục tiêu**: Webapp chạy được cả LAN (nhanh) và Cloud (remote)

### Checklist
- [ ] SPA framework (Vue.js hoặc React)
- [ ] Auto-detect LAN vs Cloud
- [ ] Service Worker cho offline capability
- [ ] Responsive UI (mobile-first)
- [ ] Real-time updates via WebSocket
- [ ] Cloud proxy forward commands về local

---

## Lịch sử thay đổi

### 2026-03-26 - Khởi tạo lộ trình
- Phân tích kiến trúc hiện tại: cfarm.vn (PHP cloud) + localserversetup (Python local)
- Xác định vấn đề: ESP32 phụ thuộc internet, latency cao, mất net = mất điều khiển
- Quyết định chuyển sang Local-first architecture
- Bắt đầu Phase 1: Local MQTT Broker + Database

### 2026-03-26 - Phase 1: Cấu hình hạ tầng
- Tạo Docker Compose cho Mosquitto MQTT broker + TimescaleDB
- Cấu hình Mosquitto authentication & persistence
- Tạo database schema cho IoT (devices, sensor_data, device_states, commands)
- Cập nhật MQTT client kết nối local broker
- Tạo MQTT listener service xử lý heartbeat & sensor data
