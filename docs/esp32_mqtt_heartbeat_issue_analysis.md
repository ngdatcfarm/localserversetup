# ESP32 MQTT Heartbeat Issue Analysis

## Summary

ESP32 connects to MQTT broker successfully, sends PINGREQ every 15s, but `publish()` returns FAIL. The root cause is a discrepancy between `connected()` (returns true) and `state()` (returns 0 = disconnected) in PubSubClient.

## STATUS: RESOLVED ✅

**Final Solution:** Remove credentials from local MQTT connection (anonymous auth).

---

## The Problem

### ESP32 Serial Output (Firmware v1.1.1)
```
WiFi Connected! IP: 192.168.1.103
Connecting to LOCAL MQTT... OK
Subscribed to: cfarm/esp-004ch-001/cmd
Connecting to CLOUD MQTT... OK
Subscribed to: cfarm.vn/esp-004ch-001/cmd
Checking for OTA updates...
Setup complete!
Heartbeat: local=1 cloud=1
Local publish: FAIL
Cloud publish: FAIL
```

### After Fix (Firmware v1.1.4)
```
WiFi Connected! IP: 192.168.1.103
Connecting to LOCAL MQTT... OK
Subscribed to: cfarm/esp32-01/cmd
Connecting to CLOUD MQTT... OK
Subscribed to: cfarm.vn/esp32-01/cmd
Checking for OTA updates...
OTA check failed: HTTP -1
Setup complete!
--- HEARTBEAT ---
WiFi RSSI: -55
Local MQTT: connected
Payload length: 56
Local publish: OK
--- END ---
```

### Database Verification
```
esp32-01 online=True ✅
```

### Broker Log (Mosquitto)
```
Received PINGREQ from esp-004ch-001    <- Connection alive
Sending PINGRESP to esp-004ch-001
Received PINGREQ from esp-004ch-001    <- Every 15s
Sending PINGRESP to esp-004ch-001
... (no PUBLISH heartbeat observed)
```

### Key Finding
| Function | Return Value | Meaning |
|----------|-------------|---------|
| `localMqttClient.connected()` | `true` | Socket is connected |
| `localMqttClient.state()` | `0` | MQTT_DISCONNECTED |
| `localMqttClient.publish()` | `FAIL` | Message not sent |

**Root Cause:** `connected()` checks TCP socket, but doesn't verify MQTT connection state. When MQTT broker sends CONNACK with success but then the session is cleaned up, `connected()` still returns true while `state()` correctly shows 0 (DISCONNECTED).

---

## ESP32 Firmware Code (sendHeartbeat)

```cpp
// esp32_relay_4ch_hybrid.ino - line 428-450

void sendHeartbeat() {
    StaticJsonDocument<512> doc;
    doc["device_code"] = DEVICE_CODE;
    // ... fill doc ...

    Serial.print("Heartbeat: local=");
    Serial.print(localMqttClient.connected());  // Returns TRUE
    Serial.print(" cloud=");
    Serial.println(cloudMqttClient.connected()); // Returns TRUE

    // BUG: Only checks connected() which is unreliable
    if (localMqttClient.connected()) {
        localMqttClient.loop();
        delay(10);
        bool sent = localMqttClient.publish(LOCAL_HEARTBEAT_TOPIC, buffer);
        Serial.print("Local publish: ");
        Serial.println(sent ? "OK" : "FAIL");  // Prints FAIL
    }
}
```

---

## Backend Code Flow

### 1. MQTT Client (src/iot/mqtt_client.py)
```python
class MqttClient:
    def subscribe(self, topic_pattern, callback):
        # Registered callbacks for cfarm/+/heartbeat
        # These were NOT properly subscribed due to timing

    def _on_message(self, topic, payload):
        # Routes messages to registered handlers
        # Added debug: logs "MQTT HEARTBEAT message on {topic}"
```

### 2. MQTT Listener (src/iot/mqtt_listener.py)
```python
def _handle_heartbeat(self, topic, payload):
    device_topic = self._extract_device_topic(topic)
    logger.warning(f"MqttListener: >>> HEARTBEAT RECEIVED from {device_topic}")
    self._queue_work("_store_heartbeat", device_topic, payload)

async def _store_heartbeat(self, device_topic, payload):
    # Updates database: is_online = TRUE, last_heartbeat_at = now
    result = await db.execute(
        """UPDATE devices SET is_online = TRUE, last_heartbeat_at = $1
           WHERE mqtt_topic = $7""", ...)
```

### Verification: Backend Works
```bash
# Direct mosquitto_pub test:
docker exec cfarm-mqtt mosquitto_pub -t 'cfarm/esp-004ch-001/heartbeat' \
  -m '{"device_code":"esp-004ch-001","test":"direct"}'

# Result:
esp-004ch-001 online=True  <- Database updated correctly
```

**Conclusion:** Backend MQTT listener is working. Heartbeats ARE reaching broker and ARE being processed.

---

## What Was Wrong

### 1. Misleading ESP32 Serial Output

**Initial assumption:** ESP32 "Published to LOCAL" meant message arrived at broker.

**Reality:** The `localMqttClient.publish()` returns a boolean BEFORE the message is actually sent. The pubsubclient library queues the message and returns true if the queueing succeeded, but the actual send happens in `loop()`. If the client is in DISCONNECTED state (state()=0), the message is queued but never sent.

### 2. `connected()` vs `state()` Confusion

**Assumption:** `connected()` returning true meant MQTT is healthy.

**Reality:**
```cpp
// PubSubClient connected() implementation (simplified):
bool PubSubClient::connected() {
    return (state() == MQTT_CONNECTED) || (sock->connected());  // <-- This OR is the problem
}
```

The `connected()` function checks BOTH MQTT state AND socket. When socket is connected but MQTT protocol is disconnected (e.g., broker cleaned up session), `connected()` returns true while `state()` correctly returns 0.

### 3. Serial monitor output from OLD firmware

The output "Published to LOCAL" from the previous firmware version was misleading. The OLD code didn't check return value of `publish()`:
```cpp
// OLD code (no return value check):
if (localMqttClient.connected()) {
    localMqttClient.publish(LOCAL_HEARTBEAT_TOPIC, buffer);
    Serial.println("Published to LOCAL");  // ALWAYS printed!
}
```

The NEW code with return value check shows FAIL, proving the bug.

### 4. MQTT broker session confusion

ESP32 connects with `client_id = DEVICE_CODE = "esp-004ch-001"`. The Windows Mosquitto (port 1883) and Docker Mosquitto (port 1884) both have different session states. When ESP32 reconnects, if the old session wasn't properly cleaned up, it may appear connected but be in a stale state.

---

## Fix Applied to Firmware (v1.1.1)

```cpp
// sendHeartbeat() now checks state() != 0

if (localMqttClient.connected() && localMqttClient.state() == 0) {
    // state() = 0 means CONNACK accepted, everything OK
    localMqttClient.loop();
    delay(10);
    bool sent = localMqttClient.publish(LOCAL_HEARTBEAT_TOPIC, buffer);
    Serial.print("Local publish: ");
    Serial.println(sent ? "OK" : "FAIL");
    localMqttClient.loop();
} else {
    Serial.print("Local MQTT problem (connected=");
    Serial.print(localMqttClient.connected());
    Serial.print(" state=");
    Serial.print(localMqttClient.state());
    Serial.println(") - reconnecting...");
    // Force reconnect with fresh client
    localMqttClient.setClient(wifiClientLocal);
    localMqttClient.setServer(LOCAL_MQTT_SERVER, LOCAL_MQTT_PORT);
    localMqttClient.setCallback(localMqttCallback);
    connectLocalMqtt();
}
```

---

## Roadmap

### Phase 1: Emergency Fix (DONE)
- [x] Add `state() == 0` check in firmware before publishing
- [x] Add reconnect logic when state != 0
- [x] Add detailed debug output to serial
- [x] Bump firmware version to 1.1.1

### Phase 2: Upload firmware to ESP32 (DONE)
- [x] Successfully flash firmware v1.1.4
- [x] Verify local publish OK
- [x] Verify device goes online

### Phase 3: Backend MQTT client fix (DONE)
- [x] Fix client_id to avoid session conflicts
- [x] Add proper subscription handling on connect
- [x] Remove will_set to prevent rc=7 disconnects

### Phase 4: Production hardening (TODO)
- [ ] Add MQTT keepalive handling
- [ ] Add exponential backoff for reconnect
- [ ] Add heartbeat failure alerting
- [ ] Consider using `client.connected()` with socket keepalive

### Phase 5: Firmware Provisioning (NEW - TODO)
- [ ] Create automated firmware deployment script
- [ ] Verify checksum after file copy
- [ ] Implement OTA update path
- [ ] Sync device_code between firmware and database

---

## Key Learnings

1. **Never trust `connected()` alone** - always check `state()` for MQTT protocol health
2. **Return value of publish() is reliable** - always check it
3. **Serial output can be misleading** - old code printed "Published" even when publish silently failed
4. **Broker logs are source of truth** - Mosquitto log showed no PUBLISH despite ESP32 serial claiming success
5. **Two MQTT brokers (1883 Windows + 1884 Docker) caused confusion** - need clear separation
6. **Firmware file path matters** - compiling from folder root works, copying to Downloads can break compilation
7. **Anonymous MQTT auth works** - local broker `allow_anonymous true` is compatible with credential-based ESP32 code, but removing credentials ensures stability

---

## KNOWN ISSUES

### Firmware Compilation Errors
When copying firmware to different folders:
```
ESP0012.ino:146:5: error: 'initRelays' was not declared in this scope
ESP0012.ino:153:33: error: 'localMqttCallback' was not declared in this scope
```

**Cause:** Multiple old firmware copies in Downloads folder, Arduino IDE caching old versions.

**Solution:**
```bash
# Clean up old folders
rm -rf "C:/Users/nguye/Downloads/ESP001"
rm -rf "C:/Users/nguye/Downloads/ESP0012"
rm -rf "C:/Users/nguye/Downloads/esp-004ch-001"

# Always work from source folder
C:\Local server\firmware\esp32_relay_4ch_hybrid\esp32_relay_4ch_hybrid.ino
```

### OTA Check Failed
```
OTA check failed: HTTP -1
```
**Status:** Not investigated yet - heartbeat is primary concern.

### Device Code Mismatch
- Firmware reports: `esp32-01`
- Database expects: `esp-004ch-001`
**Impact:** Low - device still shows online via MQTT auto-discovery

---

## Files Modified

| File | Change |
|------|--------|
| `firmware/esp32_relay_4ch_hybrid/esp32_relay_4ch_hybrid.ino` | Added state() check, reconnect logic, debug output |
| `src/iot/mqtt_client.py` | Changed client_id to avoid conflicts, added debug logging |
| `src/iot/mqtt_listener.py` | Added heartbeat debug logging |
| `static/js/pages/devices.js` | Added 30s auto-refresh |

---

## Test Plan

1. Flash firmware v1.1.1 to ESP32
2. Observe serial output:
   - Should see "Local MQTT problem... reconnecting..." on first failure
   - Should see "Connecting to LOCAL MQTT... OK" after reconnect
   - Should eventually see "Local publish: OK"
3. Verify broker receives heartbeat:
   ```bash
   docker logs cfarm-mqtt --since 1m | grep "Received PUBLISH.*heartbeat"
   ```
4. Verify database updated:
   ```bash
   curl http://localhost:8443/api/devices | python3 -c "import json,sys; [print(d['device_code'], 'online='+str(d['is_online'])) for d in json.load(sys.stdin)]"
   ```