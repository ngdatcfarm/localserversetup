# Hybrid MQTT Architecture - ESP32 Dual-Subscribe

## Overview

ESP32 firmware hybrid kết nối đến **2 MQTT brokers**:
1. **Local broker** (`192.168.1.9`) - ưu tiên cao, độ trễ thấp
2. **Cloud broker** (`103.166.183.215`) - fallback, độ trễ cao hơn

## MQTT Topics

### Local Broker (Primary)
```
cfarm/{device_code}/cmd        - Nhận lệnh từ local server
cfarm/{device_code}/heartbeat  - Gửi heartbeat lên local
cfarm/{device_code}/ack        - ACK response
cfarm/{device_code}/ota        - OTA update trigger
```

### Cloud Broker (Secondary)
```
cfarm.vn/{device_code}/cmd        - Nhận lệnh từ cloud server
cfarm.vn/{device_code}/heartbeat  - Gửi heartbeat lên cloud
cfarm.vn/{device_code}/ack        - ACK response
```

## Local Priority Lock

Khi nhận lệnh từ **local broker**, ESP32 set `lastLocalCommandTime = millis()`.

Khi nhận lệnh từ **cloud broker**, ESP32 kiểm tra:
```
elapsed = millis() - lastLocalCommandTime
if (elapsed < LOCAL_LOCK_MS) {
    // Local command đã gửi trong vòng 30s → REJECT cloud command
    return;
}
```

**`LOCAL_LOCK_MS = 30000`** (30 giây)

→ Cloud command chỉ được execute nếu không có local command trong 30s trước đó.

## Command Format

### Relay Control
```json
{
    "action": "relay",
    "channel": 1,
    "state": "on"  // hoặc "off"
}
```

### All Relays
```json
{
    "action": "all",
    "state": "on"  // hoặc "off"
}
```

### Ping
```json
{
    "action": "ping",
    "ts": 1234567890
}
```

### OTA Update
```json
{
    "action": "ota",
    "url": "http://192.168.1.9:8000/api/firmware/download/1",
    "version": "1.1.0",
    "checksum": "abc123..."
}
```

## Heartbeat Format

ESP32 gửi heartbeat mỗi **30 giây**:
```json
{
    "code": "esp32-01",
    "rssi": -50,
    "uptime": 12345,
    "heap": 224788
}
```

## Device Auto-Creation

### Local Server
Khi nhận heartbeat từ ESP32:
1. Kiểm tra device có tồn tại trong DB theo `mqtt_topic`
2. Nếu chưa có → INSERT device mới với thông tin từ heartbeat
3. UPDATE `is_online = true`, `last_heartbeat_at = now()`

### Cloud Server
Khi nhận `device_states` sync từ local:
1. Kiểm tra device có tồn tại theo `device_code`
2. Nếu chưa có → INSERT device mới
3. UPDATE thông tin nếu đã tồn tại

## Cloud Relay Control Flow

1. User bấm "Bật relay 1" trên cloud web UI
2. Cloud gửi MQTT message đến `cfarm.vn/{device_code}/cmd`
3. ESP32 nhận qua cloud MQTT callback
4. ESP32 execute relay command
5. ESP32 gửi ACK qua `cfarm.vn/{device_code}/ack`

## Configuration Constants (ESP32 Firmware)

```c
const char* DEVICE_CODE = "esp32-01";
const char* DEVICE_TYPE = "relay_8ch";

const char* LOCAL_MQTT_SERVER = "192.168.1.9";
const int LOCAL_MQTT_PORT = 1883;
const char* LOCAL_MQTT_USER = "cfarm_device";
const char* LOCAL_MQTT_PASS = "cfarm_device_2026";

const char* CLOUD_MQTT_SERVER = "103.166.183.215";
const int CLOUD_MQTT_PORT = 1883;
const char* CLOUD_MQTT_USER = "cfarm_server";
const char* CLOUD_MQTT_PASS = "Abc@@123";

const unsigned long HEARTBEAT_INTERVAL = 30000;
const unsigned long LOCAL_LOCK_MS = 30000;
```

## GPIO Pinout (8 Channel Relay)

```c
const int RELAY_PINS[8] = {18, 19, 21, 22, 23, 25, 26, 27};
```

- Relay ON: `digitalWrite(PIN, LOW)`
- Relay OFF: `digitalWrite(PIN, HIGH)`

## Device Code Naming Convention

Trên cloud database, `device_code` phải KHỚP với DEVICE_CODE trong ESP32 firmware.

** Ví dụ:**
- ESP32 firmware: `const char* DEVICE_CODE = "esp32-01";`
- Cloud DB: `device_code = 'esp32-01'`
- → ESP32 subscribe đúng topic `cfarm.vn/esp32-01/cmd`

Nếu không khớp → Cloud command không đến được ESP32.

## Sync: Local → Cloud

### Device States Push (5 phút/lần)
Local server push all devices states lên cloud qua `/api/sync/device-states`

```json
{
    "source": "local",
    "items": [{
        "device_code": "esp32-01",
        "name": "Bat01",
        "device_type_id": 2,
        "is_online": true,
        "firmware_version": "1.0.0",
        "ip_address": "192.168.1.100",
        "last_seen": "2026-04-03T10:00:00+07:00"
    }]
}
```

Cloud auto-creates device nếu chưa tồn tại.

## MQTT Broker Credentials

### Local (Mosquitto)
- Host: `192.168.1.9:1883`
- User: `cfarm_device`
- Pass: `cfarm_device_2026`

### Cloud (Mosquitto)
- Host: `103.166.183.215:1883`
- User: `cfarm_server`
- Pass: `Abc@@123`

## PHP MQTT Client (Cloud)

Cloud dùng `php-mqtt/client` composer package:
```php
use PhpMqtt\Client\MqttClient;
use PhpMqtt\Client\ConnectionSettings;

$client = new MqttClient('103.166.183.215', 1883, 'cfarm_web_' . uniqid());
$settings = (new ConnectionSettings)
    ->setUsername('cfarm_server')
    ->setPassword('Abc@@123')
    ->setKeepAliveInterval(30);
$client->connect($settings);
$client->publish('cfarm.vn/esp32-01/cmd', json_encode($payload));
```

## Troubleshooting

### ESP32 không nhận cloud command
1. Kiểm tra `device_code` khớp giữa firmware và cloud DB
2. Kiểm tra ESP32 đã subscribe `CLOUD_CMD_TOPIC`
3. Kiểm tra cloud MQTT broker credentials đúng
4. Kiểm tra `LOCAL_LOCK_MS` - có thể local command lock đang active

### Cloud không điều khiển được relay
1. Kiểm tra `php-mqtt/client` đã cài đặt: `composer require php-mqtt/client`
2. Kiểm tra cloud MQTT broker đang chạy
3. Kiểm tra `/api/iot/` route không bị redirect về login

### ESP32 heartbeat không update online status
1. Kiểm tra MQTT callback chạy đúng thread
2. Kiểm tra `start_queue_processor()` đã được gọi
3. Xem log: `tail -f server.log | grep MqttListener`
