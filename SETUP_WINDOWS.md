# Hướng dẫn cài đặt CFarm Local Server trên Windows

## Bước 1: Cài Mosquitto MQTT Broker

### 1.1 Tải và cài
- Tải tại: https://mosquitto.org/download/
- Chọn **Windows 64-bit** (mosquitto-2.x.x-install-windows-x64.exe)
- Cài đặt mặc định → Next → Next → Install
- Đường dẫn mặc định: `C:\Program Files\mosquitto`

### 1.2 Tạo password file
Mở **Command Prompt (Admin)**:
```cmd
cd "C:\Program Files\mosquitto"

:: Tạo user cho local server
mosquitto_passwd -c passwd cfarm_server
:: Nhập password: cfarm_server_2026

:: Thêm user cho ESP32 devices
mosquitto_passwd -b passwd cfarm_device cfarm_device_2026

:: Thêm user cho cloud sync (read-only)
mosquitto_passwd -b passwd cfarm_cloud cfarm_cloud_2026
```

### 1.3 Cấu hình Mosquitto
Mở file `C:\Program Files\mosquitto\mosquitto.conf`, thay toàn bộ nội dung:
```
# MQTT standard port
listener 1883
protocol mqtt

# WebSocket port (cho webapp)
listener 9001
protocol websockets

# Authentication
allow_anonymous false
password_file C:\Program Files\mosquitto\passwd

# Persistence
persistence true
persistence_location C:\Program Files\mosquitto\data\

# Logging
log_dest file C:\Program Files\mosquitto\log\mosquitto.log
log_dest stdout
log_type all
connection_messages true
log_timestamp true
```

Tạo thư mục data và log:
```cmd
mkdir "C:\Program Files\mosquitto\data"
mkdir "C:\Program Files\mosquitto\log"
```

### 1.4 Chạy Mosquitto
```cmd
:: Chạy như Windows Service (tự start khi boot)
net start mosquitto

:: Hoặc chạy thủ công để xem log
mosquitto -c "C:\Program Files\mosquitto\mosquitto.conf" -v
```

### 1.5 Test kết nối
Mở 2 terminal:
```cmd
:: Terminal 1 - Subscribe
mosquitto_sub -h localhost -u cfarm_server -P cfarm_server_2026 -t "cfarm/#" -v

:: Terminal 2 - Publish test
mosquitto_pub -h localhost -u cfarm_device -P cfarm_device_2026 -t "cfarm/test/heartbeat" -m "{\"rssi\":-45,\"ip\":\"192.168.1.100\"}"
```
Nếu Terminal 1 nhận được message → Mosquitto OK!

---

## Bước 2: Cài PostgreSQL + TimescaleDB

### 2.1 Cài PostgreSQL
- Tải tại: https://www.postgresql.org/download/windows/
- Chọn **Windows x86-64** → tải installer
- Cài đặt:
  - Port: **5432** (mặc định)
  - Password cho user `postgres`: đặt password bạn nhớ (ví dụ: `postgres123`)
  - Locale: Default
- Khi hỏi Stack Builder → **bỏ qua** (uncheck)

### 2.2 Cài TimescaleDB extension
- Tải tại: https://docs.timescale.com/self-hosted/latest/install/installation-windows/
- Chạy installer, chọn đúng version PostgreSQL đã cài
- Installer sẽ tự thêm vào `postgresql.conf`:
  ```
  shared_preload_libraries = 'timescaledb'
  ```
- Restart PostgreSQL service sau khi cài

### 2.3 Tạo database và user
Mở **pgAdmin** (đã cài kèm PostgreSQL) hoặc dùng command line:
```cmd
:: Mở psql
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U postgres

-- Trong psql, chạy:
CREATE USER cfarm WITH PASSWORD 'cfarm_local_2026';
CREATE DATABASE cfarm_local OWNER cfarm;
GRANT ALL PRIVILEGES ON DATABASE cfarm_local TO cfarm;
\q
```

### 2.4 Tạo tables
```cmd
"C:\Program Files\PostgreSQL\16\bin\psql.exe" -U cfarm -d cfarm_local -f "E:\local-server\scripts\init_db.sql"
:: Nhập password: cfarm_local_2026
```

---

## Bước 3: Cài Python dependencies

```powershell
cd E:\local-server
pip install -r requirements.txt
```

---

## Bước 4: Chạy server

```powershell
cd E:\local-server
python -m uvicorn src.server.main:app --host 0.0.0.0 --port 8000 --reload
```

Kiểm tra: http://localhost:8000/health
```json
{
  "status": "healthy",
  "mqtt": {"connected": true, "host": "localhost", "messages": 0},
  "database": {"connected": true}
}
```

---

## Kiểm tra tất cả hoạt động

| Service | Cách kiểm tra | OK |
|---|---|---|
| Mosquitto | `netstat -an \| findstr :1883` → LISTENING | [ ] |
| PostgreSQL | `netstat -an \| findstr :5432` → LISTENING | [ ] |
| FastAPI | http://localhost:8000/health | [ ] |
| MQTT kết nối | health API → mqtt.connected = true | [ ] |
| DB kết nối | health API → database.connected = true | [ ] |

---

## Lưu ý Windows

- Mosquitto chạy như **Windows Service** → tự khởi động khi bật máy
- PostgreSQL chạy như **Windows Service** → tự khởi động khi bật máy
- FastAPI cần chạy thủ công hoặc tạo Task Scheduler để auto-start
