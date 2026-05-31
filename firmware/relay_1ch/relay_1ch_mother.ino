/**
 * ESP-01 Relay 1CH Mother Code v5.4
 * =================================
 * Hardware: ESP-01 (ESP8266) + Relay Module 1 kênh
 * Channels: 1 (Relay on GPIO2)
 * Features:
 *   - Dual MQTT (Local + Cloud)
 *   - Non-blocking State Machine
 *   - Watchdog 2 phut (MQTT Dead Timeout)
 *   - Auto Hard Reset every 24 hours
 *   - Millis Overflow Protection (50+ days safe)
 *   - Anti Wi-Fi Stack Crash protection
 *
 * MQTT Topics:
 *   - Subscribe: cfarm/esp/cmd (local)
 *   - Publish: cfarm/esp/relay_1ch_mother/status (local)
 *
 * Command Format:
 *   {"s":1} - Bat relay
 *   {"s":0} - Tat relay
 *
 * Install:
 *   1. Set DEVICE_ID, WIFI_SSID, WIFI_PASS
 *   2. Set mqttL.setServer() for local broker
 *   3. Set mqttC.setServer/cloud credentials for cloud
 *   4. Compile and upload via Arduino IDE / PlatformIO
 */

// ================= CONFIG (THAY DOI TAI DAY) =================
#define DEVICE_ID     "relay_1ch_mother"    // DOI ten theo tung thiet bi
#define WIFI_SSID     "Dat Lim"             // DOI SSID WiFi
#define WIFI_PASS     "hoilamgi"            // DOI Password WiFi

#define RELAY_PIN     2                     // GPIO2 = Relay (khong doi)

// ================= MQTT SERVERS =================
#define LOCAL_MQTT_IP   "192.168.1.9"      // Local broker (mqttLan)
#define LOCAL_MQTT_PORT 1884

#define CLOUD_MQTT_IP   "103.166.183.215"  // Cloud broker (mqttCloud)
#define CLOUD_MQTT_PORT 1883
#define CLOUD_USER      "cfarm_server"
#define CLOUD_PASS      "Abc@@123"

#include <ESP8266WiFi.h>
#include <PubSubClient.h>

WiFiClient nL, nC;
PubSubClient mqttL(nL);
PubSubClient mqttC(nC);

// ================= STATE MACHINE =================
enum NetState { DOWN, CONNECTING, UP };
NetState wifiState = DOWN;

// ================= STATIC BUFFERS =================
char CLOUD_CLIENT_ID[32];

unsigned long tWifi = 0;
unsigned long tL = 0;
unsigned long tC = 0;

// Bo dem song doc lap (Khoi tao moc an toan)
unsigned long lastLocalPingAck = 0;
unsigned long lastCloudPingAck = 0;

// ================= TIMEOUTS =================
const unsigned long WIFI_RETRY         = 15000UL;      // 15s cho Wi-Fi Stack
const unsigned long MQTT_RETRY         = 5000UL;       // 5s retry MQTT
const unsigned long MQTT_DEAD_TIMEOUT  = 120000UL;     // 2 phut de do chan chet
const unsigned long HARD_RESET         = 86400000UL;    // 24 tieng tu khoi dong lai

bool relayState = false;

// ================= RELAY SAFE BOOT =================
void relayInitSafe() {
  digitalWrite(RELAY_PIN, HIGH);
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, HIGH);
}

void setRelay(bool s) {
  if (relayState == s) return;
  relayState = s;
  digitalWrite(RELAY_PIN, s ? LOW : HIGH);
}

// ================= ZERO HEAP PARSER =================
void parse(byte* p, unsigned int l) {
  if (l < 5) return;
  for (unsigned int i = 0; i < l - 4; i++) {
    if (p[i] == '"' && p[i+1] == 's' && p[i+2] == '"' && p[i+3] == ':') {
      setRelay(p[i+4] == '1');
      return;
    }
  }
}

// ================= CALLBACKS =================
void cbL(char*, byte* p, unsigned int l) {
  parse(p, l);
  lastLocalPingAck = millis();
}

void cbC(char*, byte* p, unsigned int l) {
  parse(p, l);
  lastCloudPingAck = millis();
}

// ================= WIFI STATE MACHINE =================
void wifiMachine() {
  if (WiFi.status() == WL_CONNECTED) {
    if (wifiState != UP) {
      wifiState = UP;
      tWifi = millis();
    }
    return;
  }

  if (wifiState == UP) {
    wifiState = DOWN;
    tWifi = millis();
  }

  if (millis() - tWifi > WIFI_RETRY) {
    tWifi = millis();
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASS);
  }
}

// ================= MQTT CONNECT ENGINE =================
void connectMQTT() {
  if (WiFi.status() != WL_CONNECTED) return;

  unsigned long now = millis();

  // Kenh Local (Mang LAN noi bo)
  if (!mqttL.connected()) {
    if (now - tL > MQTT_RETRY) {
      tL = now;
      mqttL.setBufferSize(256);
      if (mqttL.connect(DEVICE_ID, "cfarm_device", "cfarm_device_2026")) {
        mqttL.subscribe("cfarm/esp/cmd");
        lastLocalPingAck = millis();
      }
    }
  }

  // Kenh Cloud (Mang WAN Internet)
  if (!mqttC.connected()) {
    if (now - tC > MQTT_RETRY) {
      tC = now;
      mqttC.setBufferSize(256);
      if (mqttC.connect(CLOUD_CLIENT_ID, CLOUD_USER, CLOUD_PASS)) {
        mqttC.subscribe("cfarm.vn/esp/cmd");
        lastCloudPingAck = millis();
      }
    }
  }
}

// ================= INDUSTRIAL WATCHDOG =================
void watchdog() {
  unsigned long now = millis();

  // Local MQTT watchdog
  if (mqttL.connected()) {
    if (now - lastLocalPingAck > MQTT_DEAD_TIMEOUT) {
      mqttL.disconnect();
      nL.stop();
      lastLocalPingAck = now;
    }
  } else {
    lastLocalPingAck = now;
  }

  // Cloud MQTT watchdog
  if (mqttC.connected()) {
    if (now - lastCloudPingAck > MQTT_DEAD_TIMEOUT) {
      mqttC.disconnect();
      nC.stop();
      lastCloudPingAck = now;
    }
  } else {
    lastCloudPingAck = now;
  }

  // Hard reset 24 tieng (chong lao hoa)
  if (now > HARD_RESET) {
    ESP.restart();
  }
}

// ================= CORE LOOP (NON-BLOCKING) =================
void loop() {
  wifiMachine();
  connectMQTT();
  watchdog();

  if (mqttL.connected() && mqttL.loop()) {
    lastLocalPingAck = millis();
  }

  if (mqttC.connected() && mqttC.loop()) {
    lastCloudPingAck = millis();
  }

  delay(2);
}

// ================= SETUP =================
void setup() {
  relayInitSafe();

  snprintf(CLOUD_CLIENT_ID, sizeof(CLOUD_CLIENT_ID), "%s_c", DEVICE_ID);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  mqttL.setServer(LOCAL_MQTT_IP, LOCAL_MQTT_PORT);
  mqttC.setServer(CLOUD_MQTT_IP, CLOUD_MQTT_PORT);

  mqttL.setCallback(cbL);
  mqttC.setCallback(cbC);

  tWifi = millis();
  tL = millis();
  tC = millis();
  lastLocalPingAck = millis();
  lastCloudPingAck = millis();
}
