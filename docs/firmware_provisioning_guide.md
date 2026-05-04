# ESP32 Firmware Provisioning Guide

## Tổng quan

Quy trình cấp phát firmware cho ESP32 mới một cách nhanh chóng, tránh trùng lặp MQTT topic.

---

## Quy trình cấp phát mới (Khuyến nghị)

### Cách 1: Qua Web UI (Đơn giản nhất)

1. Mở trang **Thiết bị** →点击 **"+ Thêm thiết bị"**
2. Chỉ cần điền:
   - **Tên thiết bị** (VD: "Relay bơm nước")
   - **Loại thiết bị** (VD: "Relay 4CH")
   - **Chuồng** (VD: "Chuồng heo 1")
3. **Mã thiết bị và MQTT Topic sẽ tự động được tạo!**
4. Click **"Lưu"**
5. Trong danh sách thiết bị, click **"ESP32"** để lấy firmware đã được customize sẵn

**Tự động sinh:**
- Device code: `esp-XXXXX` (5 chữ số ngẫu nhiên, ví dụ: `esp-48291`)
- MQTT Topic: `cfarm/esp-48291`

### Cách 2: Manual (Dùng template firmware)

#### Bước 1: Copy Template

```bash
# Copy template firmware
cp esp32_relay_4ch_hybrid.template.ino esp32_relay_4ch_hybrid.ino
```

#### Bước 2: Generate Device Code mới

```bash
# Linux/Mac/Git Bash
echo "esp-$((RANDOM % 90000 + 10000))"

# PowerShell
"esp-$(Get-Random -Minimum 10000 -Maximum 99999)"
```

Ví dụ output: `esp-48291`

#### Bước 3: Edit DEVICE_CODE

Mở file `esp32_relay_4ch_hybrid.ino`, tìm dòng:

```cpp
// Device Identity - USE UNIQUE 5-DIGIT ID
const char* DEVICE_CODE = "esp-48291";     // CHANGE THIS - Must be UNIQUE!
```

#### Bước 4: Compile và Upload

```bash
# Arduino IDE
# File → Open → esp32_relay_4ch_hybrid.ino
# Tools → Board → ESP32 Dev Module
# Tools → Port → COMx
# Upload
```

#### Bước 5: Verify Serial Output

```
ESP32 Relay 4CH Hybrid Firmware
Version: 1.1.4
Device: esp-48291     ← Device code mới
```

#### Bước 6: Kiểm tra Database

```bash
curl http://localhost:8443/api/devices
```

Device mới sẽ tự động xuất hiện với `is_online: true`.

---

## Quy tắc đặt tên Device Code

### Format: `esp-XXXXX`
- Prefix: `esp-` (fixed)
- Suffix: **5 chữ số ngẫu nhiên** (10000-99999)
- Tổng cộng: 8 ký tự (ví dụ: `esp-48291`)

### Tại sao dùng 5 số ngẫu nhiên?
1. **Tránh trùng lặp** - Xác suất trùng rất thấp (1/90,000)
2. **Dễ nhớ** - Có thể ghi nhớ hoặc sticker lên thiết bị
3. **Tự động** - Hệ thống tự sinh khi thêm qua Web UI

### Cách tạo số ngẫu nhiên (thủ công)

**Cách 1: Random.org**
```
https://www.random.org/integers/?num=1&min=10000&max=99999&col=1&base=10&format=html&rnd=new
```

**Cách 2: Python**
```python
import random
print(f"esp-{random.randint(10000, 99999)}")
```

**Cách 3: Terminal**
```bash
echo "esp-$((RANDOM % 90000 + 10000))"
```

**Cách 4: Excel/Google Sheets**
```
="esp-"&RANDBETWEEN(10000,99999)
```

---

## MQTT Topic Structure

Với `DEVICE_CODE = esp-48291`:

| Topic | Description |
|-------|-------------|
| `cfarm/esp-48291/cmd` | Local commands (subscribe) |
| `cfarm/esp-48291/heartbeat` | Local heartbeat (publish) |
| `cfarm/esp-48291/ack` | Local acknowledgment (publish) |
| `cfarm.vn/esp-48291/cmd` | Cloud commands (subscribe) |
| `cfarm.vn/esp-48291/heartbeat` | Cloud heartbeat (publish) |
| `cfarm.vn/esp-48291/ack` | Cloud acknowledgment (publish) |

---

## Các loại Device Type

| DEVICE_TYPE | Mô tả | Số kênh Relay |
|-------------|--------|---------------|
| `relay_4ch` | Relay 4 kênh | 4 |
| `relay_8ch` | Relay 8 kênh | 8 |
| `sensor` | Cảm biến (không relay) | 0 |
| `mixed` | Relay + Cảm biến | 4 |

---

## Troubleshooting

### Lỗi "initRelays was not declared"

**Nguyên nhân:** Arduino IDE đang compile file cũ.

**Giải pháp:**
1. Close all Arduino windows
2. Xóa file .ino cũ trong Downloads
3. Copy template mới
4. Mở lại Arduino IDE

### Local publish FAIL nhưng cloud OK

1. Kiểm tra `LOCAL_MQTT_USER` đang empty:
   ```cpp
   const char* LOCAL_MQTT_USER = "";
   const char* LOCAL_MQTT_PASS = "";
   ```
2. Verify Docker MQTT port:
   ```bash
   docker ps | grep mqtt
   # Output: 0.0.0.0:1884->1883/tcp
   ```

### Device không xuất hiện trong database

1. Check MQTT broker nhận được heartbeat:
   ```bash
   docker logs cfarm-mqtt --since 1m | grep heartbeat
   ```
2. Check Python server MQTT client:
   ```bash
   curl http://localhost:8443/api/iot/mqtt/status
   ```

---

## Quick Reference

### Generate random device code
```bash
# One-liner for new ESP32
echo "esp-$((RANDOM % 90000 + 10000))"
```

### Check all devices
```bash
curl -s http://localhost:8443/api/devices | python3 -c "import json,sys; [print(d['device_code'], 'online='+str(d['is_online'])) for d in json.load(sys.stdin)]"
```

### Monitor MQTT broker
```bash
docker logs -f cfarm-mqtt 2>&1 | grep -E "(esp-|heartbeat|cmd)"
```

### Test heartbeat manually
```bash
docker exec cfarm-mqtt mosquitto_pub -t 'cfarm/esp-XXXXX/heartbeat' -m '{"device_code":"esp-XXXXX","test":true}'
```

---

## Checklist trước khi flash firmware mới

- [x] Qua Web UI: Chỉ cần chọn loại + đặt tên
- [x] Mã thiết bị tự sinh (esp-XXXXX)
- [x] MQTT topic tự sinh (cfarm/esp-XXXXX)
- [ ] Verify WiFi credentials đúng (nếu dùng template)
- [ ] Close Arduino IDE (nếu đang mở file cũ)
- [ ] Copy template → Rename → Open → Compile
- [ ] Verify serial output hiện device code đúng
- [ ] Check database device online

---

## Files liên quan

| File | Mô tả |
|------|-------|
| `firmware/esp32_relay_4ch_hybrid/esp32_relay_4ch_hybrid.template.ino` | Template firmware gốc |
| `static/js/pages/devices.js` | Frontend - form tự sinh device code |
| `src/iot/device_service.py` | Backend - auto-generate device_code |
| `src/server/routes/devices.py` | API - device_code/mqtt_topic là optional |
