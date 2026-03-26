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

## Phase 1: Local MQTT Broker + Database ✅ HOÀN THÀNH

**Mục tiêu**: Dựng nền tảng hạ tầng local - MQTT broker và database

### Checklist
- [x] Mosquitto MQTT Broker (Windows native, port 1883)
- [x] Cấu hình Mosquitto (auth 3 users: server/device/cloud, ACL, persistence)
- [x] PostgreSQL 18 (Windows native, port 5432)
- [x] Database schema cho IoT data (devices, sensor_data, device_states, commands, sync_queue)
- [x] Cập nhật MQTT client kết nối local broker (thay cloud)
- [x] MQTT listener service nhận heartbeat + sensor data từ ESP32
- [x] Database service async (asyncpg connection pool)
- [x] FastAPI tích hợp startup: DB → MQTT → Listener → Camera
- [x] Test kết nối thành công: DB Connected + MQTT Connected + Camera 1280x720@25fps

### Quyết định kỹ thuật
- **MQTT Broker**: Mosquitto 2.x (Windows native installer)
- **Database**: PostgreSQL 18 (Windows native installer, TimescaleDB optional)
- **DB Driver**: asyncpg (async connection pool, tương thích FastAPI)
- **Deployment**: Windows native (không Docker, không VM)

### Kết quả test (2026-03-26)
```
DB: Connected to TimescaleDB
MQTT: Connected to localhost
MqttListener: Registered handlers for heartbeat, status, sensor data
Camera cam_001: CPU connected 1280x720 @ 25fps
CFarm Local Server ready!
```

---

## Phase 2: Local API hoàn chỉnh ✅ HOÀN THÀNH

**Mục tiêu**: Port business logic từ cfarm.vn (PHP) sang local server (Python)

### Checklist (đã hoàn thành)
- [x] Device management CRUD (register, update, delete, channels)
- [x] Device state tracking (current states per channel)
- [x] Sensor data API (latest, history, hourly aggregates, barn summary)
- [x] Device heartbeat tracking & offline detection (background task 60s)
- [x] Relay command logging to database
- [x] Command history API per device

### Gap Analysis vs cfarm.vn - Thứ tự implement

| # | Tính năng | Độ ưu tiên | Trạng thái |
|---|---|---|---|
| # | Tính năng | Độ ưu tiên | Trạng thái |
|---|---|---|---|
| 1 | **Automation Scheduler** - hẹn giờ relay, điều kiện sensor | CRITICAL | ✅ Done |
| 2 | **Timed Relay** - bật relay X giây rồi tự tắt | CRITICAL | ✅ Done |
| 3 | **Environmental Alerts** - cảnh báo sensor vượt ngưỡng | CRITICAL | ✅ Done |
| 4 | **Firmware OTA** - upload/download/trigger update ESP32 | CRITICAL | ✅ Done |
| 5 | **Barn Management** - CRUD chuồng trại | HIGH | ✅ Done |
| 6 | **Cycle Management** - quản lý đợt nuôi, KPI dashboard | HIGH | ✅ Done |
| 7 | **Inventory Management** - kho cám/thuốc, nhập/xuất/chuyển kho | HIGH | ✅ Done |
| 8 | **Care Operations** - cho ăn, tử vong, thuốc/vaccine, cân, bán | HIGH | ✅ Done |
| 9 | **Device Type CRUD** - tạo/sửa device type từ API | MEDIUM | ✅ Done |
| 10 | **Device Test Command** - gửi test kiểm tra kết nối | MEDIUM | ✅ Done |
| 11 | **Push Notifications** - WebPush alerts | LOW | ✅ Done |

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

### 2026-03-26 - Phase 1: Chuyển sang Windows native (bỏ Docker dependency)
- Quyết định: cài trực tiếp Mosquitto + PostgreSQL trên Windows (không cần Docker)
- Tạo SETUP_WINDOWS.md - hướng dẫn cài đặt từng bước
- Tạo scripts/init_db.sql - tương thích cả PostgreSQL thuần và TimescaleDB
- TimescaleDB là optional, hệ thống vẫn chạy tốt với PostgreSQL thuần
- Docker Compose giữ lại như option cho ai muốn dùng

### 2026-03-26 - Phase 1: HOÀN THÀNH - Tất cả services kết nối thành công
- Cài Mosquitto MQTT Broker trên Windows → port 1883 OK
- Cài PostgreSQL 18 trên Windows → port 5432 OK
- Tạo database cfarm_local, user cfarm, chạy init schema OK
- Cài Python packages: paho-mqtt, asyncpg OK
- Chạy server: DB Connected + MQTT Connected + Camera 25fps + Listener 4 handlers
- **Phase 1 hoàn thành, sẵn sàng nhận data từ ESP32 qua LAN**

### 2026-03-26 - Phase 2: Local API hoàn chỉnh
- Tạo DeviceService: CRUD devices, channels, states, offline detection
- Tạo SensorService: latest readings, history, hourly aggregates, barn summary
- API routes: /api/devices (CRUD, channels, states) + /api/sensors (latest, history, hourly, barn)
- Relay command logging vào device_commands table
- Command history API: GET /api/iot/commands/{device_id}
- Background task: kiểm tra device offline mỗi 60s (timeout 90s)
- Health endpoint mở rộng: device count + online count
- Server version: v0.5.0

### 2026-03-26 - Phase 2: Automation + Alerts + Firmware OTA
- Gap analysis so sánh cfarm.vn vs localserversetup → xác định 9 tính năng thiếu
- DB migration: scripts/002_automation_alerts.sql (automation_rules, alert_rules, alerts, firmwares)
- AutomationService: cron scheduler (30s loop) + sensor condition triggers
- Timed Relay: POST /api/iot/relay/timed - bật relay X giây rồi tự tắt
- AlertService: giám sát sensor ngưỡng min/max, tạo alerts, cooldown
- FirmwareService: upload/download binary, trigger OTA qua MQTT
- API routes: /api/automation/rules, /api/alerts, /api/firmware
- Dependency mới: croniter (cron parsing), python-multipart (file upload)
- Server version: v0.6.0

### 2026-03-26 - Phase 2: Farm Management Module
- DB migration: scripts/003_farm_management.sql
  - Tables: barns, cycles, warehouses, products, inventory, inventory_transactions
  - Care tables: care_feeds, care_deaths, care_medications, care_weights, care_sales
  - Support tables: weight_reminders, cycle_daily_snapshots
- BarnService: CRUD chuồng trại + summary (active cycle, device count)
- CycleService: CRUD đợt nuôi, close cycle, dashboard KPI (alive, mortality%, FCR, feed/bird/day)
- InventoryService: warehouse/product CRUD, import/export/transfer stock, transaction history
- CareService: log feed (auto deduct stock), log death (auto update count), log medication (auto deduct), log weight (day_age calc), log sale (auto update count), weight reminders
- API routes: /api/farm/* (barns, cycles, warehouses, products, inventory, care/*)
- Server version: v0.7.0

### 2026-03-26 - Phase 2: HOÀN THÀNH - Device Type CRUD + Test Command + Push Notifications
- DeviceService: CRUD device types (create/get/update/delete với kiểm tra in-use)
- Device Test Command: POST /api/devices/{id}/test - gửi ping qua MQTT
- NotificationService: WebPush subscriptions, send_to_all, auto-cleanup expired
- Push tích hợp AlertService: tự động gửi push khi có alert mới
- DB migration: scripts/004_push_notifications.sql (push_subscriptions table)
- API routes: /api/notifications/* (subscribe, unsubscribe, test, VAPID key)
- pywebpush là optional dependency - server chạy bình thường nếu chưa cài
- **Phase 2 hoàn thành 11/11 tính năng** - Server version: v0.8.0
