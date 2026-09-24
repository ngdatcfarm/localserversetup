/**
 * =========================================================
 * CFarm ESP32 Brooder Firmware
 * Wi-Fi version (W5500 Ethernet migration planned)
 * Version: 1.4.1  (anti-spam-failsafe pack — 2026-09-23)
 *                            v1.4.1 anti-spam-failsafe pack:
 *                            - FAILSAFE_TIMEOUT_MS 15000 → 60000 (4× margin).
 *                              Server keepalive cadence is 4s; even with a
 *                              5-packet burst lost (DB write latency, MQTT
 *                              QoS-1 retry, watchdog reset) the gap stays
 *                              under 60s. Was: any single 16s gap (DB stall
 *                              + publish jitter) tripped failsafe → mode
 *                              flicker → 100→0 power snap → temp overshoot.
 *                            - NORMAL_CONFIRM_REQUIRED 2 → 1. With the
 *                              longer timeout, the first fresh /power packet
 *                              is enough proof the server is back — second
 *                              packet adds 4s of mode-flicker delay with no
 *                              safety benefit (failsafe exits cleanly when
 *                              input is recent).
 *                            v1.4.0 provisioning rewrite:
 *                            - Added DEVICE_CODE compile-time constant to
 *                              USER CONFIG so each ESP32 can match a
 *                              pre-created DB row (e.g. "esp32-8056").
 *                            - generateDeviceCode() priority: constant >
 *                              NVS cache > MAC fallback.
 *                            - MAC fallback changed from type-prefixed
 *                              "esp-brooder-XXXXXX" to universal
 *                              "esp-XXXXXX" (type lives in DEVICE_TYPE +
 *                              topic prefix, not in code).
 *                            v1.3.2 bugfix:
 *                            - REMOVED time-based count reset in hysteresis block.
 *                              Server keepalive interval (KEEPALIVE_INTERVAL_S=6) was
 *                              > NORMAL_CONFIRM_WINDOW_MS (3), so the reset was firing
 *                              between every keepalive packet and capping
 *                              normalConfirmCount at 1 — hysteresis was a no-op.
 *                            - Counter now resets only on enterFailsafe()/enterNormal().
 *                            - Recovery: 2 consecutive /power packets (~6-12s typical).
 *                            v1.3.1 anti-thrash pack:
 *                            - FAILSAFE_TIMEOUT_MS 8000 → 15000 (margin ~11s vs 4s heartbeat)
 *                            - NORMAL hysteresis: require 2 fresh packets before
 *                              leaving FAILSAFE.
 *                            v1.3.0 (sensor-failsafe hoist + hybrid failsafe SP + longer timeout — 2026-09-18)
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
const char* FIRMWARE_VERSION = "1.4.5";
const char* FIRMWARE_NAME    = "esp32_brooder";

// ─── DEVICE CODE ───
// Unique identifier for this physical ESP32 (no type prefix; type lives in
// DEVICE_TYPE + MQTT topic prefix cfarm/brooder-/).
//
// Set this to match a pre-created DB row (e.g. "esp32-8056") so the server
// links this ESP32 to that exact row. Leave empty ("") to auto-derive from
// MAC — server will create a new row on first heartbeat.
//
// Priority order on first boot: this constant → NVS cache → MAC.
// Once cached in NVS, this constant is ignored on subsequent boots (NVS wins).
const char* DEVICE_CODE = "";

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
// v1.4.5: 60000 → 30000. Keepalive=90 (broker timeout=135s) but heartbeat
// must be well under that to absorb occasional MQTT packet drops on
// marginal WiFi (esp32-1168 sees RSSI -76 to -85 dBm). Pre-fix, a single
// dropped heartbeat at keepalive=60 (broker timeout=90s) fired LWT every
// ~89-92s and flipped is_online despite an alive device. With 30s
// heartbeat, broker always sees traffic within 30s, well within the 135s
// budget — even two consecutive dropped heartbeats leave 75s margin.
const unsigned long HEARTBEAT_INTERVAL_MS   = 30000;   // Publish heartbeat every 30s
const unsigned long SENSOR_READ_INTERVAL_MS = 2000;    // Read SHT40 every 2s
const uint8_t       SHT4_FAIL_THRESHOLD     = 5;       // v1.4.2 (fw bug 4): consecutive I2C failures before latching sht4_ok=false. At 2s cadence = 10s of sustained failure. One transient blip no longer latches the Tier-3 failsafe clamp.
const unsigned long FAILSAFE_TIMEOUT_MS     = 60000;   // v1.4.1: 15s → 60s. With server KEEPALIVE=4s and DB jitter, 15s was too tight — single 16s publish gap tripped failsafe and snapped heater 100→0, killing zone stability. 60s absorbs ≥14 missed packets; legitimate server outage still triggers failsafe but transient stalls don't.
const unsigned long SERVER_GRACE_PERIOD_MS  = 30000;   // v1.4.4: anti-flap grace period. Absorbs WiFi micro-drops (10-100ms during SSR noise) and MQTT reconnect flaps without flipping to FAILSAFE. Trade-off: during the grace window the ESP32 holds last-server-commanded per-channel power without local PID moderation; brooder thermal inertia (~12s/°C) bounds drift to ≤0.5°C over 30s. EMERGENCY_LATCH_C=35.1°C + bimetal 38°C still active every cycle.
const unsigned long NORMAL_CONFIRM_WINDOW_MS = 3000;    // v1.3.2: DEPRECATED. Was used for time-based counter reset — removed because server keepalive (6s) > window (3s), made hysteresis a no-op. Kept for reference; do not re-enable without also changing server cadence.
const uint8_t       NORMAL_CONFIRM_REQUIRED  = 1;       // v1.4.1: 2 → 1. Now that FAILSAFE_TIMEOUT is 60s, the first fresh /power packet is sufficient proof of server liveness — second packet added ~4s of mode-flicker delay with no extra safety (failsafe exit already verifies input freshness). Counter reset only in enterFailsafe()/enterNormal().
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
// v1.4.2 (firmware bug 2): per-channel power ratio captured when entering
// FAILSAFE. In NORMAL the server publishes different ch1/ch2 % (one
// heater may run 90% while the other runs 10% based on each heater's
// PID). The local failsafe PID runs ONE shared temperature control
// loop (single SHT40 sensor), so it can't independently steer two
// heaters. The compromise: compute ONE PID output (the "failsafe mean
// power") and scale it per-channel by the ratio captured from the last
// NORMAL state. This way the relative bias (ch1:ch2 ratio) is preserved
// during failsafe — ch1 keeps getting more power than ch2 if it was
// running hotter when the server died. Without this, failsafe averaged
// the two (set both to ~50%) and lost the calibration the operator
// spent days tuning.
float failsafeCh1Ratio   = 1.0f;  // ch1 share of failsafe mean (default 0.5/0.5)
float failsafeCh2Ratio   = 1.0f;  // ch2 share of failsafe mean (default 0.5/0.5)
float currentSetpoint    = 33.5; // Default day-1 setpoint
float currentFallbackDelta = 0.0; // Tier-2 bias subtracted from local SHT40 when zone stale
                                    // (positive = heater-zone reads hotter than chick-zone)

unsigned long lastMqttCmdMs     = 0;
uint8_t       normalConfirmCount = 0;    // v1.3.1: # of fresh server packets (≤ NORMAL_CONFIRM_WINDOW_MS old) accumulated toward NORMAL_CONFIRM_REQUIRED. Reset on enterFailsafe().
unsigned long lastValidCommunicationMs = 0; // v1.4.4: timestamp of last confirmed-good WiFi+MQTT+lively-server state. Used by the 30s grace period in loop() to absorb WiFi micro-drops and MQTT reconnect flaps without flipping to FAILSAFE.
unsigned long lastTelemetryMs   = 0;
unsigned long lastHeartbeatMs   = 0;
unsigned long lastSensorReadMs  = 0;
unsigned long lastWifiRetryMs   = 0;
unsigned long lastMqttRetryMs   = 0;

bool sht4_ok = false;
// v1.4.2 (firmware bug 4): consecutive-failure counter. Single I2C
// glitches (ESD, brown-out on shared PSU, momentary bus contention)
// can return false from getEvent() even though the sensor is alive.
// Previously a single failure latched sht4_ok=false forever — the
// sensor failsafe clamp (Tier-3, heater OFF) stayed engaged until a
// reboot. With SHT4_FAIL_THRESHOLD=5 at 2s cadence, the counter fills
// in 10s of sustained failure (the I2C bus is really dead or the
// sensor is unplugged). One transient blip no longer latches.
uint8_t sht4_fail_count = 0;

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
    // v1.4.0 — Provisioning flow (priority order):
    //   1. DEVICE_CODE compile-time constant (USER CONFIG) — used when set
    //      non-empty so this ESP32 matches a pre-created DB row.
    //   2. NVS cache ("brooder" namespace, key "device_code") — wins on
    //      subsequent boots so the code stays stable even if the constant
    //      is cleared later.
    //   3. Fallback: derive from MAC last 3 bytes (esp-XXXXXX universal
    //      scheme, no type prefix) so each freshly-flashed ESP gets a unique
    //      code without manual editing per chip.
    //   4. Auto-persist the resolved code to NVS so it survives reboot
    //      AND the server sees a stable code in subsequent telemetry.

    // Step 1: compile-time constant (only on first boot, before NVS exists)
    if (DEVICE_CODE[0] != '\0') {
        String from_const = String(DEVICE_CODE);
        // Cache to NVS so subsequent boots use the stable cached value
        prefs.begin("brooder", false);
        prefs.putString("device_code", from_const);
        prefs.end();
        Serial.printf("Device code from compile-time constant: %s\n",
                      from_const.c_str());
        return from_const;
    }

    // Step 2: NVS cache (stable across reboots)
    prefs.begin("brooder", true);
    String device_code = prefs.getString("device_code", "");
    prefs.end();
    if (device_code.length() == 0) {
        // Step 3: derive from MAC (universal esp-XXXXXX, no type prefix)
        uint8_t mac[6];
        WiFi.macAddress(mac);
        char buf[32];
        snprintf(buf, sizeof(buf), "esp-%02X%02X%02X",
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
    // v1.4.4: reset the 30s grace clock too. After a fresh MQTT
    // reconnect (typically following a server restart or WiFi recovery)
    // we want the device to enjoy a full grace window before any
    // single dropped packet can flip it to FAILSAFE. Without this,
    // lastValidCommunicationMs might be 30+ seconds stale at the
    // moment of reconnect → first transient WiFi blip after reconnect
    // would immediately trip SUSTAINED-DISCONNECT. Setting it here
    // means: "we just confirmed the link is good; treat it as good
    // for the next 30s regardless of subsequent blips".
    lastValidCommunicationMs = millis();

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
            noteServerCommand();   // v1.3.1: bumps normalConfirmCount for hysteresis

            // Returning to NORMAL from FAILSAFE → preload PID for next time
            if (currentMode == MODE_FAILSAFE) {
                int avg = (ch1 + ch2) / 2;
                preloadPidIntegral(map(avg, 0, 100, 0, PID_OUTPUT_MAX));
                // v1.3.1: don't flip mode here — let the loop's hysteresis
                // (NORMAL_CONFIRM_REQUIRED consecutive packets) decide.
                // This avoids a single stale/retained packet kicking us
                // out of failsafe mid-incident.
            }
            // v1.3.1: currentMode = MODE_NORMAL removed — set by enterNormal()
            // in the main loop once normalConfirmCount >= NORMAL_CONFIRM_REQUIRED.
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
            noteServerCommand();   // v1.3.1: counts toward NORMAL confirm
            Serial.println("CMD: ping received");
        } else if (strcmp(action, "reboot") == 0) {
            Serial.println("CMD: reboot requested");
            delay(100);
            ESP.restart();
        } else if (strcmp(action, "clear_failsafe") == 0) {
            // v1.3.1: operator override — bypass hysteresis (explicit intent).
            Serial.println("CMD: clear_failsafe (operator override)");
            normalConfirmCount = 0;
            noteServerCommand();
            enterNormal();   // uses enterNormal() so LED/serial/status published cleanly
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

// v1.4.2 (firmware bug 4 hardening): hard I2C bus recovery. Industrial
// noise (SSR switching transients, VFD harmonics, contactor arcs on the
// shared 24V PSU) can latch a slave device's SDA line LOW — the slave
// chip is still powered and holding the data line down waiting for a
// clock pulse to release it. Wire.begin() / sht4.begin() can't recover
// this because the ESP32's I2C peripheral is the MASTER — it never
// initiates a clock unless it's already in a transaction. So Wire stays
// quiet, slave stays latched, every subsequent getEvent() returns false.
//
// The recovery procedure (per UM10204 §3.1.16 "Bus stuck low recovery"):
//   1. Reconfigure SCL pin as GPIO push-pull OUTPUT (bypass Wire peripheral)
//   2. Toggle SCL HIGH/LOW 9 times to clock out any stuck slave — each
//      rising edge gives the SDA-low holder one clock to release
//   3. Generate a STOP condition: SDA LOW → SDA HIGH while SCL HIGH
//      (this is what every I2C transaction ends with; without it, any
//      partial transaction stays pending in slave state machines)
//   4. Return SCL/SDA pins to Wire peripheral via I2C_Bus.begin()
//
// Cost: ~10ms (9 toggles @ ~1ms each + Wire re-init). Called only on
// the FIRST I2C failure after a stretch of OK reads, so steady-state
// cost is zero.
void i2cBusRecovery() {
    Serial.println("  I2C bus recovery: toggling SCL as GPIO to free stuck slave...");
    // Step 1: bypass Wire, take direct control of SCL pin
    pinMode(I2C_SCL, OUTPUT);
    digitalWrite(I2C_SCL, HIGH);   // start from idle-high (I2C spec)
    delayMicroseconds(5);

    // Step 2: clock out stuck slave — 9 pulses per UM10204 recommendation
    for (int i = 0; i < 9; i++) {
        digitalWrite(I2C_SCL, LOW);
        delayMicroseconds(5);
        digitalWrite(I2C_SCL, HIGH);
        delayMicroseconds(5);
    }

    // Step 3: manual STOP — SDA LOW while SCL HIGH, then SDA HIGH
    pinMode(I2C_SDA, OUTPUT);
    digitalWrite(I2C_SDA, LOW);
    delayMicroseconds(5);
    digitalWrite(I2C_SCL, HIGH);
    delayMicroseconds(5);
    digitalWrite(I2C_SDA, HIGH);
    delayMicroseconds(5);

    // Step 4: hand pins back to Wire peripheral
    I2C_Bus.begin(I2C_SDA, I2C_SCL, 100000);
}

void readSensors() {
    sensors_event_t hum_event, temp_event;
    // v1.4.2 (firmware bug 4): single I2C failure no longer latches the
    // sensor failsafe clamp. The previous "if (!sht4_ok) skip getEvent()"
    // pattern at line 630 meant that once sht4_ok dropped to false, the
    // sensor was never re-probed and the Tier-3 heater-OFF clamp stayed
    // engaged until reboot. Now we always attempt a read regardless of
    // sht4_ok's prior value, count consecutive failures, and only latch
    // false after SHT4_FAIL_THRESHOLD=5 misses (≈10s at 2s cadence). The
    // first transient failure also re-initializes I2C bus + SHT40 driver
    // — many I2C lockups (line noise, brown-out on shared PSU) clear with
    // a fresh begin().
    bool read_success = false;

    if (sht4.getEvent(&hum_event, &temp_event)) {
        temp        = temp_event.temperature;
        hum         = hum_event.relative_humidity;
        read_success = true;
    }

    if (read_success) {
        // Reset failure counter + re-arm sht4_ok on first success after
        // a transient outage. If it was latched false (5+ consecutive
        // failures), one good read is enough to recover — the user gets
        // their heater back without a power cycle.
        if (sht4_fail_count > 0 || !sht4_ok) {
            Serial.printf("SHT40 recovered after %u failed read(s)\n",
                          sht4_fail_count);
            sht4_fail_count = 0;
            sht4_ok = true;
        }
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
        // v1.4.2 (firmware bug 4): count consecutive failures, re-init
        // I2C + driver on the FIRST failure (most common cause of a
        // single read fail is bus lockup that a fresh begin() clears),
        // and only latch sht4_ok=false after SHT4_FAIL_THRESHOLD misses.
        // The Tier-3 sensor-failsafe clamp (heater OFF) checks sht4_ok,
        // so a single glitch now degrades to one Tier-2 cycle using the
        // previous filtered temp_pid instead of zeroing the heater.
        if (sht4_fail_count == 0) {
            // First failure after a stretch of OK reads → run the
            // HARD I2C bus recovery sequence (clock-out stuck slave +
            // STOP condition + Wire re-init). Plain Wire.begin() can't
            // recover from SDA-low latching because the ESP32's I2C
            // peripheral won't initiate clocks without an active
            // transaction — see i2cBusRecovery() docstring.
            i2cBusRecovery();
            sht4.begin(&I2C_Bus);
            Serial.println("  I2C bus + SHT40 driver re-initialized after "
                           "transient recovery attempt");
        }
        sht4_fail_count++;
        if (sht4_fail_count >= SHT4_FAIL_THRESHOLD) {
            if (sht4_ok) {
                Serial.printf("  SHT40 latched DEAD after %u consecutive "
                              "failures — Tier-3 failsafe engaged\n",
                              sht4_fail_count);
            }
            // Propagate the failure into the boot flag so the loop-level
            // failsafe clamp (heater OFF) kicks in.
            sht4_ok = false;
        }
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

    // v1.4.2 (firmware bug 3): update pidLastTempPid BEFORE the deadband
    // check so the D-term on the first tick AFTER exiting the band sees
    // a fresh measurement. Previously the deadband returned early and
    // pidLastTempPid was never updated → if the controller sat inside
    // the deadband for 30 seconds (typical steady-state in the user's
    // barn-05 setpoint=30°C / temp=30.1°C case), the first D-term after
    // exiting measured "rate of change" = (current_temp - stale_pid) / 1s
    // — typically 0.3-2°C/s, but with Kd=25 the kick output spike was
    // ±20% which the user could hear as a relay click. Tracking the latest
    // temp_pid every tick (regardless of deadband) keeps the derivative
    // fresh and bounded by the actual measurement rate.
    float prevPidTemp = pidLastTempPid;
    pidLastTempPid = temp_pid;

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
    // pidLastTempPid already updated above (so derivative here uses the
    // freshest sample), with prevPidTemp as the "previous" reference.
    float derivative = -(temp_pid - prevPidTemp) / dt;
    float D = PID_KD * derivative;

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
    //
    // v1.4.2 (firmware bug 5): threshold is MIN_VALID_DAC_OFF, not
    // MIN_VALID_DAC. The hysteresis in applyPower() defines three bands:
    //   p >= MIN_VALID_DAC (6)        → ON
    //   p <  MIN_VALID_DAC_OFF (3)    → OFF
    //   p in [3, 6)                   → hold previous state
    // The pre-v1.4.2 clamp at this site used MIN_VALID_DAC (6) which
    // COLLAPSED the [3, 6) hold-band on un-wired boards — every p in
    // [3, 6) was force-zeroed, defeating hysteresis. Fix: use the same
    // OFF threshold (3) that applyPower() uses to enter the OFF state.
    // The [3, 6) band then correctly holds state on both wired and
    // un-wired boards.
#if POWER_ENABLE_PIN < 0
    if (dac > 0 && dac < MIN_VALID_DAC_OFF) {
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

    // v1.4.2 (firmware bug 1): slew-rate limit ONLY in FAILSAFE. The server
    // already publishes with its own SLEW_PCT_PER_TICK=5 clamp on each tick,
    // so layering a 3%/s slew here doubles the rate-limit and creates a
    // noticeable lag when the operator pushes setpoint (e.g. from 28°C to
    // 33°C → server publishes 100%/tick but firmware slews at 3%/s, so
    // convergence to target takes 33+ seconds instead of <1). In NORMAL
    // mode the server's per-tick slew is authoritative; tracking it
    // 1-for-1 keeps operator responsiveness. The slew is still essential
    // in FAILSAFE because the local PID loop runs at 1Hz with no server
    // moderation — without it a saturation recovery would slam 0→100%
    // in one tick.
    if (currentMode == MODE_FAILSAFE) {
        int delta = p - currentPower;
        if (delta >  MAX_SLEW_PER_SEC) delta =  MAX_SLEW_PER_SEC;
        if (delta < -MAX_SLEW_PER_SEC) delta = -MAX_SLEW_PER_SEC;
        p = currentPower + delta;
        if (p < 0)              p = 0;
        if (p > PID_OUTPUT_MAX) p = PID_OUTPUT_MAX;
    }

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

    // v1.4.2 (firmware bug 2): in FAILSAFE, scale per-channel by the
    // ratio captured in enterFailsafe() so the operator-tuned bias
    // (e.g. ch1:90%, ch2:10%) survives the server outage. The shared
    // failsafe PID computes one "mean" output; multiplying by 2.0 ×
    // (refCh1 / (refCh1 + refCh2)) gives back the original per-channel
    // percentage when refCh1:refCh2 = 9:1 (for example). Both channels
    // get clamped to [0,100] so a bias-heavy ratio doesn't go negative.
    // In NORMAL the per-channel command comes straight from the server
    // via mqttCallback → applyPowerChannel, no scaling needed.
    if (currentMode == MODE_FAILSAFE) {
        int pctCh1 = constrain((int)(pct * failsafeCh1Ratio), 0, 100);
        int pctCh2 = constrain((int)(pct * failsafeCh2Ratio), 0, 100);
        applyPowerChannel(1, pctCh1);
        applyPowerChannel(2, pctCh2);
    } else {
        applyPowerChannel(1, pct);
        applyPowerChannel(2, pct);
    }
}

// ==================== TELEMETRY ====================

void publishTelemetry() {
    if (!mqttClient.connected()) return;

    StaticJsonDocument<512> doc;
    doc["device_code"]    = device_code;
    doc["device_type"]    = DEVICE_TYPE;
    doc["fw_version"]     = FIRMWARE_VERSION;
    // Legacy single-sensor aliases — keep for back-compat with v1.2 server code.
    doc["temp"]           = temp;
    doc["hum"]            = hum;
    // Multi-sensor field names — server's _on_telemetry expects these for
    // its Tier-1/Tier-2 PID input selection (BrooderController + ZoneController).
    // Single-SHT40 firmware maps all three to the same `temp` value so the
    // server's min(temp1, temp2) collapses to temp without bias.
    doc["temp1"]          = temp;
    doc["temp2"]          = temp;            // single sensor → same as temp1
    doc["temp_min"]       = temp;            // min(temp1, temp2) for 1 sensor
    doc["hum_avg"]        = hum;
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

// v1.3.1: helper to stamp "real" server commands. Centralizes the
// lastMqttCmdMs + normalConfirmCount++ so future cmd topics can't
// forget to bump the confirm counter.
void noteServerCommand() {
    lastMqttCmdMs = millis();
    if (normalConfirmCount < 255) normalConfirmCount++;
}

void enterFailsafe() {
    if (currentMode == MODE_FAILSAFE) return;
    Serial.println(">>> ENTERING FAILSAFE (local PID) <<<");

    // v1.3.1: any prior NORMAL confirmations are now stale — start fresh.
    normalConfirmCount = 0;

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
    // v1.4.2 (firmware bug 2): capture per-channel ratio for failsafe
    // output scaling. Using the LAST server-commanded per-channel values
    // (lastServerCh1/Ch2) as the reference — they're what the server's
    // per-heater PID determined was correct before connectivity dropped.
    // If both are zero (server never sent a /power packet), fall back to
    // the current DAC values (currentPowerCh1/Ch2) which the server's
    // first /power loaded. Equal split (50/50) is the safe default.
    //
    // v1.4.2 HARDENING (divide-by-zero / NaN guard): the divisor refSum
    // can be 0 in THREE legitimate scenarios, all handled by the
    // refSum>0 guard below:
    //   1. Cold start: server never sent /power yet, both channels idle
    //      → refSum=0 → fallback 50/50 (failsafeCh1Ratio=1, ch2Ratio=1)
    //   2. Warm-then-disconnect: zone is at setpoint, both heaters were
    //      commanded 0% just before server died → refSum=0 → fallback
    //      50/50 (correct: PID can ramp either channel independently)
    //   3. Single-channel brooder wired to ch1 only (legacy hardware):
    //      lastServerCh1=lastServerCh2=0 → refSum=0 → fallback 50/50
    //
    // The *per-channel* zero case is handled implicitly by ratio math:
    // if refCh1=0 and refCh2=50, failsafeCh1Ratio=0.0 and ch2Ratio=2.0.
    // constrain((int)(pct*0.0), 0, 100) = 0 → ch1 stays off (correct:
    // it was 0% before fail); constrain((int)(pct*2.0), 0, 100) = 100 →
    // ch2 gets full power when PID demands it. This preserves the
    // "asymmetric bias" the operator tuned.
    int  refCh1 = lastServerCh1 > 0 ? lastServerCh1
                                   : (currentPowerCh1 * 100) / PID_OUTPUT_MAX;
    int  refCh2 = lastServerCh2 > 0 ? lastServerCh2
                                   : (currentPowerCh2 * 100) / PID_OUTPUT_MAX;
    int  refSum = refCh1 + refCh2;
    if (refSum > 0) {
        failsafeCh1Ratio = (float)refCh1 / (float)refSum * 2.0f;
        failsafeCh2Ratio = (float)refCh2 / (float)refSum * 2.0f;
    } else {
        // Cold-start / both-channels-idle / single-channel-legacy.
        // 50/50 split: ratio=1 means pctCh1 = pct * 1 = pct (same as
        // un-scaled), pctCh2 = pct * 1 = pct → both channels get the
        // PID's mean output. Safe default that won't crash on NaN.
        failsafeCh1Ratio = 1.0f;
        failsafeCh2Ratio = 1.0f;
    }
    // Belt-and-braces: NaN guard for the (theoretically impossible)
    // case where refSum>0 but division still yields NaN (e.g. if
    // refCh1/refCh2 somehow overflow to +inf). isfinite() rejects
    // both NaN and ±inf.
    if (!isfinite(failsafeCh1Ratio)) failsafeCh1Ratio = 1.0f;
    if (!isfinite(failsafeCh2Ratio)) failsafeCh2Ratio = 1.0f;
    Serial.printf("    Failsafe per-channel ratio: ch1=%.2f ch2=%.2f "
                  "(from refCh1=%d refCh2=%d)\n",
                  failsafeCh1Ratio, failsafeCh2Ratio, refCh1, refCh2);
    preloadPidIntegral(currentPower);
    publishStatus("failsafe");
}

void enterNormal() {
    if (currentMode == MODE_NORMAL) return;
    Serial.println(">>> BACK TO NORMAL (server control) <<<");
    previousMode = currentMode;
    currentMode  = MODE_NORMAL;
    // v1.3.1: reset hysteresis counter so next FAILSAFE cycle starts clean.
    // The earlier "time-based reset" was REMOVED: server publishes /power every
    // 6s (KEEPALIVE_INTERVAL_S) which is > NORMAL_CONFIRM_WINDOW_MS (3s) —
    // the reset was firing between packets and capping normalConfirmCount at 1,
    // making hysteresis useless. /power is not retained on the broker, so no
    // retained-packet protection is needed either.
    normalConfirmCount = 0;
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
    // MQTT keepalive interval (seconds). The broker uses 1.5× this value as
    // the timeout (per MQTT 3.1.1 spec) before firing the LWT topic and
    // marking the client offline.
    //
    // Was 15s → broker timeout ≈22s → LWT fired every ~22s when telemetry
    // jitter delayed PINGREQ → server marked node mode='offline' even though
    // ESP was actually online. Bumped to 60s (broker timeout ≈90s) so a few
    // delayed cycles of telemetry/heartbeat don't trip LWT.
    //
    // v1.4.5: 60 → 90. Broker timeout = 1.5 × keepalive = 135s. Combined
    // with HEARTBEAT_INTERVAL_MS=30000 (above), broker sees traffic every
    // 30s — well within the 135s budget. Even two consecutive dropped
    // heartbeats (60s of silence) leave 75s of margin. Pre-fix, the 60s
    // keepalive was too tight: broker timeout (90s) was barely above
    // heartbeat interval, so a single dropped packet fired LWT every
    // ~90s and flipped is_online on an alive device.
    //
    // Trade-off: real offline detection now takes ~135s instead of ~90s.
    // Acceptable — server-side _store_lwt hysteresis (30s) suppresses
    // broker false-positives, and the 180s check_offline sweep still
    // catches real disconnects well under 3 minutes.
    mqttClient.setKeepAlive(90);
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
        // v1.4.4 ANTI-FLAP GRACE PERIOD (replaces pre-v1.4.4 instant flip).
        //
        // Bug being fixed: pre-v1.4.4 logic was
        //   bool serverAlive = WiFi_ok && MQTT_ok && (now-lastMqttCmd < 60s);
        //   if (serverAlive) { maybe enterNormal(); }
        //   else            { if (!failsafe) enterFailsafe(); }
        // && short-circuits instantly — a 10-100ms WiFi drop during SSR
        // switching transients flipped serverAlive=false on the very next
        // loop() iteration (10ms cadence). enterFailsafe() was called, which
        // RESET normalConfirmCount = 0. When WiFi recovered 50ms later the
        // loop saw serverAlive=true again but count was 0, so it had to wait
        // for a fresh /power packet to bump count → 1. If WiFi flapped
        // again before that packet, the cycle repeated forever: device
        // "trembles" between modes, normalConfirmCount never accumulates,
        // chicks see chaotic output.
        //
        // Fix: SUSTAINED-DISCONNECT check, not instantaneous check.
        //   - track `lastValidCommunicationMs` (updated ONLY when
        //     WiFi==OK && MQTT==OK && lastMqttCmd < FAILSAFE_TIMEOUT)
        //   - consider "sustained disconnect" only when
        //     (now - lastValidCommunicationMs) >= SERVER_GRACE_PERIOD_MS
        //     (default 30s)
        //   - during the grace window: hold last server command (already
        //     latched in currentPowerCh1/Ch2 from the last MQTT callback),
        //     do NOT call enterFailsafe(), do NOT reset normalConfirmCount
        //   - after the grace window: enter failsafe as before
        //
        // Safety preserved: EMERGENCY_LATCH_C=35.1°C cutoff and bimetal
        // 38°C hardware still active every 2s SHT40 read; brooder thermal
        // inertia (~12s/°C) bounds temperature drift to <0.5°C over 30s
        // of held output.
        bool connectionCurrentlyOk = (WiFi.status() == WL_CONNECTED)
                                     && mqttClient.connected()
                                     && (now - lastMqttCmdMs) < FAILSAFE_TIMEOUT_MS;

        if (connectionCurrentlyOk) {
            // Refresh the "last good" timestamp continuously while link is up.
            // Any single drop will stop the refresh; the 30s clock starts
            // from this most-recent-good instant.
            lastValidCommunicationMs = now;
        }

        bool isSustainedDisconnect = (now - lastValidCommunicationMs)
                                     >= SERVER_GRACE_PERIOD_MS;

        if (!isSustainedDisconnect) {
            // ---- INSIDE THE 30s GRACE WINDOW ----
            // Treat the device as NORMAL-controlled even if WiFi/MQTT
            // blipped briefly. Hardware is already at last server's
            // commanded power (currentPowerCh1/Ch2 from the last MQTT
            // callback write). Only flip modes on a CONFIRMED transition.
            if (currentMode != MODE_NORMAL) {
                if (normalConfirmCount >= NORMAL_CONFIRM_REQUIRED) {
                    Serial.printf("FAILSAFE → NORMAL, ch1=%d%% ch2=%d%% "
                                  "(avg=%d%%) (within grace window)\n",
                                  lastServerCh1, lastServerCh2, lastServerPower);
                    enterNormal();
                }
            }
            // Do NOT touch currentPowerCh1/Ch2 — they hold the last
            // server-commanded values from the most recent MQTT callback.
            // The local failsafe PID is NOT run inside the grace window.
        } else {
            // ---- SUSTAINED DISCONNECT (> 30s) ----
            // Link has been bad long enough that the server is presumed
            // truly dead. Hand authority to the local failsafe PID.
            if (currentMode != MODE_FAILSAFE) {
                Serial.printf(">>> SUSTAINED DISCONNECT (%lums > grace %lums) "
                              "-> ENTERING FAILSAFE <<<\n",
                              now - lastValidCommunicationMs,
                              SERVER_GRACE_PERIOD_MS);
                enterFailsafe();
            }

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