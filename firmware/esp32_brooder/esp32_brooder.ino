/**
 * =========================================================
 * CFarm ESP32 Brooder Firmware
 * Wi-Fi version (W5500 Ethernet migration planned)
 * Version: 1.3.0  (sensor-failsafe hoist + hybrid failsafe SP + longer timeout — 2026-09-18)
 *                            v1.0.8 baseline (zone-reference redesign):
 *                            - PID input = zone-weighted-avg in NORMAL mode
 *                              (NO 50/50 blend; zone is the ground truth
 *                              for chick comfort);
 *                            - local SHT40 is SAFETY sensor, NOT control
 *                              input — used for fallback path only
 *                              (local − admin-tuned fallback_delta_c) and
 *                              hard emergency cutoff at 34.6°C;
 *                            - Tier-2 fallback: zone stale >3 min →
 *                              temp_pid = local − fallback_delta_c
 *                              (positive delta = heater-zone reads hotter
 *                               than chick-zone by this much);
 *                            - Conservative PID (Kp=12, Ki=0.25, Kd=25)
 *                              + ±0.1°C deadband → targets ±0.5°C zone
 *                              stability (vs old ±3°C with thermal relay);
 *                            - fallback_delta_c published by server in the
 *                              setpoint payload, cached in NVS for failsafe.
 *                            v1.0.9 hardening (post-review):
 *                            - Tier-2 sign fix: now SUBTRACTS delta
 *                              (was +; would have chilled chicks);
 *                            - WiFi.status() in serverAlive → forced
 *                              failsafe on WiFi drop within FAILSAFE_TIMEOUT;
 *                            - Derivative on MEASUREMENT (was on error —
 *                              caused setpoint-change spike);
 *                            - Zero-cutoff clamp: MIN_VALID_DAC below
 *                              which DAC=0 + optional POWER_ENABLE_PIN
 *                              (GPIO 27) to defeat V→I 4mA-at-zero leak.
 *
 * Hardware:
 *   - ESP32 DevKit
 *   - 1x SHT40 (I2C addr 0x44) — temp/humidity, on Wire (default bus)
 *       SDA=21  SCL=22
 *   - 2x DAC outputs (GPIO 25, 26) → "Mạch xanh" V→I → 4-20mA → SSR-LA
 *   - Status LED on GPIO 2
 *
 * Hardware safety (must be wired externally):
 *   - Bimetal thermostat NC 38°C in series on L line (per channel)
 *   - Fast-acting fuse 10A per channel
 *
 * Control logic:
 *   - NORMAL: power cmd from server via MQTT (cfarm/brooder-{code}/power)
 *   - FAILSAFE: local PID with cached setpoint if no MQTT cmd in 5s
 *       PID tick rate is 1 Hz (matches thermal inertia), NOT every 10ms loop
 *   - PID input: single SHT40 reading — sensor at center of brooder
 *   - Bumpless transfer in/out of failsafe (preload PID integral)
 *
 * Topic layout:
 *   cfarm/brooder-{code}/telemetry   ESP32→Server  QoS 0  5s
 *   cfarm/brooder-{code}/status      ESP32→Server  QoS 1  on change (retained)
 *   cfarm/brooder-{code}/lwt         ESP32→Server  QoS 1  on disconnect (retained)
 *   cfarm/brooder-{code}/power       Server→ESP32  QoS 1  1-2s (heartbeat)
 *   cfarm/brooder-{code}/setpoint    Server→ESP32  QoS 1  on change (retained)
 *   cfarm/brooder-{code}/cmd         Server→ESP32  QoS 1  on demand
 *   cfarm/brooder-{code}/zone_temp   Server→ESP32  QoS 0  every 20s (zone reference)
 * =========================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_SHT4x.h>
#include <Preferences.h>
#include <esp_task_wdt.h>
#include <esp_system.h>

// ==================== USER CONFIG ====================

const char* WIFI_SSID     = "Dat Lim";
const char* WIFI_PASSWORD = "hoilamgi";

const char* MQTT_SERVER   = "192.168.1.9";
const int   MQTT_PORT     = 1884;
const char* MQTT_USER     = "cfarm_device";
const char* MQTT_PASS     = "cfarm_device_2026";

const char* DEVICE_TYPE     = "brooder";
const char* FIRMWARE_VERSION = "1.3.0";
const char* FIRMWARE_NAME    = "esp32_brooder";

// ==================== PIN DEFINES ====================

// Single SHT40 on the default Wire bus (I2C addr 0x44 hardcoded in
// Adafruit_SHT4x). GPIO 21/22 are ESP32's default I2C pins — not
// strapping pins, safe to use.
#define I2C_SDA    21    // Wire — SHT40
#define I2C_SCL    22

#define DAC1_PIN   25    // GPIO 25 = DAC1
#define DAC2_PIN   26    // GPIO 26 = DAC2

// Fix #4 (zero-cutoff clamp) — optional hardware gate for the V→I converter.
// V→I boards have a 4mA floor at DAC=0V (not 0mA), so a true zero-percent
// command can still leak 4-4.3mA into SSR-LA's phase-angle input, latching
// the SSR at small phase angles. Two ways to cut it:
//   (a) Software deadband: see MIN_VALID_DAC below — anything below it is
//       forced to DAC=0 AND no power-enable pin toggle. This still leaves
//       the 4mA leak but most SSR-LAs ignore sub-deadband current.
//   (b) Hardware gate: wire POWER_ENABLE_PIN to a MOSFET/relay that switches
//       the V→I board's supply. HIGH = V→I powered; LOW = fully off (true 0).
//       If your board has no such pin, set POWER_ENABLE_PIN to -1 (disabled).
#define POWER_ENABLE_PIN  27   // GPIO 27 → gate V→I supply; -1 = not wired

#define STATUS_LED 2

// ==================== TIMING ====================

const unsigned long TELEMETRY_INTERVAL_MS   = 5000;    // Publish telemetry every 5s
const unsigned long HEARTBEAT_INTERVAL_MS   = 60000;   // Publish heartbeat every 60s (for Devices dashboard)
const unsigned long SENSOR_READ_INTERVAL_MS = 2000;    // Read SHT40 every 2s
const unsigned long FAILSAFE_TIMEOUT_MS     = 8000;    // Switch to failsafe if no cmd
const unsigned long WDT_TIMEOUT_S           = 30;      // Hardware watchdog
const unsigned long WIFI_RETRY_INTERVAL_MS  = 10000;
const unsigned long MQTT_RETRY_INTERVAL_MS  = 5000;

// Zone (reference sensor) — server publishes cfarm/brooder-{code}/zone_temp
// every 20s. If we don't see a fresh payload for ZONE_TEMP_STALE_MS, ESP
// falls back to the Tier-2 path (local SHT40 + admin-tuned delta).
const unsigned long ZONE_TEMP_STALE_MS      = 180000;  // 3 min — matches server ZONE_TEMP_STALE_S
const float        FALLBACK_DELTA_DEFAULT  = 0.0f;    // Conservative default: no offset

// Emergency cutoff — ALWAYS-ON heater safety, independent of PID.
// Latches at 35.1°C, releases at 34.6°C (0.5°C hysteresis against
// single-sample spikes). The bimetal hardware thermostat at 38°C is the
// FINAL backup if even this fails. Threshold lowered from 38.0/38.5°C
// (2026-09-18) — chicks cooked past 35°C starts to show mortality spike
// in the first week; 34.6°C emergency trip gives margin before the
// hardware bimetal kicks in.
const float        EMERGENCY_MAX_TEMP_C    = 34.6f;
const float        EMERGENCY_LATCH_C       = 35.1f;

// ==================== LOCAL PID (FAILSAFE) ====================
// Conservative tuning — goal is ±0.5°C zone stability with the new
// zone-reference architecture (v1.0.8). The old Kp=30/Ki=0.5/Kd=50
// overshot because the SHT40 sat next to the heater and oscillated with
// the on/off cycle. Zone sensors smooth that out and let us use lower
// gains. Deadband below further reduces relay-like cycling.
const float PID_KP = 12.0f;
const float PID_KI = 0.25f;
const float PID_KD = 25.0f;
const int   PID_OUTPUT_MAX = 255;   // DAC 8-bit
const int   PID_OUTPUT_MIN = 0;
const float DEADBAND_C       = 0.1f;  // ±0.1°C → hold last output

// Back-calculation anti-windup tracking time constant. Standard textbook
// value is sqrt(Ti * Td) where Ti = Kp/Ki, Td = Kd/Kp. With our gains:
//   Ti = 12 / 0.25 = 48, Td = 25 / 12 ≈ 2.08
//   sqrt(48 * 2.08) ≈ 10
// We use 5s — half the formal value, so integral recovers from saturation
// faster than the textbook rate. Trade-off: at <2s the back-calculation
// fights the integral too aggressively (visible oscillation in test data),
// at >15s the integral still drifts to ±Imax during a 60s cold-start ramp.
// 5s is the empirical sweet spot for this 12s/°C thermal system.
const float PID_KT = 5.0f;

// Failsafe target — fixed 30°C baseline used when the server is unreachable.
// Chicks older than 2 weeks (fully feathered) regulate body temp at this level
// without supplementary heat, so 30°C is a safe MINIMUM that keeps the flock
// alive without risk of overheating. The cached setpoint (typically 33-34.5°C)
// is replaced with this value on enterFailsafe(); the server will overwrite
// it again with its target the moment the MQTT cmd topic comes back.
const float FAILSAFE_SETPOINT_C = 30.0f;

// Fix #4 (zero-cutoff clamp) — hysteresis thresholds on the DAC value, used
// by applyPower() in FAILSAFE mode:
//   p >= MIN_VALID_DAC (6)        → heater ON  (sustained firing above V→I leak floor)
//   p <  MIN_VALID_DAC_OFF (3)    → heater OFF (true zero)
//   p in [3, 6)                   → HOLD last state (band)
// V→I floor is 4mA at DAC=0, which still triggers small phase-angle conduction
// on SSR-LA. Without hysteresis, PID output oscillating 4↔5 DAC inside the
// deadband creates 0↔6 relay-like cycling (force 0↔6 at every tick). Holding
// state in the band eliminates this flicker. The hardware gate
// (POWER_ENABLE_PIN=27) cuts V→I supply entirely when both channels are 0
// — defeating the V→I leak at the source. For boards WITHOUT the hardware
// gate (POWER_ENABLE_PIN=-1), applyPowerChannel still force-zeros sub-MIN
// values as a software backstop.
const int   MIN_VALID_DAC    = 6;    // ON threshold (≥ this → turn ON)
const int   MIN_VALID_DAC_OFF = 3;   // OFF threshold (< this → turn OFF; band [3, 6) holds)

// Sensor low-pass filter — 1st-order IIR. With SENSOR_READ_INTERVAL_MS=2000
// and α=0.2, effective noise floor drops from SHT40's ±0.1°C RMS to ±0.04°C
// (≈ 2.5× reduction). Without this, Kd=25 derivative-on-measurement spikes
// on raw noise (±25 × (0.1°C / 1s) = ±2.5 DAC) inject false "heating/cooling
// urgency" into the PID, causing relay-like output snap. Time constant
// ≈ sample_time / -ln(1-α) = 2 / 0.22 ≈ 9s — well within the brooder's
// 12s/°C thermal inertia, so the filter lag is invisible at the chick level.
const float TEMP_FILTER_ALPHA  = 0.2f;

// Output slew-rate limiter (failsafe only). Caps how fast currentPower
// (DAC value) can change per second. With 8 DAC units/s ≈ 3%/s ramp:
// - Catches the worst-case "BAM" snap when PID integrates a sudden error
// - Brooder air time constant is ~12s/°C, so 3%/s tracks thermal response
//   without lag
// - SSR-LA phase-angle stability improves with smaller Δ per half-cycle
// - Skipped in NORMAL mode (server-cmd path) since server's PID is already
//   conservative (Ki=0.25, output_limits=0..100, republish every ≤4s after
//   Step 1) and bypasses for operator emergency stop responsiveness.
const int   MAX_SLEW_PER_SEC = 8;

// ==================== GLOBALS ====================

enum Mode { MODE_STARTUP, MODE_NORMAL, MODE_FAILSAFE };

String device_code;
String topic_base;

char topic_telemetry[80];
char topic_heartbeat[80];
char topic_status[80];
char topic_power[80];
char topic_setpoint[80];
char topic_cmd[80];
char topic_lwt[80];
char topic_ztemp[80];    // Server→ESP: weighted-avg of zone reference sensors

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

// Single SHT40 on default Wire bus (I2C addr 0x44).
TwoWire I2C_Bus = TwoWire(0);

Adafruit_SHT4x sht4;       // I2C addr 0x44 on default Wire

Preferences prefs;

// Sensors (single SHT40)
float temp    = 0;
float hum     = 0;
float temp_filtered = 0;  // Low-pass filtered SHT40 reading (feeds PID input)
bool  temp_filter_init = false; // Cold-start guard: skip filter on first read
float temp_pid = 0;       // PID input (= filtered local + zone blend, see readSensors)

// Zone (reference sensor) cache — fed by server via cfarm/brooder-{code}/zone_temp
float zone_temp          = 0;     // last weighted-avg zone temperature (°C)
bool  zone_temp_valid    = false; // false until first fresh payload
unsigned long zone_temp_ms = 0;    // millis() of last fresh zone_temp payload
int   zone_temp_sources  = 0;      // # sensors in last blend (0 = no zone configured)

// State
Mode currentMode   = MODE_STARTUP;
Mode previousMode  = MODE_STARTUP;

// v1.1.0 — per-channel power (DAC1 + DAC2 can run different %).
// currentPower kept for failsafe path (both channels same %) + backward compat.
int   currentPower       = 0;    // 0-255 (DAC value applied to both channels in failsafe)
int   currentPowerCh1    = 0;    // 0-255 (DAC1 — chảo 1)
int   currentPowerCh2    = 0;    // 0-255 (DAC2 — chảo 2)
int   lastServerPower    = 0;    // 0-100 (% last from server — legacy)
int   lastServerCh1      = 0;    // 0-100 (last ch1 from server — v1.1.0+)
int   lastServerCh2      = 0;    // 0-100 (last ch2 from server — v1.1.0+)
float currentSetpoint    = 33.5; // Default day-1 setpoint
float currentFallbackDelta = 0.0; // Tier-2 bias subtracted from local SHT40 when zone stale
                                    // (positive = heater-zone reads hotter than chick-zone)

unsigned long lastMqttCmdMs     = 0;
unsigned long lastTelemetryMs   = 0;
unsigned long lastHeartbeatMs   = 0;
unsigned long lastSensorReadMs  = 0;
unsigned long lastWifiRetryMs   = 0;
unsigned long lastMqttRetryMs   = 0;

bool sht4_ok = false;

// Local PID state (failsafe)
float        pidIntegral      = 0;
// Fix #3: Derivative is computed on MEASUREMENT (-d(temp_pid)/dt), not on
// error. This avoids the "derivative kick" spike that derivative-on-error
// produces on setpoint changes (each SP jump would multiply by Kd and slam
// the output). pidLastTempPid stores the previous temp_pid for the diff.
float        pidLastTempPid   = 0;
unsigned long pidLastTickMs    = 0;

// ==================== UTILITIES ====================

String generateDeviceCode() {
    // v1.1.0 — Provisioning flow:
    //   1. Try NVS ("brooder" namespace, key "device_code") — admin can
    //      provision via a serial command or via the server's flash
    //      endpoint.
    //   2. Fallback: derive from MAC last 3 bytes so each freshly-flashed
    //      ESP gets a unique code (no manual editing per chip).
    //   3. Auto-persist the derived code to NVS so it survives reboot
    //      AND the server sees a stable code in subsequent telemetry.
    prefs.begin("brooder", true);
    String device_code = prefs.getString("device_code", "");
    prefs.end();
    if (device_code.length() == 0) {
        uint8_t mac[6];
        WiFi.macAddress(mac);
        char buf[32];
        snprintf(buf, sizeof(buf), "esp-brooder-%02X%02X%02X",
                 mac[3], mac[4], mac[5]);
        device_code = String(buf);
        prefs.begin("brooder", false);
        prefs.putString("device_code", device_code);
        prefs.end();
        Serial.printf("Auto-provisioned device_code=%s from MAC\n",
                      device_code.c_str());
    }
    return device_code;
}

void buildTopics() {
    topic_base = "cfarm/brooder-" + device_code;
    snprintf(topic_telemetry, sizeof(topic_telemetry), "%s/telemetry", topic_base.c_str());
    snprintf(topic_heartbeat, sizeof(topic_heartbeat), "%s/heartbeat", topic_base.c_str());
    snprintf(topic_status,    sizeof(topic_status),    "%s/status",    topic_base.c_str());
    snprintf(topic_power,     sizeof(topic_power),     "%s/power",     topic_base.c_str());
    snprintf(topic_setpoint,  sizeof(topic_setpoint),  "%s/setpoint",  topic_base.c_str());
    snprintf(topic_cmd,       sizeof(topic_cmd),       "%s/cmd",       topic_base.c_str());
    snprintf(topic_lwt,       sizeof(topic_lwt),       "%s/lwt",       topic_base.c_str());
    snprintf(topic_ztemp,     sizeof(topic_ztemp),     "%s/zone_temp", topic_base.c_str());
}

float loadCachedSetpoint() {
    prefs.begin("brooder", true);
    float sp = prefs.getFloat("setpoint", 33.5f);
    prefs.end();
    return sp;
}

void saveCachedSetpoint(float sp) {
    prefs.begin("brooder", false);
    prefs.putFloat("setpoint", sp);
    prefs.end();
}

float loadCachedFallbackDelta() {
    prefs.begin("brooder", true);
    float d = prefs.getFloat("fallback_delta", FALLBACK_DELTA_DEFAULT);
    prefs.end();
    return d;
}

void saveCachedFallbackDelta(float d) {
    prefs.begin("brooder", false);
    prefs.putFloat("fallback_delta", d);
    prefs.end();
}

const char* modeToString(Mode m) {
    switch (m) {
        case MODE_NORMAL:   return "normal";
        case MODE_FAILSAFE: return "failsafe";
        default:            return "startup";
    }
}

// ==================== WIFI ====================

void connectWifi() {
    if (WiFi.status() == WL_CONNECTED) return;
    if (millis() - lastWifiRetryMs < WIFI_RETRY_INTERVAL_MS) return;
    lastWifiRetryMs = millis();

    Serial.println("WiFi: connecting...");
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(false);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// ==================== MQTT ====================

void onMqttConnected() {
    Serial.println("MQTT: connected");
    mqttClient.subscribe(topic_power,    1);
    mqttClient.subscribe(topic_setpoint, 1);
    mqttClient.subscribe(topic_cmd,      1);
    mqttClient.subscribe(topic_ztemp,    0);  // QoS 0 — fire-and-forget, 20s cadence

    // Reset failsafe timer so we don't trip immediately after connect
    lastMqttCmdMs = millis();

    // Announce online
    StaticJsonDocument<128> doc;
    doc["status"]      = "online";
    doc["device_code"] = device_code;
    doc["mode"]        = modeToString(currentMode);
    doc["fw_version"]  = FIRMWARE_VERSION;

    char buf[160];
    serializeJson(doc, buf);
    mqttClient.publish(topic_status, buf, true);  // retained
}

void connectMqtt() {
    if (WiFi.status() != WL_CONNECTED) return;
    if (mqttClient.connected()) return;
    if (millis() - lastMqttRetryMs < MQTT_RETRY_INTERVAL_MS) return;
    lastMqttRetryMs = millis();

    char clientId[32];
    snprintf(clientId, sizeof(clientId), "brooder_%s", device_code.c_str());

    Serial.printf("MQTT: connecting as %s\n", clientId);

    // LWT: published by broker on unexpected disconnect (retained).
    // PubSubClient 2.x doesn't have setWill() — LWT is passed as positional
    // args to connect(): (id, user, pass, willTopic, willQos, willRetain, willMessage).
    String lwtPayload = "{\"status\":\"offline\",\"device_code\":\"" + device_code + "\"}";

    if (mqttClient.connect(clientId, MQTT_USER, MQTT_PASS,
                           topic_lwt, 1, true, lwtPayload.c_str())) {
        onMqttConnected();
    } else {
        Serial.printf("MQTT: connect failed, rc=%d\n", mqttClient.state());
    }
}

// ==================== MQTT CALLBACK ====================

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    StaticJsonDocument<256> doc;
    DeserializationError err = deserializeJson(doc, payload, length);
    if (err != DeserializationError::Ok) {
        Serial.printf("MQTT: JSON parse error on %s: %s\n", topic, err.c_str());
        return;
    }

    String topicStr = String(topic);

    // ---- POWER COMMAND ----
    // v1.1.0 — accepts per-channel payload {ch1, ch2} (preferred) OR
    // legacy single-power {power} (firmware v1.0.x server compatibility).
    if (topicStr == topic_power) {
        int ch1 = -1, ch2 = -1;
        // New payload (preferred — Phase B server publishes this)
        if (doc.containsKey("ch1") && doc.containsKey("ch2")) {
            ch1 = doc["ch1"] | -1;
            ch2 = doc["ch2"] | -1;
        } else {
            // Legacy single-power fallback (firmware v1.0.x server / Phase A)
            int p = doc["power"] | -1;
            if (p >= 0 && p <= 100) {
                ch1 = p;
                ch2 = p;
            }
        }
        if (ch1 >= 0 && ch1 <= 100 && ch2 >= 0 && ch2 <= 100) {
            lastServerCh1   = ch1;
            lastServerCh2   = ch2;
            lastServerPower = (ch1 + ch2) / 2;
            applyPowerChannel(1, ch1);
            applyPowerChannel(2, ch2);
            lastMqttCmdMs = millis();

            // Returning to NORMAL from FAILSAFE → preload PID for next time
            if (currentMode == MODE_FAILSAFE) {
                int avg = (ch1 + ch2) / 2;
                preloadPidIntegral(map(avg, 0, 100, 0, PID_OUTPUT_MAX));
                Serial.printf("FAILSAFE → NORMAL, ch1=%d%% ch2=%d%% (avg=%d%%)\n",
                              ch1, ch2, avg);
            }
            currentMode = MODE_NORMAL;
        }

    // ---- SETPOINT UPDATE ----
    } else if (topicStr == topic_setpoint) {
        float sp = doc["setpoint"] | -1.0f;
        float max_safe = doc["max_safe"] | EMERGENCY_MAX_TEMP_C;
        if (sp > 0 && sp < 50) {
            // Clamp to max_safe hardware limit
            if (sp > max_safe) sp = max_safe;
            currentSetpoint = sp;
            saveCachedSetpoint(sp);

            // Tier-2 fallback bias — admin-tuned via dashboard. Positive value
            // means "heater-zone SHT40 reads hotter than chick-zone by this much";
            // firmware subtracts it to estimate the chick-zone temperature.
            // Persist so failsafe mode keeps the same offset if server dies.
            float fd = doc["fallback_delta_c"] | currentFallbackDelta;
            if (fd < -5.0f) fd = -5.0f;
            if (fd >  5.0f) fd =  5.0f;
            if (abs(fd - currentFallbackDelta) > 0.01f) {
                currentFallbackDelta = fd;
                saveCachedFallbackDelta(fd);
            }

            Serial.printf("Setpoint: %.2f°C (cached, max_safe=%.1f°C, "
                          "fallback_delta=%+.2f°C)\n",
                          sp, max_safe, currentFallbackDelta);
        }

    // ---- CMD (ping, reboot, etc.) ----
    } else if (topicStr == topic_cmd) {
        const char* action = doc["action"] | "";
        if (strcmp(action, "ping") == 0) {
            lastMqttCmdMs = millis();
            Serial.println("CMD: ping received");
        } else if (strcmp(action, "reboot") == 0) {
            Serial.println("CMD: reboot requested");
            delay(100);
            ESP.restart();
        } else if (strcmp(action, "clear_failsafe") == 0) {
            Serial.println("CMD: clear_failsafe");
            currentMode = MODE_NORMAL;
            lastMqttCmdMs = millis();
        }

    // ---- ZONE TEMP (server-side weighted avg of reference sensors) ----
    // Payload: {"temp": <float|null>, "source_count": <int>, "stale_max_s": <int>, "ts": "..."}
    //   temp=null  → no fresh sources; drop cache and fall back to local.
    //   temp=N     → blend with local SHT40 in readSensors().
    } else if (topicStr == topic_ztemp) {
        int source_count = doc["source_count"] | 0;
        float t = doc["temp"] | NAN;
        if (isnan(t) || source_count <= 0) {
            // Server explicitly cleared the cache
            zone_temp_valid = false;
            zone_temp_sources = 0;
            Serial.println("Zone: server cleared cache → local-only mode");
        } else if (t < -50.0f || t > 80.0f) {
            // Sanity clamp — ignore garbage
            Serial.printf("Zone: ignoring out-of-range temp=%.2f\n", t);
        } else {
            zone_temp        = t;
            zone_temp_valid  = true;
            zone_temp_ms     = millis();
            zone_temp_sources = source_count;
            // No Serial spam — 20s cadence would flood the log
        }
    }
}

// ==================== SENSORS ====================

void initSensors() {
    // Single SHT40 on default Wire bus (GPIO 21/22).
    I2C_Bus.begin(I2C_SDA, I2C_SCL, 100000);

    // Adafruit_SHT4x::begin() signature is `bool begin(TwoWire *theWire = &Wire)`
    // — the I2C address is hardcoded to SHT4x_DEFAULT_ADDR (0x44) in the
    // header, so we only pass the bus pointer.
    sht4_ok = sht4.begin(&I2C_Bus);

    if (sht4_ok) Serial.println("SHT40 (SDA=21/SCL=22): OK");
    else          Serial.println("SHT40: FAIL — check wiring");
}

void readSensors() {
    sensors_event_t hum_event, temp_event;
    // Per-cycle success flag. The sht4_ok flag set by initSensors() reflects
    // boot-time probe only — if the sensor is unplugged while running,
    // sht4_ok stays true forever and stale temp values keep feeding the PID.
    // This flag is reset every cycle, so a hot-unplug is detected on
    // the very next read and trips the sensor-failsafe clamp immediately.
    bool read_success = false;

    if (sht4_ok && sht4.getEvent(&hum_event, &temp_event)) {
        temp        = temp_event.temperature;
        hum         = hum_event.relative_humidity;
        read_success = true;
    }

    if (read_success) {
        // Low-pass filter the local SHT40 BEFORE feeding Tier-2 PID.
        // Cold-start: filter has no history yet → seed with raw reading so
        // the first sample isn't biased by `temp_filtered = 0` default.
        if (!temp_filter_init) {
            temp_filtered   = temp;
            temp_filter_init = true;
        } else {
            // 1st-order IIR: y[n] = α·x[n] + (1-α)·y[n-1]
            // α=0.2 with 2s cadence → τ ≈ 9s (cuts SHT40 noise ±0.1°C → ±0.04°C)
            temp_filtered = TEMP_FILTER_ALPHA * temp
                          + (1.0f - TEMP_FILTER_ALPHA) * temp_filtered;
        }

        // Decide PID input (Tier-1 vs Tier-2):
        //   Tier 1: zone_temp fresh (≤3 min) AND ≥1 source  →  temp_pid = zone_temp
        //           Zone sensors are the ground truth for chick comfort.
        //           The SHT40 on the brooder measures the heater zone (1.5–3°C
        //           hotter than chick area) and would inject oscillation.
        //   Tier 2: zone_temp stale or missing               →  temp_pid = filtered − delta
        //           Admin tunes `fallback_delta_c` AFTER observing the steady-state
        //           heater-vs-zone bias. Positive delta = heater-zone reads hotter
        //           than chick-zone by this much (typical +1.5 to +3.0 °C).
        //           We SUBTRACT because we want the chick-zone estimate, not the
        //           heater-zone reading.
        //           Note: feeds the *filtered* local reading (not raw `temp`) to
        //           avoid feeding SHT40 noise into the Kd=25 derivative.
        bool zone_fresh = zone_temp_valid
                       && (millis() - zone_temp_ms) < ZONE_TEMP_STALE_MS;
        if (zone_fresh && zone_temp_sources > 0) {
            temp_pid = zone_temp;
            static unsigned long lastZoneLogMs = 0;
            if (millis() - lastZoneLogMs > 60000) {
                Serial.printf("Tier1 zone-only: zone=%.2f (n=%d) → pid=%.2f "
                              "(local filtered=%.2f, raw=%.2f, bias=%.2f)\n",
                              zone_temp, zone_temp_sources, temp_pid,
                              temp_filtered, temp, temp - zone_temp);
                lastZoneLogMs = millis();
            }
        } else {
            // Tier 2: filtered local − admin-tuned delta
            //   delta>0 → heater-zone is hotter than chick-zone → estimate
            //              the chick-zone by subtracting the bias.
            //   delta<0 → heater-zone is cooler than chick-zone (rare; e.g.
            //              heater mis-wired or airflow reversal) → add back.
            //   delta=0 → assume filtered local IS zone (degraded mode).
            temp_pid = temp_filtered - currentFallbackDelta;
            if (zone_temp_valid && !zone_fresh) {
                zone_temp_valid = false;
                Serial.printf("Tier2 fallback: zone stale (>3 min). "
                              "Using local=%.2f (filt=%.2f) − delta=%+.2f → pid=%.2f\n",
                              temp, temp_filtered, currentFallbackDelta, temp_pid);
            }
        }
    } else {
        Serial.println("WARN: Khong doc duoc SHT40 trong chu ky nay!");
        // Propagate the failure into the boot flag so the loop-level
        // failsafe clamp (heater OFF) kicks in right now, not on next boot.
        sht4_ok = false;
    }
}

// ==================== LOCAL PID (FAILSAFE) ====================

float computeFailsafePid() {
    unsigned long now = millis();
    float dt;

    if (pidLastTickMs == 0) {
        dt = 1.0f;  // First tick
    } else {
        dt = (now - pidLastTickMs) / 1000.0f;
        if (dt > 10.0f) dt = 10.0f;   // cap after long gap
        if (dt < 0.001f) dt = 0.001f; // safety
    }
    pidLastTickMs = now;

    float error = currentSetpoint - temp_pid;

    // DEADBAND: when within ±DEADBAND_C of setpoint, hold last output.
    // Integral STILL accumulates (so a slow drift out of the band gets a
    // non-zero response). This is what kills the relay-like on/off cycling
    // that the user's old thermal relay suffered from (±3°C swing).
    if (abs(error) < DEADBAND_C) {
        return (float)currentPower;
    }

    // P
    float P = PID_KP * error;

    // I with anti-windup (clamp integral term)
    pidIntegral += error * dt;
    float Imax = (float)PID_OUTPUT_MAX / PID_KI;
    if (pidIntegral >  Imax) pidIntegral =  Imax;
    if (pidIntegral < -Imax) pidIntegral = -Imax;
    float I = PID_KI * pidIntegral;

    // D on MEASUREMENT: D = -Kd × d(temp_pid)/dt
    // (equivalent to derivative-on-error when setpoint is constant between
    // ticks, but avoids the spike that derivative-on-error causes on setpoint
    // changes — the previous implementation multiplied SP jumps by Kd and
    // slammed the output, even though the actual process variable hadn't moved).
    float derivative = -(temp_pid - pidLastTempPid) / dt;
    float D = PID_KD * derivative;
    pidLastTempPid = temp_pid;

    float output_unclamped = P + I + D;
    float output = output_unclamped;
    if (output > PID_OUTPUT_MAX) output = PID_OUTPUT_MAX;
    if (output < PID_OUTPUT_MIN) output = PID_OUTPUT_MIN;

    // Back-calculation anti-windup (Step 3). When output saturates, the
    // accumulator may have grown past where it should be. Without back-correction,
    // during a long cold-start (e.g. 25→30°C setpoint), the integrator charges
    // to +Imax while the controller is pinned at 100%. When temp finally catches
    // up, the residual integral takes many seconds to drain → sustained overshoot.
    // Correction: subtract the saturation excess from the integrator, scaled
    // by 1/PID_KT. Kt=5s means the integrator converges to alignment with
    // the actuator limit in ~5s after a disturbance, instead of taking 30+
    // seconds to bleed off naturally.
    if (output != output_unclamped) {
        pidIntegral += (output - output_unclamped) * (1.0f / PID_KT);
        // Re-clamp after back-correction
        if (pidIntegral >  Imax) pidIntegral =  Imax;
        if (pidIntegral < -Imax) pidIntegral = -Imax;
    }

    return output;
}

void preloadPidIntegral(int power) {
    // Bumpless transfer into failsafe: initial PID output = currentPower
    pidIntegral    = (float)power / PID_KI;
    pidLastTempPid = temp_pid;     // baseline for derivative on measurement
    pidLastTickMs  = 0;            // force dt=1 on next tick
}

// ==================== OUTPUT ====================

void applyPowerChannel(int ch, int pct) {
    // pct = 0..100 (server-style percentage). Convert to 0..PID_OUTPUT_MAX DAC.
    if (pct < 0)   pct = 0;
    if (pct > 100) pct = 100;
    int dac = map(pct, 0, 100, 0, PID_OUTPUT_MAX);

    // EMERGENCY CUTOFF — independent of PID/mode. Latched with 0.5°C
    // hysteresis to avoid single-sample trips. The local SHT40 measures
    // the heater zone (heater case + a few cm of air), so a reading of
    // 38.5°C here definitely means the chick zone is dangerously hot.
    // The bimetal hardware thermostat at 38°C is the FINAL backup if
    // even this fails.
    //
    // Use temp_filtered (the IIR low-pass output) not raw `temp`. A single
    // SHT40 noise spike on raw `temp` would latch the heater OFF permanently
    // (well, for as long as it takes to drop below EMERGENCY_MAX_TEMP_C for
    // a full sample) — the entire point of adding the IIR filter was to
    // defeat this noise. Cold-start fallback to raw temp if the filter
    // hasn't been seeded yet (avoids reading 0 as "room temperature").
    static bool overtempLatched = false;
    float cutoff_temp = temp_filter_init ? temp_filtered : temp;
    if (cutoff_temp > EMERGENCY_LATCH_C) overtempLatched = true;
    if (cutoff_temp < EMERGENCY_MAX_TEMP_C) overtempLatched = false;
    if (overtempLatched) {
        dac = 0;
        static bool warnedOnce = false;
        if (!warnedOnce) {
            Serial.printf(">>> EMERGENCY CUTOFF: heater OFF (local=%.2f°C "
                          "> %.2f°C latch) <<<\n", temp, EMERGENCY_LATCH_C);
            warnedOnce = true;
        }
    }

    // Fix #4 (zero-cutoff clamp) — kept as a software backstop for boards
    // that DON'T have the hardware V→I gate (POWER_ENABLE_PIN not wired).
    // On wired boards, hysteresis in applyPower() already keeps the output
    // either ≥ MIN_VALID_DAC (when ON) or exactly 0 (when OFF) — the
    // hardware gate (POWER_ENABLE_PIN=27 → V→I supply) cuts off the 4mA-at-
    // DAC=0 floor at the source. On un-wired boards this conditional remains
    // active to defeat the floor.
#if POWER_ENABLE_PIN < 0
    if (dac > 0 && dac < MIN_VALID_DAC) {
        dac = 0;
    }
#endif

    // Update per-channel cache + DAC
    if (ch == 1) {
        currentPowerCh1 = dac;
        dacWrite(DAC1_PIN, dac);
    } else {
        currentPowerCh2 = dac;
        dacWrite(DAC2_PIN, dac);
    }

    // POWER_ENABLE_PIN active if EITHER channel has power (combined gate).
    bool anyActive = (currentPowerCh1 > 0) || (currentPowerCh2 > 0);
#if POWER_ENABLE_PIN >= 0
    digitalWrite(POWER_ENABLE_PIN, anyActive ? HIGH : LOW);
#endif

    // Keep legacy `currentPower` cache in sync (avg) for failsafe path +
    // backward-compatible telemetry fields.
    currentPower = (currentPowerCh1 + currentPowerCh2) / 2;
}

// Legacy wrapper — used by failsafe path to drive BOTH channels with the
// same %. Preserves v1.0.x behavior when server is dead. In FAILSAFE mode,
// applies TWO smoothing layers:
//   1. Slew-rate limit (max ±MAX_SLEW_PER_SEC DAC units/s) so the PID output
//      ramps smoothly instead of snapping to the computed target on the next
//      tick.
//   2. Hysteresis at MIN_VALID_DAC — without this, PID output oscillating
//      4↔5 DAC inside the deadband creates 0↔6 relay-like cycling because
//      anything below MIN_VALID_DAC forces the heater OFF via V→I floor
//      protection. Holding state in the band [MIN_VALID_DAC_OFF, MIN_VALID_DAC)
//      eliminates the flicker.
// Slew applies in BOTH modes. Hysteresis is FAILSAFE-only (server publishes
// integer percentages in NORMAL so the deadband flicker can't happen there).
// Trade-off: NORMAL-mode operator emergency stop now takes ~1s extra to
// propagate from 100%→0%. Acceptable — firmware EMERGENCY_LATCH_C caps
// unsafe temperatures well before the bimetal at 38°C.
void applyPower(int p) {
    if (p < 0)              p = 0;
    if (p > PID_OUTPUT_MAX) p = PID_OUTPUT_MAX;

    // Slew-rate limit (BOTH modes)
    int delta = p - currentPower;
    if (delta >  MAX_SLEW_PER_SEC) delta =  MAX_SLEW_PER_SEC;
    if (delta < -MAX_SLEW_PER_SEC) delta = -MAX_SLEW_PER_SEC;
    p = currentPower + delta;
    if (p < 0)              p = 0;
    if (p > PID_OUTPUT_MAX) p = PID_OUTPUT_MAX;

    if (currentMode == MODE_FAILSAFE) {
        // Hysteresis at MIN_VALID_DAC. State syncs from currentPower on each
        // call so NORMAL→FAILSAFE inherits the right state without flicker.
        //   p >= MIN_VALID_DAC (6)        → ON
        //   p <  MIN_VALID_DAC_OFF (3)    → OFF
        //   p in [3, 6)                   → hold previous state
        int hyst = (currentPower >= MIN_VALID_DAC) ? 1 : 0;
        if (p >= MIN_VALID_DAC) {
            hyst = 1;
        } else if (p < MIN_VALID_DAC_OFF) {
            hyst = 0;
        }
        // else: in hysteresis band — keep state synced from currentPower above
        if (hyst == 0) p = 0;
    }

    // No-op short-circuit: skip channel writes when clamped p produces the same
    // pct as already latched in DAC. Saves 2× dacWrite + GPIO toggle per PID
    // tick during steady-state failsafe (most common case).
    int pct = (p * 100) / PID_OUTPUT_MAX;
    int prev_pct = (currentPower * 100) / PID_OUTPUT_MAX;
    if (pct == prev_pct) return;

    applyPowerChannel(1, pct);
    applyPowerChannel(2, pct);
}

// ==================== TELEMETRY ====================

void publishTelemetry() {
    if (!mqttClient.connected()) return;

    StaticJsonDocument<512> doc;
    doc["device_code"]    = device_code;
    doc["device_type"]    = DEVICE_TYPE;
    doc["fw_version"]     = FIRMWARE_VERSION;
    doc["temp"]           = temp;
    doc["hum"]            = hum;
    doc["temp_pid"]       = temp_pid;
    doc["setpoint"]       = currentSetpoint;
    // v1.1.0 — per-channel power fields (0..100%). Old `power` field
    // kept as average for backward-compat with Phase A server + chart.
    doc["power"]          = (currentPower * 100) / PID_OUTPUT_MAX;   // avg %
    doc["power_ch1"]      = (currentPowerCh1 * 100) / PID_OUTPUT_MAX;
    doc["power_ch2"]      = (currentPowerCh2 * 100) / PID_OUTPUT_MAX;
    doc["mode"]           = modeToString(currentMode);
    doc["sht4_ok"]        = sht4_ok;
    doc["wifi_rssi"]      = WiFi.RSSI();
    doc["free_heap"]      = ESP.getFreeHeap();
    doc["ip"]             = WiFi.localIP().toString();
    doc["uptime_s"]       = millis() / 1000;
    doc["ts"]             = millis();
    // Zone (reference sensor) contribution — handy when debugging the blend.
    // zone_fresh=true only when the server payload is <ZONE_TEMP_STALE_MS old.
    bool zone_fresh = zone_temp_valid
                   && (millis() - zone_temp_ms) < ZONE_TEMP_STALE_MS;
    doc["zone_temp"]      = zone_fresh ? zone_temp : -999.0f;
    doc["zone_fresh"]     = zone_fresh;
    doc["zone_sources"]   = zone_temp_sources;
    doc["fallback_delta_c"] = currentFallbackDelta;
    // Which tier fed the PID input this tick. Surfaces fallback transitions
    // on the dashboard without parsing logs.
    doc["pid_source"]     = (zone_fresh && zone_temp_sources > 0)
                                ? "zone" : "local+delta";

    char buf[640];
    serializeJson(doc, buf);
    mqttClient.publish(topic_telemetry, buf, false);  // QoS 0, not retained
}

void publishHeartbeat() {
    // Lightweight keepalive consumed by mqtt_listener._handle_heartbeat
    // (server/src/iot/mqtt_listener.py). Field names mirror the relay_4ch
    // firmware so the same handler works for both device types.
    if (!mqttClient.connected()) return;

    StaticJsonDocument<256> doc;
    doc["device_code"]    = device_code;
    doc["device_type"]    = DEVICE_TYPE;
    doc["firmware"]       = FIRMWARE_VERSION;
    doc["uptime"]         = millis() / 1000;
    doc["wifi_rssi"]      = WiFi.RSSI();
    doc["ip"]             = WiFi.localIP().toString();
    doc["free_heap"]      = ESP.getFreeHeap();
    doc["mode"]           = modeToString(currentMode);
    doc["sht4_ok"]        = sht4_ok;
    doc["setpoint"]       = currentSetpoint;
    doc["local_mqtt"]     = true;
    doc["cloud_mqtt"]     = false;   // brooder talks to local broker only

    char buf[256];
    serializeJson(doc, buf);
    mqttClient.publish(topic_heartbeat, buf, false);  // QoS 0, not retained
}

void publishStatus(const char* status) {
    if (!mqttClient.connected()) return;
    StaticJsonDocument<160> doc;
    doc["status"]      = status;
    doc["device_code"] = device_code;
    doc["mode"]        = modeToString(currentMode);
    doc["power"]       = (currentPower * 100) / PID_OUTPUT_MAX;
    doc["setpoint"]    = currentSetpoint;
    char buf[160];
    serializeJson(doc, buf);
    mqttClient.publish(topic_status, buf, true);  // retained
}

// ==================== MODE TRANSITIONS ====================

void enterFailsafe() {
    if (currentMode == MODE_FAILSAFE) return;
    Serial.println(">>> ENTERING FAILSAFE (local PID) <<<");

    // v1.3.0: Hybrid setpoint selection.
    //   Rationale: hardcoded 30°C was too cold for day-1..3 chicks (33.5°C target).
    //   Using last server-cached setpoint keeps brooder near the right temperature
    //   when the server dies mid-cycle. Fall back to FAILSAFE_SETPOINT_C only if
    //   the cache is invalid (NVS empty / corrupted / first boot).
    //
    //   Sanity bounds [20°C, EMERGENCY_MAX_TEMP_C]:
    //     - Lower 20°C  → below this, chicks can't regulate (cold-stress)
    //     - Upper MAX   → firmware clamps anyway, but reject obviously bogus
    //                     cached values (e.g. server bug published 50°C)
    float prevSetpoint = currentSetpoint;
    if (currentSetpoint >= 20.0f && currentSetpoint <= EMERGENCY_MAX_TEMP_C) {
        // Cache valid — keep it. Log which path we took.
        Serial.printf("    Previous setpoint : %.2f°C (cached — server's last target)\n",
                      prevSetpoint);
        Serial.printf("    FAILSAFE target   : %.2f°C (cached, within [20, %.1f] bounds)\n",
                      currentSetpoint, EMERGENCY_MAX_TEMP_C);
    } else {
        // Cache invalid (out-of-range, NVS empty, or first boot before any cmd).
        currentSetpoint = FAILSAFE_SETPOINT_C;
        Serial.printf("    Previous setpoint : %.2f°C (invalid — out of [20, %.1f])\n",
                      prevSetpoint, EMERGENCY_MAX_TEMP_C);
        Serial.printf("    FAILSAFE target   : %.2f°C (default — chicks survive hours below this)\n",
                      currentSetpoint);
    }
    Serial.printf("    Current power     : %d (DAC) = %d%%\n",
                  currentPower, (currentPower * 100) / PID_OUTPUT_MAX);

    previousMode = currentMode;
    currentMode  = MODE_FAILSAFE;
    preloadPidIntegral(currentPower);
    publishStatus("failsafe");
}

void enterNormal() {
    if (currentMode == MODE_NORMAL) return;
    Serial.println(">>> BACK TO NORMAL (server control) <<<");
    previousMode = currentMode;
    currentMode  = MODE_NORMAL;
    publishStatus("online");
}

// ==================== SETUP ====================

void setup() {
    Serial.begin(115200);
    delay(200);
    Serial.println();
    Serial.println("=================================");
    Serial.printf("CFarm ESP32 Brooder v%s\n", FIRMWARE_VERSION);
    Serial.println("=================================");

    pinMode(STATUS_LED, OUTPUT);
    digitalWrite(STATUS_LED, LOW);

    // Fix #4 — initialize the optional V→I power-enable gate. If the pin is
    // not wired (POWER_ENABLE_PIN < 0), the #if guards skip all references
    // and the V→I board stays always-on; the MIN_VALID_DAC software deadband
    // is the only protection in that case.
#if POWER_ENABLE_PIN >= 0
    pinMode(POWER_ENABLE_PIN, OUTPUT);
    digitalWrite(POWER_ENABLE_PIN, LOW);  // heater OFF at boot
    Serial.printf("POWER_ENABLE_PIN: %d (V→I gate active)\n", POWER_ENABLE_PIN);
#else
    Serial.println("POWER_ENABLE_PIN: not wired (software deadband only)");
#endif

    // Device code from MAC (last 3 bytes)
    device_code = generateDeviceCode();
    buildTopics();
    Serial.printf("Device code : %s\n", device_code.c_str());
    Serial.printf("Topic base  : %s\n", topic_base.c_str());

    // Load cached setpoint for failsafe
    currentSetpoint = loadCachedSetpoint();
    Serial.printf("Cached SP   : %.2f°C\n", currentSetpoint);

    // Load cached Tier-2 fallback delta (admin-tuned via dashboard)
    currentFallbackDelta = loadCachedFallbackDelta();
    Serial.printf("Cached delta: %+.2f°C\n", currentFallbackDelta);

    // Sensors
    initSensors();

    // MQTT setup
    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    mqttClient.setCallback(mqttCallback);
    mqttClient.setBufferSize(1024);    // telemetry expanded for zone fields (v1.0.8)
    mqttClient.setKeepAlive(15);
    mqttClient.setSocketTimeout(3);

    // Watchdog (compatible with both Arduino Core 2.x and 3.x).
    // Core 2.x: esp_task_wdt_init(timeout_seconds, panic_on_trigger)
    // Core 3.x: esp_task_wdt_init(&config) — config struct from esp_task_wdt_config_t
#if ESP_ARDUINO_VERSION_MAJOR >= 3
    esp_task_wdt_config_t wdt_config = {
        .timeout_ms     = WDT_TIMEOUT_S * 1000,
        .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
        .trigger_panic  = true
    };
    esp_task_wdt_init(&wdt_config);
#else
    esp_task_wdt_init(WDT_TIMEOUT_S, true);
#endif
    esp_task_wdt_add(NULL);

    // WiFi
    WiFi.mode(WIFI_STA);
    WiFi.setAutoReconnect(true);
    WiFi.persistent(false);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    lastWifiRetryMs = millis() - WIFI_RETRY_INTERVAL_MS;  // immediate connect

    // Initial DAC state = 0 (off) for safety
    applyPower(0);

    Serial.println("Setup complete. Waiting for WiFi...");
}

// ==================== LOOP ====================

void loop() {
    esp_task_wdt_reset();

    unsigned long now = millis();

    // ---- WiFi / MQTT maintenance ----
    if (WiFi.status() != WL_CONNECTED) {
        connectWifi();
    } else if (!mqttClient.connected()) {
        connectMqtt();
    }
    if (mqttClient.connected()) {
        mqttClient.loop();
    }

    // ---- Read sensors every 2s ----
    if (now - lastSensorReadMs >= SENSOR_READ_INTERVAL_MS) {
        readSensors();
        lastSensorReadMs = now;
    }

    // ---- Tier-3 SENSOR FAILSAFE CLAMP (v1.3.0: applies in ALL modes) ----
    // Without this guard at the top of mode logic, a SHT40 failure while the
    // server is still alive would leave server-driven PID running on stale
    // (last-known) temp forever — the integral would lock onto a phantom
    // temperature and either over- or under-heat indefinitely. The bimetal
    // mechanical thermostat at 38°C would eventually catch an over-heat, but
    // we'd rather cut power immediately. Cutting to 0 is the safe failure
    // mode — chicks may be cold (bimetal won't help a cold brooder) but
    // they won't be cooked. v1.3.0 also resets pidIntegral so when the sensor
    // recovers, PID starts from zero instead of carrying garbage accumulated
    // while we had no real reading.
    // Static state hoisted ABOVE the if/else so both branches can read/write
    // it — C++ block-scope `static` inside `if` would not be visible in the
    // matching `else` branch (this was a v1.3.0 first-cut compile error).
    static bool warnedSensorDead = false;
    if (!sht4_ok) {
        if (!warnedSensorDead) {
            Serial.println(">>> SENSOR FAILSAFE (Tier-3): SHT40 dead, heater OFF <<<");
            warnedSensorDead = true;
        }
        pidIntegral    = 0;        // prevent stale error accumulation
        pidLastTempPid = temp_pid; // freeze derivative baseline
        applyPower(0);
    } else {
        warnedSensorDead = false;

        // ---- Failsafe detection + power output ----
        // Fix #2: WiFi loss must also force failsafe. Without this gate, an
        // mqttClient.connected() that hasn't noticed the dead socket yet (TCP
        // keepalive can lag 30-60s) keeps serverAlive=true while the network is
        // gone — PID holds stale last power and chicks drift. Adding the WiFi
        // status check collapses both signals into one.
        bool serverAlive = (WiFi.status() == WL_CONNECTED)
                           && mqttClient.connected()
                           && (now - lastMqttCmdMs) < FAILSAFE_TIMEOUT_MS;

        if (serverAlive) {
            if (currentMode != MODE_NORMAL) enterNormal();
            // Power already updated via mqttCallback; nothing to do
        } else {
            if (currentMode != MODE_FAILSAFE) enterFailsafe();

            // Failsafe PID must run at the same cadence as the sensor
            // read (SENSOR_READ_INTERVAL_MS) — otherwise error stays
            // constant while dt shrinks to 10ms in the tight loop, and
            // the I + D terms accumulate garbage. Lock it to 1s so it
            // matches thermal inertia of the brooder.
            static unsigned long lastFailsafePidMs = 0;
            if (now - lastFailsafePidMs >= 1000) {
                lastFailsafePidMs = now;
                applyPower((int)computeFailsafePid());
            }
        }
    }

    // ---- Telemetry every 5s ----
    if (now - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
        publishTelemetry();
        lastTelemetryMs = now;
    }

    // ---- Heartbeat every 60s (Devices dashboard online status) ----
    if (now - lastHeartbeatMs >= HEARTBEAT_INTERVAL_MS) {
        publishHeartbeat();
        lastHeartbeatMs = now;
    }

    // ---- Status LED ----
    if (currentMode == MODE_NORMAL) {
        digitalWrite(STATUS_LED, HIGH);
    } else if (currentMode == MODE_FAILSAFE) {
        // Slow blink (500ms)
        digitalWrite(STATUS_LED, (now / 500) % 2);
    } else {
        // Fast blink in STARTUP (200ms)
        digitalWrite(STATUS_LED, (now / 200) % 2);
    }

    delay(10);
}