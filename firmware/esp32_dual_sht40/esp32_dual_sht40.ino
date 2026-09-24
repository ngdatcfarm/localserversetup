/**
 * =========================================================
 * CFarm ESP32 Dual-SHT40 Sensor Firmware — Mother Code v1.0.0
 * Date: 2026-09-19  (refactored: 2-bus I²C for retail SHT40-AD1B probes)
 *
 * One ESP32 + two SHT40 sensors on TWO SEPARATE hardware I²C buses.
 * Each SHT40 is reported as a separate "sub-sensor" via MQTT topic
 * suffix. ESP32 has 2 hardware I²C controllers (Wire / Wire1), so
 * we don't need a TCA9548A multiplexer even when both probes are
 * SHT40-AD1B at address 0x44.
 *
 * ── Why 2 buses (revised 2026-09-19) ───────────────────────
 *   SHT40 is a DFN-4 package — NO hardware ADDR pin (unlike SHT3x).
 *   The I²C address is fixed at the factory by order code:
 *     SHT40-AD1B → 0x44  (retail, common)
 *     SHT40-BD1B → 0x45  (rare, mostly chip-on-reel)
 *   Probe-style waterproof SHT40s ship sealed with no jumper.
 *   Buying 2 retail probes → both at 0x44 → MUST use separate buses.
 *
 * ── Wiring ─────────────────────────────────────────────────
 *   I²C BUS 1 (Wire)   SHT40-A
 *     GPIO 21 (SDA) ─── SDA
 *     GPIO 22 (SCL) ─── SCL
 *     3V3 ──────────── VIN
 *     GND ──────────── GND
 *
 *   I²C BUS 2 (Wire1)  SHT40-B
 *     GPIO 18 (SDA) ─── SDA
 *     GPIO 19 (SCL) ─── SCL
 *     3V3 ──────────── VIN
 *     GND ──────────── GND   (GND chung với BUS 1)
 *
 *   Both sensors at address 0x44 on separate buses → no conflict.
 *
 * ── Long-wire considerations (waterproof probes) ──────────
 *   I²C was designed for short PCB traces. With cable lengths >1m
 *   to remote probes, signal edges slow down due to capacitance.
 *   This firmware uses Wire.setClock(100000) — 100 kHz instead of
 *   the default 400 kHz — for robustness with long cables.
 *   If you still get intermittent I²C errors:
 *     - Add 4.7kΩ pull-ups on SDA/SCL close to the ESP32
 *       (in addition to any on-module pull-ups)
 *     - Keep cable <3m if possible
 *     - Use shielded cable or twist SDA with GND
 *
 * ── Topic layout ────────────────────────────────────────────
 *   cfarm/{code}/sensor/a       raw T/H from SHT40-A (bus 1, 0x44)
 *   cfarm/{code}/sensor/b       raw T/H from SHT40-B (bus 2, 0x44)
 *   cfarm/{code}/delta          derived T_A − T_B, H_A − H_B
 *   cfarm/{code}/meta           placement + bus address (retained)
 *   cfarm/{code}/heartbeat      parent-scoped, every 60s
 *   cfarm/{code}/cmd            subscribe: ping / ota
 *
 * ── Two purposes ───────────────────────────────────────────
 *   1. Regular barn environmental monitoring (T + H at two locations).
 *   2. Brooder-zone reference: server picks one sub-sensor as the PID
 *      input based on admin attachment.
 *
 * ── Failure handling ────────────────────────────────────────
 *   Per-sub-sensor:
 *     - 0–2 consecutive fails → publish with quality="GOOD" (one-off glitch)
 *     - 3–9 consecutive fails → publish with quality="DEGRADED"
 *     - 10+ consecutive fails → quality="BAD", stop publishing (still heartbeat)
 *     - 5+ total fails in window → I²C bus recovery per bus (toggle SDA/SCL)
 *
 * ── Reliability features ────────────────────────────────────
 *   - SHT40 internal heater 30s every 30min (kicks condensation)
 *   - Hardware watchdog 120s (panic = reboot)
 *   - MQTT auto-reconnect
 *   - WiFi auto-reconnect
 *
 * ── OTA ─────────────────────────────────────────────────────
 *   Subscribe to cfarm/{code}/cmd.
 *   Payload {"action": "ota", "url": "https://..."} triggers OTA:
 *     1. Disconnect MQTT (free heap)
 *     2. HTTP GET the .bin
 *     3. Update.write() in 1 KB chunks with WDT reset
 *     4. Update.end() → ESP.restart()
 *
 * ── Cloud MQTT ──────────────────────────────────────────────
 *   Disabled by default (local-first for brooder data).
 *   Set USE_CLOUD_MQTT=1 if you want a redundant cloud mirror.
 *
 * Place this file at firmware/esp32_dual_sht40/esp32_dual_sht40.ino.
 * =========================================================
 */

#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_SHT4x.h>
#include <HTTPClient.h>
#include <Update.h>
#include <esp_task_wdt.h>
#include <esp_system.h>

// ======================================================
// USER CONFIG — change per device
// ======================================================

const char* WIFI_SSID     = "Dat Lim";
const char* WIFI_PASSWORD = "hoilamgi";

const char* DEVICE_CODE = "esp32-6796";
const char* DEVICE_TYPE = "dual_sht40";

// MQTT (local — required)
const char* MQTT_SERVER   = "192.168.1.9";
const int   MQTT_PORT     = 1884;
const char* MQTT_USER     = "cfarm_device";
const char* MQTT_PASS     = "cfarm_device_2026";

// Cloud MQTT (optional — only if USE_CLOUD_MQTT = 1)
#define USE_CLOUD_MQTT 0
#if USE_CLOUD_MQTT
const char* CLOUD_MQTT_SERVER = "103.166.183.215";
const int   CLOUD_MQTT_PORT   = 1883;
const char* CLOUD_MQTT_USER   = "cfarm_server";
const char* CLOUD_MQTT_PASS   = "Abc@@123";
#endif

// Firmware
// v1.0.2: add MQTT Last-Will-and-Testament on cfarm/{code}/lwt so the
//         server gets a sub-second offline signal instead of waiting
//         180s for the heartbeat-staleness sweep.
const char* FIRMWARE_VERSION = "1.0.2";
const char* FIRMWARE_NAME    = "esp32_dual_sht40";

// ======================================================
// PINS
// ======================================================

// Two separate I²C buses — required for retail SHT40-AD1B probes
// (both at address 0x44; can't be on the same bus).
#define I2C_SDA_1    21    // BUS 1 (Wire)  — SHT40-A
#define I2C_SCL_1    22
#define I2C_SDA_2    18    // BUS 2 (Wire1) — SHT40-B
#define I2C_SCL_2    19
#define STATUS_LED   2

// ======================================================
// TIMING
// ======================================================

const unsigned long SENSOR_INTERVAL_MS    = 10000;   // 10s per sub-sensor
const unsigned long HEARTBEAT_INTERVAL_MS  = 60000;   // 60s
const unsigned long META_PUBLISH_MS       = 300000;  // 5min (retained)
const unsigned long DELTA_PUBLISH_MS      = 20000;   // 20s — derived delta stream
const unsigned long SHT40_HEATER_MS       = 1800000; // 30min — kick condensation
const unsigned long SHT40_HEATER_DURATION = 30000;   // 30s on-time
const unsigned long WIFI_RETRY_MS         = 10000;
const unsigned long MQTT_RETRY_MS         = 5000;
const unsigned long WDT_TIMEOUT_S         = 120;     // 2min watchdog

// Quality thresholds
const uint8_t MAX_DEGRADED_FAILS = 3;        // 3 consecutive → DEGRADED
const uint8_t MAX_BAD_FAILS      = 10;       // 10 consecutive → BAD

// ======================================================
// I²C ADDRESSES (auto-detected at boot per bus)
// ======================================================

// Both retail SHT40-AD1B probes are at 0x44. The bus number keeps them
// separate (bus 1 and bus 2 are physically different pins/wires), so the
// identical address is not a conflict.
//
// If you somehow have one SHT40-BD1B probe (0x45), you can keep it on
// bus 2 and change SHT40_ADDR_SECONDARY to 0x45 — but bus 1 stays 0x44.
// Just note that mixing addresses still works because the buses are
// independent; this is here for documentation only.
const uint8_t SHT40_ADDR_PRIMARY   = 0x44;    // SHT40-A on BUS 1 (Wire)
const uint8_t SHT40_ADDR_SECONDARY = 0x44;    // SHT40-B on BUS 2 (Wire1)

// ======================================================
// OBJECTS
// ======================================================

Adafruit_SHT4x sht4a;
Adafruit_SHT4x sht4b;

WiFiClient wifiClient;
PubSubClient mqtt(wifiClient);

#if USE_CLOUD_MQTT
WiFiClient wifiClientCloud;
PubSubClient mqttCloud(wifiClientCloud);
#endif

// ======================================================
// SUB-SENSOR STATE
// ======================================================

enum Quality { GOOD, DEGRADED, BAD };

struct SubSensor {
    TwoWire* bus;             // Wire or Wire1 — independent I²C controllers
    Adafruit_SHT4x* sht;
    uint8_t addr;
    const char* sub;          // "a" or "b"
    const char* placement;    // "floor" / "ceiling" — for metadata
    bool present;             // Detected at boot
    uint32_t last_good_ms;
    uint8_t consecutive_fails;
    uint32_t total_fails;
    Quality quality;
    float last_temp;
    float last_humidity;
};

// SHT40-A → BUS 1 (Wire, GPIO 21/22) — chick-level reference
SubSensor sensorA = {
    &Wire, &sht4a, SHT40_ADDR_PRIMARY,   "a", "floor",   false, 0, 0, 0, GOOD, 0, 0
};
// SHT40-B → BUS 2 (Wire1, GPIO 18/19) — second probe (ceiling/zone-B/...)
SubSensor sensorB = {
    &Wire1, &sht4b, SHT40_ADDR_SECONDARY, "b", "ceiling", false, 0, 0, 0, GOOD, 0, 0
};

unsigned long lastSensorMs     = 0;
unsigned long lastHeartbeatMs  = 0;
unsigned long lastMetaMs       = 0;
unsigned long lastHeaterMs     = 0;
unsigned long lastDeltaMs      = 0;
unsigned long lastWifiRetryMs  = 0;
unsigned long lastMqttRetryMs  = 0;

// OTA
bool otaPending = false;
char otaUrl[256];

// Topics
char TOPIC_CMD[64];
char TOPIC_SENSOR_A[64];
char TOPIC_SENSOR_B[64];
char TOPIC_HEARTBEAT[64];
char TOPIC_META[64];
char TOPIC_DELTA[64];
char TOPIC_LWT[64];

// ======================================================
// HELPERS
// ======================================================

bool scanI2CAddress(TwoWire* bus, uint8_t addr) {
    bus->beginTransmission(addr);
    return (bus->endTransmission() == 0);
}

const char* qualityToString(Quality q) {
    switch (q) {
        case GOOD:     return "GOOD";
        case DEGRADED: return "DEGRADED";
        case BAD:      return "BAD";
        default:       return "UNKNOWN";
    }
}

bool initSubSensor(SubSensor& s, const char* kind) {
    // Each sub-sensor carries its own bus pointer so this works on both
    // Wire (bus 1, GPIO 21/22) and Wire1 (bus 2, GPIO 18/19).
    s.present = scanI2CAddress(s.bus, s.addr);
    if (!s.present) {
        Serial.printf("WARN: %s SHT40 @ 0x%02X not detected on its bus\n",
                      kind, s.addr);
        s.quality = BAD;
        return false;
    }
    // Adafruit_SHT4x.begin(TwoWire*) — initialize the library on the
    // correct bus (default is &Wire if you call begin() with no arg).
    if (!s.sht->begin(s.bus)) {
        Serial.printf("WARN: %s SHT40 @ 0x%02X begin() failed\n", kind, s.addr);
        s.quality = BAD;
        return false;
    }
    s.sht->setPrecision(SHT4X_HIGH_PRECISION);
    Serial.printf("OK:   %s SHT40 ready @ 0x%02X (placement=%s, HIGH_PRECISION)\n",
                  kind, s.addr, s.placement);
    s.quality = GOOD;
    return true;
}

bool readSubSensor(SubSensor& s, float& temp, float& humidity) {
    if (!s.present) return false;

    sensors_event_t humEvent, tempEvent;
    if (!s.sht->getEvent(&humEvent, &tempEvent)) {
        s.consecutive_fails++;
        s.total_fails++;
        if (s.consecutive_fails >= MAX_BAD_FAILS) {
            Serial.printf("WARN: sub_sensor=%s marked BAD after %u consecutive fails\n",
                          s.sub, s.consecutive_fails);
            s.quality = BAD;
        } else if (s.consecutive_fails >= MAX_DEGRADED_FAILS) {
            if (s.quality != DEGRADED) {
                Serial.printf("WARN: sub_sensor=%s → DEGRADED (%u consecutive fails)\n",
                              s.sub, s.consecutive_fails);
            }
            s.quality = DEGRADED;
        }
        return false;
    }

    // Good read
    s.last_good_ms = millis();
    s.last_temp = tempEvent.temperature;
    s.last_humidity = humEvent.relative_humidity;
    s.consecutive_fails = 0;
    s.quality = GOOD;
    temp = s.last_temp;
    humidity = s.last_humidity;
    return true;
}

void buildTopics() {
    snprintf(TOPIC_CMD,       sizeof(TOPIC_CMD),       "cfarm/%s/cmd",         DEVICE_CODE);
    snprintf(TOPIC_SENSOR_A,  sizeof(TOPIC_SENSOR_A),  "cfarm/%s/sensor/a",    DEVICE_CODE);
    snprintf(TOPIC_SENSOR_B,  sizeof(TOPIC_SENSOR_B),  "cfarm/%s/sensor/b",    DEVICE_CODE);
    snprintf(TOPIC_HEARTBEAT, sizeof(TOPIC_HEARTBEAT), "cfarm/%s/heartbeat",   DEVICE_CODE);
    snprintf(TOPIC_META,      sizeof(TOPIC_META),      "cfarm/%s/meta",        DEVICE_CODE);
    snprintf(TOPIC_DELTA,     sizeof(TOPIC_DELTA),     "cfarm/%s/delta",       DEVICE_CODE);
    snprintf(TOPIC_LWT,       sizeof(TOPIC_LWT),       "cfarm/%s/lwt",         DEVICE_CODE);
}

// ======================================================
// WIFI / MQTT
// ======================================================

void connectWiFi() {
    if (WiFi.status() == WL_CONNECTED) return;
    if (millis() - lastWifiRetryMs < WIFI_RETRY_MS) return;
    lastWifiRetryMs = millis();
    Serial.println("WIFI: reconnecting...");
    WiFi.disconnect(true);
    delay(100);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

void connectMqtt() {
    if (WiFi.status() != WL_CONNECTED) return;
    if (mqtt.connected()) return;
    if (millis() - lastMqttRetryMs < MQTT_RETRY_MS) return;
    lastMqttRetryMs = millis();
    wifiClient.stop();
    Serial.println("MQTT: connecting local...");
    // LWT payload — broker auto-publishes this when our session ends
    // unexpectedly (WiFi drop, power loss, watchdog reset). The server
    // subscribes cfarm/+/lwt and flips devices.is_online=FALSE on receipt,
    // giving a sub-second offline signal instead of waiting for the
    // 180s heartbeat-staleness sweep.
    char lwtPayload[160];
    snprintf(lwtPayload, sizeof(lwtPayload),
             "{\"status\":\"offline\",\"device_code\":\"%s\"}", DEVICE_CODE);
    if (mqtt.connect(DEVICE_CODE, MQTT_USER, MQTT_PASS,
                     TOPIC_LWT, 1, true, lwtPayload)) {
        Serial.println("MQTT: local connected");
        mqtt.subscribe(TOPIC_CMD);
    } else {
        Serial.printf("MQTT: local FAIL rc=%d\n", mqtt.state());
    }
}

// ======================================================
// COMMAND HANDLER (ping / ota)
// ======================================================

void performOta(const char* url) {
    Serial.printf("OTA: starting download from %s\n", url);
    mqtt.disconnect();

    HTTPClient http;
    if (!http.begin(url)) {
        Serial.println("OTA: URL invalid");
        return;
    }
    int httpCode = http.GET();
    if (httpCode != HTTP_CODE_OK) {
        Serial.printf("OTA: HTTP %d\n", httpCode);
        http.end();
        return;
    }
    int contentLength = http.getSize();
    if (contentLength <= 0 || !Update.begin(contentLength)) {
        Serial.println("OTA: invalid size or begin() failed");
        http.end();
        return;
    }

    WiFiClient* stream = http.getStreamPtr();
    uint8_t buf[1024];
    int written = 0;
    while (http.connected() && written < contentLength) {
        esp_task_wdt_reset();
        int avail = stream->available();
        if (avail > 0) {
            int readBytes = stream->readBytes(buf, min(avail, (int)sizeof(buf)));
            if (readBytes > 0) {
                Update.write(buf, readBytes);
                written += readBytes;
            }
        }
        delay(1);
    }
    if (!Update.end() || !Update.isFinished()) {
        Serial.println("OTA: write incomplete");
        http.end();
        return;
    }
    Serial.println("OTA: success, restarting in 1s");
    http.end();
    delay(1000);
    ESP.restart();
}

void handleCommand(JsonDocument& doc) {
    const char* action = doc["action"] | "";
    if (strcmp(action, "ping") == 0) {
        Serial.println("CMD: ping");
        return;
    }
    if (strcmp(action, "ota") == 0) {
        const char* url = doc["url"] | "";
        if (strlen(url) > 0) {
            strncpy(otaUrl, url, sizeof(otaUrl));
            otaPending = true;
            Serial.println("CMD: OTA queued");
        }
    }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, payload, length) == DeserializationError::Ok) {
        handleCommand(doc);
    }
}

// ======================================================
// PUBLISHERS
// ======================================================

void publishSensor(SubSensor& s, const char* topic) {
    // Don't pollute DB with BAD-quality readings — but still publish
    // DEGRADED so server can show a warning chip in the UI.
    if (!s.present || s.quality == BAD) return;

    float t, h;
    if (!readSubSensor(s, t, h)) return;

    StaticJsonDocument<256> doc;
    doc["device_code"]  = DEVICE_CODE;
    doc["sub_sensor"]   = s.sub;
    doc["temperature"]  = t;
    doc["humidity"]     = h;
    doc["quality"]      = qualityToString(s.quality);
    doc["rssi"]         = WiFi.RSSI();
    doc["timestamp"]    = millis();

    char buf[256];
    serializeJson(doc, buf);

    if (mqtt.connected()) {
        mqtt.publish(topic, buf);
    }
    Serial.printf("PUB sensor/%s T=%.2f H=%.2f q=%s\n",
                  s.sub, t, h, qualityToString(s.quality));
}

void publishHeartbeat() {
    StaticJsonDocument<512> doc;
    doc["device_code"]      = DEVICE_CODE;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["firmware_name"]    = FIRMWARE_NAME;
    doc["device_type"]      = DEVICE_TYPE;
    doc["uptime_seconds"]   = millis() / 1000;
    doc["wifi_rssi"]        = WiFi.RSSI();
    doc["free_heap"]        = ESP.getFreeHeap();
    doc["ip_address"]       = WiFi.localIP();
    doc["local_mqtt"]       = mqtt.connected();

    uint8_t present_bits = 0;
    if (sensorA.present) present_bits |= 0b01;
    if (sensorB.present) present_bits |= 0b10;
    doc["sub_sensors_present"] = present_bits;

    JsonObject subs = doc.createNestedObject("sub_sensor_health");
    subs["a"] = qualityToString(sensorA.quality);
    subs["b"] = qualityToString(sensorB.quality);

    JsonObject totals = doc.createNestedObject("sub_sensor_total_fails");
    totals["a"] = sensorA.total_fails;
    totals["b"] = sensorB.total_fails;

    char buf[512];
    serializeJson(doc, buf);
    if (mqtt.connected()) mqtt.publish(TOPIC_HEARTBEAT, buf);
    Serial.println("PUB heartbeat");
}

void publishMeta() {
    StaticJsonDocument<512> doc;
    doc["device_code"]      = DEVICE_CODE;
    doc["firmware_version"] = FIRMWARE_VERSION;

    JsonArray subs = doc.createNestedArray("sub_sensors");
    {
        JsonObject sa = subs.createNestedObject();
        sa["sub"]       = "a";
        sa["addr"]      = "0x44";
        sa["placement"] = sensorA.placement;
        sa["present"]   = sensorA.present;
    }
    {
        JsonObject sb = subs.createNestedObject();
        sb["sub"]       = "b";
        sb["addr"]      = "0x44";     // both retail probes at 0x44 (different buses)
        sb["placement"] = sensorB.placement;
        sb["present"]   = sensorB.present;
    }

    char buf[512];
    serializeJson(doc, buf);
    if (mqtt.connected()) mqtt.publish(TOPIC_META, buf, true);  // retained
    Serial.println("PUB meta (retained)");
}

void publishDelta() {
    // Derived T_A − T_B for brooder stratification / heater-cycle detection.
    // Skip if either sensor is missing or has no recent good reading.
    if (!sensorA.present || !sensorB.present) return;
    if (sensorA.last_good_ms == 0 || sensorB.last_good_ms == 0) return;
    if (sensorA.quality == BAD || sensorB.quality == BAD) return;

    StaticJsonDocument<256> doc;
    doc["device_code"]    = DEVICE_CODE;
    doc["temp_delta_c"]   = sensorA.last_temp - sensorB.last_temp;
    doc["hum_delta_pct"]  = sensorA.last_humidity - sensorB.last_humidity;
    doc["temp_a"]         = sensorA.last_temp;
    doc["temp_b"]         = sensorB.last_temp;
    doc["quality_a"]      = qualityToString(sensorA.quality);
    doc["quality_b"]      = qualityToString(sensorB.quality);
    doc["timestamp"]      = millis();

    char buf[256];
    serializeJson(doc, buf);
    if (mqtt.connected()) mqtt.publish(TOPIC_DELTA, buf);
    Serial.printf("PUB delta T_A-T_B=%.2f H_A-H_B=%.2f\n",
                  doc["temp_delta_c"].as<float>(),
                  doc["hum_delta_pct"].as<float>());
}

// ======================================================
// I²C BUS RECOVERY
// ======================================================

void recoverBus(TwoWire* bus, int sda_pin, int scl_pin, const char* name) {
    Serial.printf("I2C %s: bus recovery (9 clock cycles)\n", name);
    bus->end();
    pinMode(sda_pin, OUTPUT_OPEN_DRAIN);
    pinMode(scl_pin, OUTPUT_OPEN_DRAIN);
    digitalWrite(sda_pin, HIGH);
    digitalWrite(scl_pin, HIGH);
    delay(1);
    for (int i = 0; i < 9; i++) {
        digitalWrite(scl_pin, LOW);
        delayMicroseconds(5);
        digitalWrite(scl_pin, HIGH);
        delayMicroseconds(5);
    }
    bus->begin(sda_pin, scl_pin);
    bus->setClock(100000);  // restore the 100 kHz cap (long-wire friendly)
    Serial.printf("I2C %s: bus recovered\n", name);
}

void recoverI2C() {
    // Recover both buses — called when both sensors have high fail counts.
    // The fix for one bus won't necessarily fix the other.
    recoverBus(&Wire,  I2C_SDA_1, I2C_SCL_1, "BUS1");
    recoverBus(&Wire1, I2C_SDA_2, I2C_SCL_2, "BUS2");
}

// ======================================================
// SHT40 INTERNAL HEATER (anti-condensation)
// ======================================================

void runHeaterCycle() {
    if (!sensorA.present && !sensorB.present) return;
    Serial.println("SHT40: heater cycle start (kicks condensation)");
    if (sensorA.present) {
        if (sensorA.quality != BAD) sht4a.setHeater(SHT4X_HIGH_HEATER_1S);
        delay(1000);
    }
    if (sensorB.present) {
        if (sensorB.quality != BAD) sht4b.setHeater(SHT4X_HIGH_HEATER_1S);
        delay(1000);
    }
    // Wait for condensation to dissipate before resuming normal reads
    delay(SHT40_HEATER_DURATION);
    Serial.println("SHT40: heater cycle complete");
}

// ======================================================
// SETUP
// ======================================================

void setup() {
    Serial.begin(115200);
    pinMode(STATUS_LED, OUTPUT);
    digitalWrite(STATUS_LED, LOW);

    Serial.println();
    Serial.println("=== CFarm Dual-SHT40 Mother v1.0.0 ===");
    Serial.printf("Device: %s (type=%s)\n", DEVICE_CODE, DEVICE_TYPE);

    buildTopics();

    // I²C buses — two separate hardware controllers on ESP32.
    // 100 kHz (vs default 400 kHz) for robustness with long probe cables.
    // init with clock param: Wire.begin(SDA, SCL, frequency).
    Wire.begin(I2C_SDA_1, I2C_SCL_1, 100000);
    Wire1.begin(I2C_SDA_2, I2C_SCL_2, 100000);

    // SHT40 — auto-detect on each bus. Tolerates single-sensor fallback
    // (the missing sub marks BAD, the other keeps publishing).
    initSubSensor(sensorA, "A");
    initSubSensor(sensorB, "B");

    // WiFi
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(false);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    // MQTT
    mqtt.setServer(MQTT_SERVER, MQTT_PORT);
    mqtt.setCallback(mqttCallback);
    // keepalive 60s → broker timeout ~90s. Was 15s which caused LWT spam
    // when telemetry jitter delayed PINGREQ, marking ESP offline every ~22s.
    // Trade-off: offline detection latency ~90s (was ~22s); acceptable for
    // sensors whose data freshness is the primary signal anyway.
    mqtt.setKeepAlive(60);
    mqtt.setSocketTimeout(3);
    mqtt.setBufferSize(512);

    #if USE_CLOUD_MQTT
    mqttCloud.setServer(CLOUD_MQTT_SERVER, CLOUD_MQTT_PORT);
    mqttCloud.setCallback(mqttCallback);
    #endif

    // Watchdog — panic = reboot on hang
    esp_task_wdt_config_t wdt_config = {
        .timeout_ms = WDT_TIMEOUT_S * 1000,
        .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
        .trigger_panic = true
    };
    esp_task_wdt_init(&wdt_config);
    esp_task_wdt_add(NULL);

    Serial.println("Setup complete. Entering loop.\n");
}

// ======================================================
// LOOP
// ======================================================

void loop() {
    esp_task_wdt_reset();
    unsigned long now = millis();

    // WiFi / MQTT keepalive
    if (WiFi.status() != WL_CONNECTED) {
        digitalWrite(STATUS_LED, LOW);
        connectWiFi();
    } else {
        digitalWrite(STATUS_LED, HIGH);
    }
    connectMqtt();
    mqtt.loop();

    // OTA (disconnects MQTT during flash, frees heap)
    if (otaPending) {
        otaPending = false;
        performOta(otaUrl);
    }

    // Sensor reads — independent per sub-sensor
    if (now - lastSensorMs >= SENSOR_INTERVAL_MS) {
        lastSensorMs = now;
        publishSensor(sensorA, TOPIC_SENSOR_A);
        publishSensor(sensorB, TOPIC_SENSOR_B);
    }

    // Derived delta stream — for brooder stratification / heater-cycle
    if (now - lastDeltaMs >= DELTA_PUBLISH_MS) {
        lastDeltaMs = now;
        publishDelta();
    }

    // Heartbeat — single message covers both sub-sensors
    if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
        lastHeartbeatMs = now;
        publishHeartbeat();
    }

    // Metadata (retained) — placement + addresses, every 5 min
    if (now - lastMetaMs >= META_PUBLISH_MS) {
        lastMetaMs = now;
        publishMeta();
    }

    // SHT40 internal heater — kick condensation in humid barns
    if (now - lastHeaterMs >= SHT40_HEATER_MS) {
        lastHeaterMs = now;
        runHeaterCycle();
    }

    // Bus recovery — if both sensors hit high fail count, recover bus
    if (sensorA.total_fails > 0 && sensorB.total_fails > 0
        && (sensorA.total_fails % 5 == 0 || sensorB.total_fails % 5 == 0)) {
        recoverI2C();
    }

    delay(1);
}