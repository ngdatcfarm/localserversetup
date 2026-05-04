# ESP32 MQTT Heartbeat - Lộ trình sửa lỗi bài bản

## Tình trạng hiện tại

ESP32 kết nối MQTT broker thành công (broker gửi CONNACK, ESP gửi PINGREQ), nhưng `publish()` luôn trả FAIL.

```
Serial output:
Heartbeat: local=1 state=0 cloud=1
Local publish: FAIL
Connecting to LOCAL MQTT... OK
  state after connect: 0
  state after loops: 0
```

**Broker log:** CONNACK gửi thành công, PINGREQ được gửi đều đặn, KHÔNG có PUBLISH heartbeat nào đến broker.

---

## PHÂN TÍCH SÂU: Tại sao publish FAIL dù connect OK?

### Khám phá quan trọng

1. **ESP32 gọi `connect()` → broker gửi CONNACK** ✅
   - Broker log: `Sending CONNACK to esp-004ch-001 (0, 0)` → Connection accepted

2. **Broker nhận SUBSCRIBE và PINGREQ** ✅
   - Broker log: `Received SUBSCRIBE from esp-004ch-001` → Session active
   - Broker log: `Received PINGREQ from esp-004ch-001` → Keepalive OK

3. **NHƯNG `state()` trả về 0 (MQTT_DISCONNECTED)** ❌
   - Mặc dù broker xác nhận connection thành công
   - `localMqttClient.state()` vẫn = 0

4. **`publish()` trả FAIL** ❌
   - Vì state=0 nên publish bị reject

### Có 2 giả thuyết:

**Giả thuyết 1: PubSubClient bug**
- `connect()` trả về true (TCP send thành công)
- NHƯNG chưa nhận được CONNACK từ broker
- `state()` vẫn = 0 vì chưa có phản hồi
- `connected()` trả về true vì TCP socket alive

**Giả thuyết 2: QoS issue**
- PubSubClient cần nhận CONNACK để xác nhận connection hoàn tất
- Nếu CONNACK bị lost trong network, connection vẫn "half-established"
- `state()` vẫn 0 vì chưa complete handshake

### Test bằng mosquitto_pub (backend works):
```bash
docker exec cfarm-mqtt mosquitto_pub -t 'cfarm/esp-004ch-001/heartbeat' -m '{"test":true}'
# → Database updated: online=True
```
→ Chứng minh backend MQTT listener hoạt động tốt, heartbeat đến broker là OK.

---

## LỘ TRÌNH SỬA TIẾP THEO

### Bước 1: Test với QoS 1 thay vì QoS 0
Đổi `publish()` từ QoS 0 sang QoS 1 để đảm bảo acknowledgment.

```cpp
// Trong sendHeartbeat():
localSent = localMqttClient.publish(LOCAL_HEARTBEAT_TOPIC, buffer, 1);  // QoS 1
```

### Bước 2: Thử không subscribe sau connect
Đôi khi SUBSCRIBE ngay sau CONNECT gây ra vấn đề. Thử để interval giữa connect và subscribe.

### Bước 3: Kiểm tra keepalive
Đặt keepalive ngắn hơn để force broker confirm connection.

---

## CÁC THAY ĐỔI ĐÃ LÀM

| Lần | File/Thay đổi | Kết quả |
|-----|---------------|---------|
| 1 | Thêm state debug | Phát hiện state=0 dù connect OK |
| 2 | Reconnect logic | ESP reconnect nhưng vẫn state=0 |
| 3 | Multi-loop sau connect | state vẫn = 0, CONNACK không đến |
| 4 | Disable cloud heartbeat | Vẫn FAIL |
| 5 | Simple sendHeartbeat | Vẫn FAIL |
| 6 | Thêm loop sau connect | ĐANG TEST |

---

## NHỮNG NHẬN ĐỊNH ĐÃ SAI

1. **"Published to LOCAL" = message đến broker"** ❌
   - Thực tế: `publish()` return true chỉ = queued thành công
   - `state()=0` = message bị silently dropped

2. **"connected() = true" = MQTT healthy** ❌
   - Thực tế: `connected()` check TCP socket OR, không phải MQTT state
   - Socket alive nhưng MQTT protocol chưa complete

3. **"Broker nhận CONNACK = connection hoàn tất"** ❌
   - Thực tế: Broker gửi CONNACK ≠ ESP nhận được CONNACK
   - Có thể CONNACK bị lost trong network stack

4. **"PingREQ = connection healthy"** ❌
   - PingREQ được gửi đều đặn → socket alive
   - NHƯNG MQTT state vẫn = 0 → protocol chưa complete

---

## BACKUP PLAN

Nếu tất cả các cách trên đều FAIL:

1. **Dùng cloud MQTT làm primary** thay vì local
   - Vì cloud đã từng hoạt động ổn định
   - Local chỉ dùng cho commands

2. **Thay đổi MQTT library** từ PubSubClient sang另一种
   - Có thể PubSubClient có bug với ESP32 + Docker

3. **Giảm heartbeat frequency** từ 30s lên 60s
   - Ít load hơn có thể giúp connection stable

---

## FILES ĐÃ SỬA

- `firmware/esp32_relay_4ch_hybrid/esp32_relay_4ch_hybrid.ino`
- `src/iot/mqtt_client.py` (client_id + debug)
- `src/iot/mqtt_listener.py` (debug logging)
- `static/js/pages/devices.js` (auto-refresh 30s)

---

## LỘ TRÌNH

### Bước 1: Cập nhật Firmware (ĐÃ SỬA)
- [x] Thêm serial debug `state` value
- [x] Thêm logic reconnect khi publish FAIL
- [x] Bump version lên 1.1.2

**File:** `firmware/esp32_relay_4ch_hybrid/esp32_relay_4ch_hybrid.ino`

```cpp
Serial.print("Heartbeat: local=");
Serial.print(localMqttClient.connected());
Serial.print(" state=");
Serial.print(localMqttClient.state());  // THÊM MỚI
Serial.print(" cloud=");
Serial.println(cloudMqttClient.connected());

// Reconnect nếu publish FAIL
if (!localSent) {
    Serial.println("Local publish failed - reconnecting...");
    localMqttClient.setClient(wifiClientLocal);
    localMqttClient.setServer(LOCAL_MQTT_SERVER, LOCAL_MQTT_PORT);
    localMqttClient.setCallback(localMqttCallback);
    connectLocalMqtt();
}
```

### Bước 2: Flash Firmware vào ESP32
1. Mở Arduino IDE
2. File → Open → `firmware/esp32_relay_4ch_hybrid/esp32_relay_4ch_hybrid.ino`
3. Tools → Port → COM3
4. Tools → Upload Speed → 115200
5. Nạp (Upload)

### Bước 3: Quan sát Serial Monitor
Sau khi flash, Serial sẽ hiện:
```
Heartbeat: local=1 state=0 cloud=1
Local publish: FAIL
Local publish failed - reconnecting...
Connecting to LOCAL MQTT... OK
```
Nếu thấy "Connecting to LOCAL MQTT... OK" sau "reconnecting..." → Fix đang hoạt động

### Bước 4: Kiểm tra Database
```bash
# Kiểm tra device online
curl http://localhost:8443/api/devices

# Kết quả mong đợi:
esp-004ch-001 online=True
```

---

## NẾU VẪN KHÔNG ĐƯỢC

### Kiểm tra MQTT Broker
```bash
# Xem broker log
docker logs cfarm-mqtt --since 2m

# Tìm heartbeat messages
docker logs cfarm-mqtt --since 2m | grep "heartbeat"
```

### Test trực tiếp
```bash
# Gửi heartbeat giả lập
docker exec cfarm-mqtt mosquitto_pub -t 'cfarm/esp-004ch-001/heartbeat' -m '{"device_code":"esp-004ch-001","test":true}'

# Kiểm tra kết quả
curl http://localhost:8443/api/devices
# esp-004ch-001 should be online=True
```

### Kiểm tra Python Server
```bash
# Server có đang chạy không?
netstat -ano | grep ":8443" | grep "LISTENING"

# MQTT có kết nối không?
curl http://localhost:8443/api/iot/mqtt/status
# {"connected":true,...} = OK
```

---

## CÁC THAY ĐỔI ĐÃ LÀM

| File | Thay đổi |
|------|---------|
| `firmware/...ino` | Thêm state debug, reconnect logic |
| `src/iot/mqtt_client.py` | Đổi client_id, thêm debug |
| `static/js/pages/devices.js` | Thêm auto-refresh 30s |

---

## NHỮNG NHẬN ĐỊNH ĐÃ SAI

1. **"Published to LOCAL" = message đến broker** ❌
   - Thực tế: `publish()` return true chỉ = queued thành công, không = gửi thành công
   - Khi state=0, message bị silently dropped

2. **"connected() = true" = MQTT healthy** ❌
   - Thực tế: `connected()` check TCP socket OR, không phải MQTT state
   - Socket alive nhưng MQTT protocol dead → connected() vẫn true

3. **Broker log không có heartbeat = ESP không gửi** ❌
   - Thực tế: ESP gửi nhưng message bị lost vì client state=0

4. **Flash firmware thành công = fix hoạt động** ❌
   - Thực tế: Flash có thể bị lỗi (ESPram timeout như lần trước)
   - Cần verify version trong serial output

---

## PHÁT HIỆN QUAN TRỌNG: CLOUD GÂY RA LOCAL FAIL

### Quan sát:
- Khi loại bỏ heartbeat lên cloud, local ổn định
- Khi bật cloud heartbeat → local publish FAIL

### Phân tích:
ESP32 dùng 2 client MQTT riêng biệt:
1. `localMqttClient` → port 1884 (Docker)
2. `cloudMqttClient` → port 1883 (cloud)

Nhưng khi cloud publish xong, có thể gây ra conflict với local client:
- PubSubClient dùng shared callback queue
- Hoặc WiFi stack bị ảnh hưởng khi send nhiều messages
- Hoặc broker session bị confuse khi cùng 1 device gửi 2 places

### Thử nghiệm đã làm:
1. Local + Cloud heartbeat → Local FAIL, Cloud FAIL
2. Local only (đã disable cloud) → ĐANG TEST

### Code change:
```cpp
// Cloud publish - DISABLED to test if cloud is interfering with local
// Previously when cloud heartbeat was removed, local was stable
bool cloudSent = false;
// if (cloudMqttClient.connected()) {
//     cloudSent = cloudMqttClient.publish(CLOUD_HEARTBEAT_TOPIC, buffer);
//     Serial.print("Cloud publish: ");
//     Serial.println(cloudSent ? "OK" : "FAIL");
// } else {
//     Serial.println("Cloud MQTT disconnected");
// }
```

### Kết quả test:
Xem serial output - nếu local publish OK sau khi disable cloud → xác nhận cloud gây conflict

---

## TEST PLAN

1. Flash firmware với cloud heartbeat DISABLED
2. Quan sát serial:
   - Heartbeat: local=1 state=X cloud=1
   - Local publish: OK  ← ĐÂY LÀ GOAL
3. Nếu local OK → chứng minh cloud gây conflict
4. Nếu local vẫn FAIL → vấn đề nằm ở local client hoặc broker

---

## BACKUP SOLUTION

Nếu cloud gây conflict, có thể:
1. Giữ cloud kết nối nhưng không gửi heartbeat
2. Hoặc gửi cloud heartbeat ở interval khác (không cùng lúc local)
3. Hoặc dùng QoS 0 cho local, QoS 1 cho cloud

---

## PHÁT HIỆN QUAN TRỌNG: FIRMWARE COMPILATION ISSUE

### Vấn đề phát sinh

Khi copy firmware sang thư mục `Downloads` và compile:
- File: `C:\Users\nguye\Downloads\ESP0012\ESP0012.ino`
- Lỗi: `'initRelays' was not declared in this scope`, `'localMqttCallback' was not declared...`
- **Nguyên nhân:** File copy bị thiếu code hoặc Arduino IDE cache cũ

### Phát hiện chính

**Khi tạo file trực tiếp trong folder gốc:** Compile và chạy OK
**Khi copy file sang folder khác:** Compile fail với lỗi missing functions

### Giải pháp đã áp dụng

1. **Xóa các bản cũ** trong Downloads:
   ```bash
   rm -rf "C:/Users/nguye/Downloads/ESP001"
   rm -rf "C:/Users/nguye/Downloads/ESP0012"
   rm -rf "C:/Users/nguye/Downloads/esp-004ch-001"
   ```

2. **Luôn compile từ folder gốc:**
   ```
   C:\Local server\firmware\esp32_relay_4ch_hybrid\esp32_relay_4ch_hybrid.ino
   ```

3. **Hoặc overwrite trực tiếp file đang mở:**
   ```bash
   cp "C:/Local server/firmware/...ino" "C:/Users/nguye/Downloads/...ino"
   ```

### Kết quả

```
Local MQTT: connected
Local publish: OK
→ Database: esp32-01 online=True ✅
```

---

## HƯỚNG NGHIÊN CỨU TIẾP THEO

### 1. Firmware Provisioning Pipeline (ĐÃ LÀM xong)
- [x] Tạo firmware template cho ESP32 relay 4CH
- [x] Quy tắc đặt tên: `esp-XXXXX` (5 số ngẫu nhiên)
- [x] Hướng dẫn chi tiết trong `docs/firmware_provisioning_guide.md`

**Template files:**
- `firmware/esp32_relay_4ch_hybrid/esp32_relay_4ch_hybrid.template.ino`

**Quick start:**
```bash
# Generate device code
echo "esp-$((RANDOM % 90000 + 10000))"

# Copy template
cp esp32_relay_4ch_hybrid.template.ino esp32_relay_4ch_hybrid.ino

# Edit DEVICE_CODE = esp-XXXXX (thay XXXXX bằng số ngẫu nhiên)
```

### 2. Arduino IDE Workspace Organization (ĐÃ LÀM xong)
- [x] Template firmware có comment rõ ràng từng bước
- [x] Không để firmware trong Downloads - dùng folder gốc
- [x] Firmware versioning: 1.1.4

### 3. ESP32 Flash Reliability
- [ ] Nghiên cứu nguyên nhân "ESPram timeout" khi flash
- [ ] Tăng timeout hoặc giảm upload speed nếu cần
- [ ] Verify firmware version sau khi flash

### 4. MQTT Authentication Compatibility (ĐÃ LÀM xong)
- [x] Local broker dùng anonymous auth (`allow_anonymous true`)
- [x] ESP firmware bỏ credentials cho local MQTT
- [x] Cloud MQTT vẫn dùng credentials

### 5. OTA Update Path
- [ ] Hiện tại OTA check failed với "HTTP -1"
- [ ] Kiểm tra local server HTTPS certificate
- [ ] Verify OTA endpoint: `/api/firmware/latest/{device_type}`

### 6. Device Code Mapping
- [ ] ESP report `esp32-01` nhưng DB có `esp-004ch-001`
- [ ] Cần sync device_code giữa firmware và database
- [ ] Hoặc implement auto-discovery đúng cách