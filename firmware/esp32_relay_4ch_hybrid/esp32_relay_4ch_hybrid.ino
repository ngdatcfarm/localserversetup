/**
 * ESP32 Relay 4CH Hybrid Firmware v2.0.2
 *
 * DUAL-MQTT ARCHITECTURE (SIMPLIFIED):
 * - ESP32 luôn subscribe CẢ 2 MQTT brokers (local + cloud)
 * - Local commands: ưu tiên cao nhất (khi local server online)
 * - Cloud commands: fallback khi local offline
 *
 * Flow:
 * - Cloud command → Cloud MQTT 
 → ESP32
 * - Local command → Local MQTT → ESP32 (ưu tiên)
 *
 * Author: CFarm
 * Version: 2.0.2
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ============================================
// CONFIGURATION
// ============================================

// WiFi
const char* WIFI_SSID = "Dat Lim TN";
const char* WIFI_PASSWORD = "hoilamgi";

// Device Identity
const char* DEVICE_CODE = "esp-61878";
const char* DEVICE_TYPE = "relay_4ch";
const char* FIRMWARE_VERSION = "2.0.2";

// Local MQTT Broker
const char* LOCAL_MQTT_SERVER = "192.168.1.9";
const int LOCAL_MQTT_PORT = 1884;
const char* LOCAL_MQTT_USER = "cfarm_device";
const char* LOCAL_MQTT_PASS = "cfarm_device_2026";

// Cloud MQTT Broker
const char* CLOUD_MQTT_SERVER = "103.166.183.215";
const int CLOUD_MQTT_PORT = 1883;
const char* CLOUD_MQTT_USER = "cfarm_server";
const char* CLOUD_MQTT_PASS = "Abc@@123";

// ============================================
// GPIO Configuration
// ============================================

const int RELAY_PINS[4] = {18, 19, 21, 22};
const char* RELAY_NAMES[4] = {"relay1", "relay2", "relay3", "relay4"};
bool relayStates[4] = {false, false, false, false};

// ============================================
// Timing
// ============================================

const unsigned long HEARTBEAT_INTERVAL = 30000;    // 30 seconds
const unsigned long MQTT_RECONNECT_DELAY = 5000;   // 5 seconds
const unsigned long WIFI_RECONNECT_DELAY = 5000;
const unsigned long LOCAL_LOCK_MS = 30000;        // 30 seconds local priority lock

// ============================================
// Global Variables
// ============================================

WiFiClient wifiClientLocal;
WiFiClient wifiClientCloud;

PubSubClient mqttClientLocal(wifiClientLocal);
PubSubClient mqttClientCloud(wifiClientCloud);

char LOCAL_CMD_TOPIC[64];
char LOCAL_HEARTBEAT_TOPIC[64];
char CLOUD_CMD_TOPIC[64];
char CLOUD_HEARTBEAT_TOPIC[64];

unsigned long lastHeartbeat = 0;
unsigned long lastLocalReconnectAttempt = 0;
unsigned long lastCloudReconnectAttempt = 0;
unsigned long lastWifiReconnectAttempt = 0;
unsigned long lastLocalCommandTime = 0;

// Mode flags
bool useLocalCommands = true;  // true = dùng local MQTT, false = dùng cloud MQTT

// ============================================
// FUNCTION PROTOTYPES
// ============================================

void connectWiFi();
void buildTopics();
void connectLocalMqtt();
void connectCloudMqtt();
void callbackLocal(char* topic, byte* payload, unsigned int length);
void callbackCloud(char* topic, byte* payload, unsigned int length);
void handleCommand(JsonDocument& doc, const char* source);
void handleRelayCommand(JsonDocument& doc);
void setRelay(int index, bool state);
void sendHeartbeat();
void initRelays();

// ============================================
// SETUP
// ============================================

void setup() {
    Serial.begin(115200);
    Serial.println();
    Serial.println("===========================================");
    Serial.println("ESP32 Relay 4CH Hybrid v" + String(FIRMWARE_VERSION));
    Serial.println("Device: " + String(DEVICE_CODE));
    Serial.println("Mode: DUAL-MQTT (Local + Cloud) Always ON");
    Serial.println("===========================================");

    initRelays();
    connectWiFi();
    buildTopics();

    // Setup Local MQTT
    mqttClientLocal.setServer(LOCAL_MQTT_SERVER, LOCAL_MQTT_PORT);
    mqttClientLocal.setCallback(callbackLocal);
    mqttClientLocal.setBufferSize(512);
    mqttClientLocal.setKeepAlive(30);
    mqttClientLocal.setSocketTimeout(10);

    // Setup Cloud MQTT
    mqttClientCloud.setServer(CLOUD_MQTT_SERVER, CLOUD_MQTT_PORT);
    mqttClientCloud.setCallback(callbackCloud);
    mqttClientCloud.setBufferSize(512);
    mqttClientCloud.setKeepAlive(30);
    mqttClientCloud.setSocketTimeout(10);

    // Connect both MQTT
    connectLocalMqtt();
    connectCloudMqtt();

    Serial.println("Setup complete!");
}

// ============================================
// MAIN LOOP
// ============================================

void loop() {
    unsigned long now = millis();

    // Handle WiFi
    if (WiFi.status() != WL_CONNECTED) {
        if (now - lastWifiReconnectAttempt >= WIFI_RECONNECT_DELAY) {
            lastWifiReconnectAttempt = now;
            connectWiFi();
        }
    }

    // Handle Local MQTT
    if (mqttClientLocal.connected()) {
        mqttClientLocal.loop();
    } else {
        if (now - lastLocalReconnectAttempt >= MQTT_RECONNECT_DELAY) {
            lastLocalReconnectAttempt = now;
            connectLocalMqtt();
        }
    }

    // Handle Cloud MQTT
    if (mqttClientCloud.connected()) {
        mqttClientCloud.loop();
    } else {
        if (now - lastCloudReconnectAttempt >= MQTT_RECONNECT_DELAY) {
            lastCloudReconnectAttempt = now;
            connectCloudMqtt();
        }
    }

    // Heartbeat (chỉ gửi local, cloud subscribe thôi)
    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
        sendHeartbeat();
        lastHeartbeat = now;
    }

    delay(10);
}

// ============================================
// WIFI
// ============================================

void connectWiFi() {
    Serial.println("Connecting to WiFi: " + String(WIFI_SSID));
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(250);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.println("WiFi Connected! IP: " + WiFi.localIP().toString());
        Serial.print("RSSI: ");
        Serial.println(WiFi.RSSI());
    } else {
        Serial.println();
        Serial.println("WiFi connection failed!");
    }
}

// ============================================
// TOPIC BUILDING
// ============================================

void buildTopics() {
    snprintf(LOCAL_CMD_TOPIC, sizeof(LOCAL_CMD_TOPIC), "cfarm/%s/cmd", DEVICE_CODE);
    snprintf(LOCAL_HEARTBEAT_TOPIC, sizeof(LOCAL_HEARTBEAT_TOPIC), "cfarm/%s/heartbeat", DEVICE_CODE);
    snprintf(CLOUD_CMD_TOPIC, sizeof(CLOUD_CMD_TOPIC), "cfarm.vn/%s/cmd", DEVICE_CODE);
    snprintf(CLOUD_HEARTBEAT_TOPIC, sizeof(CLOUD_HEARTBEAT_TOPIC), "cfarm.vn/%s/heartbeat", DEVICE_CODE);
}

// ============================================
// MQTT - LOCAL
// ============================================

void connectLocalMqtt() {
    Serial.print("[LOCAL] Connecting to MQTT... ");

    if (mqttClientLocal.connected()) {
        mqttClientLocal.disconnect();
        delay(100);
    }

    bool connected = mqttClientLocal.connect(DEVICE_CODE, LOCAL_MQTT_USER, LOCAL_MQTT_PASS);

    if (connected) {
        Serial.println("OK");
        mqttClientLocal.loop();
        delay(100);
        if (mqttClientLocal.subscribe(LOCAL_CMD_TOPIC)) {
            Serial.println("[LOCAL] Subscribed: " + String(LOCAL_CMD_TOPIC));
        }
    } else {
        Serial.print("FAILED rc=");
        Serial.println(mqttClientLocal.state());
    }
}

void callbackLocal(char* topic, byte* payload, unsigned int length) {
    Serial.println("[LOCAL] MQTT: " + String(topic));

    // Local commands luôn được xử lý, cập nhật lastLocalCommandTime
    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, payload, length) == DeserializationError::Ok) {
        handleCommand(doc, "LOCAL");
        lastLocalCommandTime = millis();
        useLocalCommands = true;
    }
}

// ============================================
// MQTT - CLOUD
// ============================================

void connectCloudMqtt() {
    Serial.print("[CLOUD] Connecting to MQTT... ");

    if (mqttClientCloud.connected()) {
        mqttClientCloud.disconnect();
        delay(100);
    }

    char clientId[64];
    snprintf(clientId, sizeof(clientId), "%s_cloud", DEVICE_CODE);

    bool connected = mqttClientCloud.connect(clientId, CLOUD_MQTT_USER, CLOUD_MQTT_PASS);

    if (connected) {
        Serial.println("OK");
        mqttClientCloud.loop();
        delay(100);
        if (mqttClientCloud.subscribe(CLOUD_CMD_TOPIC)) {
            Serial.println("[CLOUD] Subscribed: " + String(CLOUD_CMD_TOPIC));
        }
    } else {
        Serial.print("FAILED rc=");
        Serial.println(mqttClientCloud.state());
    }
}

void callbackCloud(char* topic, byte* payload, unsigned int length) {
    Serial.println("[CLOUD] MQTT: " + String(topic));

    // Cloud commands chỉ được xử lý khi:
    // 1. Local MQTT không connected HOẶC
    // 2. Đã hết local priority lock (30s)
    unsigned long elapsed = millis() - lastLocalCommandTime;
    bool localConnected = mqttClientLocal.connected();

    if (!localConnected || elapsed >= LOCAL_LOCK_MS) {
        // Local offline hoặc hết lock time → xử lý cloud command
        StaticJsonDocument<256> doc;
        if (deserializeJson(doc, payload, length) == DeserializationError::Ok) {
            handleCommand(doc, "CLOUD");
        }
    } else {
        Serial.println("[CLOUD] Command SKIPPED - local priority lock active");
        Serial.printf("  local_connected=%d, elapsed=%lu, lock=%lu\n",
            localConnected, elapsed, LOCAL_LOCK_MS);
    }
}

// ============================================
// COMMAND HANDLING
// ============================================

void handleCommand(JsonDocument& doc, const char* source) {
    Serial.printf("[%s] Command: ", source);

    const char* action = doc["action"] | "";

    if (strcmp(action, "relay") == 0) {
        handleRelayCommand(doc);
    } else if (strcmp(action, "ping") == 0) {
        Serial.println("PING");
    } else if (strcmp(action, "test") == 0) {
        Serial.println("TEST");
    } else {
        Serial.println(action);
    }
}

void handleRelayCommand(JsonDocument& doc) {
    int relayIndex = -1;
    bool state = false;

    // Format 1: {"relay":"relay1", "state":true}
    if (doc.containsKey("relay")) {
        const char* relayName = doc["relay"];
        for (int i = 0; i < 4; i++) {
            if (strcmp(relayName, RELAY_NAMES[i]) == 0) {
                relayIndex = i;
                break;
            }
        }
        state = doc["state"] | false;
    }
    // Format 2: {"channel":1, "state":"on"}
    else if (doc.containsKey("channel")) {
        int channel = doc["channel"].as<int>();
        if (channel >= 1 && channel <= 4) {
            relayIndex = channel - 1;
        }
        const char* stateStr = doc["state"] | "off";
        state = (strcmp(stateStr, "on") == 0 || strcmp(stateStr, "true") == 0);
    }

    if (relayIndex >= 0 && relayIndex < 4) {
        setRelay(relayIndex, state);
        Serial.printf("Relay %d => %s\n", relayIndex + 1, state ? "ON" : "OFF");
    } else {
        Serial.println("Invalid relay");
    }
}

void setRelay(int index, bool state) {
    if (index < 0 || index >= 4) return;
    relayStates[index] = state;
    digitalWrite(RELAY_PINS[index], state ? LOW : HIGH);
}

// ============================================
// HEARTBEAT
// ============================================

void sendHeartbeat() {
    StaticJsonDocument<512> doc;
    doc["device_code"] = DEVICE_CODE;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["device_type"] = DEVICE_TYPE;
    doc["uptime_seconds"] = millis() / 1000;
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["ip_address"] = WiFi.localIP().toString();
    doc["free_heap"] = ESP.getFreeHeap();
    doc["local_mqtt"] = mqttClientLocal.connected();
    doc["cloud_mqtt"] = mqttClientCloud.connected();
    doc["local_lock_remaining_ms"] = (lastLocalCommandTime > 0) ?
        (lastLocalCommandTime + LOCAL_LOCK_MS > millis() ?
            (lastLocalCommandTime + LOCAL_LOCK_MS - millis()) : 0) : 0;

    JsonObject relays = doc.createNestedObject("relays");
    for (int i = 0; i < 4; i++) {
        relays[RELAY_NAMES[i]] = relayStates[i] ? "on" : "off";
    }

    char buffer[512];
    serializeJson(doc, buffer);

    Serial.printf("Heartbeat: local=%d cloud=%d\n",
        mqttClientLocal.connected(),
        mqttClientCloud.connected());

    if (mqttClientLocal.connected()) {
        mqttClientLocal.loop();
        delay(10);
        bool sent = mqttClientLocal.publish(LOCAL_HEARTBEAT_TOPIC, buffer, false);
        if (sent) {
            Serial.println("Heartbeat OK");
        }
        mqttClientLocal.loop();
    }
}

// ============================================
// INIT
// ============================================

void initRelays() {
    Serial.println("Initializing relays...");
    for (int i = 0; i < 4; i++) {
        pinMode(RELAY_PINS[i], OUTPUT);
        digitalWrite(RELAY_PINS[i], HIGH);  // OFF
        relayStates[i] = false;
    }
    Serial.println("Relays initialized (OFF state)");
}
