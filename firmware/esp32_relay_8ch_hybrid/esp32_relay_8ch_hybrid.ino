/**
 * ESP32 Relay 8CH Hybrid Firmware
 *
 * Dual-subscribe MQTT firmware for farm automation
 * - Subscribes to LOCAL MQTT broker (priority)
 * - Subscribes to CLOUD MQTT broker (fallback)
 * - Reports firmware version in heartbeat
 * - Supports OTA updates from local server
 *
 * Author: CFarm
 * Version: 1.0.0
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <HTTPClient.h>

// ============================================
// CONFIGURATION - Edit these values
// ============================================

// WiFi
const char* WIFI_SSID = "Dat Lim";
const char* WIFI_PASSWORD = "hoilamgi";

// Device Identity
const char* DEVICE_CODE = "esp-001";        // Must match device_code in local DB
const char* DEVICE_TYPE = "relay_8ch";      // relay_4ch, relay_8ch, sensor, mixed

// Local Server (where this firmware will check for OTA)
const char* LOCAL_SERVER = "http://192.168.1.9:8000";  // Local server IP

// MQTT Brokers
const char* LOCAL_MQTT_SERVER = "192.168.1.9";  // Local Mosquitto IP
const int LOCAL_MQTT_PORT = 1883;
const char* LOCAL_MQTT_USER = "cfarm";
const char* LOCAL_MQTT_PASS = "cfarm_local";

const char* CLOUD_MQTT_SERVER = "103.166.183.215";
const int CLOUD_MQTT_PORT = 1883;
const char* CLOUD_MQTT_USER = "cfarm_server";
const char* CLOUD_MQTT_PASS = "Abc@@123";

// Firmware Info
const char* FIRMWARE_VERSION = "1.0.0";
const char* FIRMWARE_NAME = "esp32_relay_8ch_hybrid";

// ============================================
// GPIO Configuration
// ============================================

// Relay GPIO pins (common ESP32 safe pins)
const int RELAY_PINS[8] = {18, 19, 21, 22, 23, 25, 26, 27};
const char* RELAY_KEYS[8] = {
    "relay1", "relay2", "relay3", "relay4",
    "relay5", "relay6", "relay7", "relay8"
};

bool relayStates[8] = {false, false, false, false, false, false, false, false};

// ============================================
// Timing Configuration
// ============================================

const unsigned long HEARTBEAT_INTERVAL = 30000;    // 30 seconds
const unsigned long WIFI_RECONNECT_DELAY = 5000;   // 5 seconds
const unsigned long OTA_CHECK_INTERVAL = 300000;  // 5 minutes

// Local command lock duration (30 seconds priority)
const unsigned long LOCAL_LOCK_MS = 30000;

// ============================================
// Global Variables
// ============================================

WiFiClient wifiClient;
PubSubClient localMqttClient;
PubSubClient cloudMqttClient;

unsigned long lastHeartbeat = 0;
unsigned long lastOtaCheck = 0;
unsigned long lastLocalCommandTime = 0;

// Connection state
bool localConnected = false;
bool cloudConnected = false;

// ============================================
// TOPIC NAMES
// ============================================

char LOCAL_CMD_TOPIC[64];
char LOCAL_HEARTBEAT_TOPIC[64];
char LOCAL_ACK_TOPIC[64];
char LOCAL_OTA_TOPIC[64];

char CLOUD_CMD_TOPIC[64];
char CLOUD_HEARTBEAT_TOPIC[64];
char CLOUD_ACK_TOPIC[64];

void buildTopics() {
    // Local topics: cfarm/{device_code}/...
    snprintf(LOCAL_CMD_TOPIC, sizeof(LOCAL_CMD_TOPIC), "cfarm/%s/cmd", DEVICE_CODE);
    snprintf(LOCAL_HEARTBEAT_TOPIC, sizeof(LOCAL_HEARTBEAT_TOPIC), "cfarm/%s/heartbeat", DEVICE_CODE);
    snprintf(LOCAL_ACK_TOPIC, sizeof(LOCAL_ACK_TOPIC), "cfarm/%s/ack", DEVICE_CODE);
    snprintf(LOCAL_OTA_TOPIC, sizeof(LOCAL_OTA_TOPIC), "cfarm/%s/ota", DEVICE_CODE);

    // Cloud topics: cfarm.vn/{device_code}/...
    snprintf(CLOUD_CMD_TOPIC, sizeof(CLOUD_CMD_TOPIC), "cfarm.vn/%s/cmd", DEVICE_CODE);
    snprintf(CLOUD_HEARTBEAT_TOPIC, sizeof(CLOUD_HEARTBEAT_TOPIC), "cfarm.vn/%s/heartbeat", DEVICE_CODE);
    snprintf(CLOUD_ACK_TOPIC, sizeof(CLOUD_ACK_TOPIC), "cfarm.vn/%s/ack", DEVICE_CODE);
}

// ============================================
// SETUP
// ============================================

void setup() {
    Serial.begin(115200);
    Serial.println();
    Serial.println("===========================================");
    Serial.println("ESP32 Relay 8CH Hybrid Firmware");
    Serial.println("Version: " + String(FIRMWARE_VERSION));
    Serial.println("Device: " + String(DEVICE_CODE));
    Serial.println("===========================================");

    // Initialize relay pins
    initRelays();

    // Connect to WiFi
    connectWiFi();

    // Build MQTT topic names
    buildTopics();

    // Setup local MQTT
    localMqttClient.setClient(wifiClient);
    localMqttClient.setServer(LOCAL_MQTT_SERVER, LOCAL_MQTT_PORT);
    localMqttClient.setCallback(localMqttCallback);
    connectLocalMqtt();

    // Setup cloud MQTT
    cloudMqttClient.setClient(wifiClient);
    cloudMqttClient.setServer(CLOUD_MQTT_SERVER, CLOUD_MQTT_PORT);
    cloudMqttClient.setCallback(cloudMqttCallback);
    connectCloudMqtt();

    // Check for OTA on boot
    checkForOta();

    Serial.println("Setup complete!");
}

// ============================================
// MAIN LOOP
// ============================================

void loop() {
    unsigned long now = millis();

    // Handle WiFi
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("WiFi lost! Reconnecting...");
        connectWiFi();
    }

    // Handle MQTT connections
    if (!localMqttClient.connected()) {
        connectLocalMqtt();
    } else {
        localMqttClient.loop();
    }

    if (!cloudMqttClient.connected()) {
        connectCloudMqtt();
    } else {
        cloudMqttClient.loop();
    }

    // Send heartbeat
    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
        sendHeartbeat();
        lastHeartbeat = now;
    }

    // Check OTA periodically
    if (now - lastOtaCheck >= OTA_CHECK_INTERVAL) {
        checkForOta();
        lastOtaCheck = now;
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
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.println("WiFi Connected!");
        Serial.println("IP: " + WiFi.localIP().toString());
    } else {
        Serial.println();
        Serial.println("WiFi connection failed!");
    }
}

// ============================================
// MQTT - LOCAL (PRIMARY - 30s priority lock)
// ============================================

void connectLocalMqtt() {
    Serial.print("Connecting to LOCAL MQTT... ");

    if (localMqttClient.connect(DEVICE_CODE, LOCAL_MQTT_USER, LOCAL_MQTT_PASS)) {
        Serial.println("OK");
        localMqttClient.subscribe(LOCAL_CMD_TOPIC);
        Serial.println("Subscribed to: " + String(LOCAL_CMD_TOPIC));
        localConnected = true;
    } else {
        Serial.print("FAILED rc=");
        Serial.println(localMqttClient.state());
        localConnected = false;
    }
}

void localMqttCallback(char* topic, byte* payload, unsigned int length) {
    Serial.println("LOCAL MQTT: " + String(topic));

    // Parse JSON command
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload, length);

    if (!error) {
        handleCommand(doc, "LOCAL");
        lastLocalCommandTime = millis();
    } else {
        Serial.println("JSON parse error!");
    }
}

// ============================================
// MQTT - CLOUD (SECONDARY - fallback)
// ============================================

void connectCloudMqtt() {
    Serial.print("Connecting to CLOUD MQTT... ");

    // Use different client ID for cloud
    char cloudClientId[64];
    snprintf(cloudClientId, sizeof(cloudClientId), "%s_cloud", DEVICE_CODE);

    if (cloudMqttClient.connect(cloudClientId, CLOUD_MQTT_USER, CLOUD_MQTT_PASS)) {
        Serial.println("OK");
        cloudMqttClient.subscribe(CLOUD_CMD_TOPIC);
        Serial.println("Subscribed to: " + String(CLOUD_CMD_TOPIC));
        cloudConnected = true;
    } else {
        Serial.print("FAILED rc=");
        Serial.println(cloudMqttClient.state());
        cloudConnected = false;
    }
}

void cloudMqttCallback(char* topic, byte* payload, unsigned int length) {
    Serial.println("CLOUD MQTT: " + String(topic));

    // Check local priority lock
    unsigned long elapsed = millis() - lastLocalCommandTime;
    if (elapsed < LOCAL_LOCK_MS) {
        Serial.println("CLOUD command REJECTED - Local priority lock active");
        return;
    }

    // Parse JSON command
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload, length);

    if (!error) {
        handleCommand(doc, "CLOUD");
    } else {
        Serial.println("JSON parse error!");
    }
}

// ============================================
// COMMAND HANDLING
// ============================================

void handleCommand(JsonDocument& doc, const char* source) {
    Serial.println("Handling command from: " + String(source));

    const char* action = doc["action"] | "unknown";

    if (strcmp(action, "relay") == 0) {
        handleRelayCommand(doc);
    } else if (strcmp(action, "ping") == 0) {
        Serial.println("Ping received!");
        sendAck("ping");
    } else if (strcmp(action, "ota") == 0) {
        handleOtaCommand(doc);
    } else if (strcmp(action, "test") == 0) {
        Serial.println("Test command received!");
        sendAck("test");
    } else {
        Serial.println("Unknown action: " + String(action));
    }
}

void handleRelayCommand(JsonDocument& doc) {
    int relayIndex = -1;
    bool state = false;

    // Support both formats:
    // 1. Cloud format: {"action": "relay", "channel": 1, "state": "on"}
    // 2. Local format: {"action": "relay", "relay": "relay1", "state": true}

    if (doc.containsKey("channel")) {
        // Cloud format - channel is 1-based
        int channel = doc["channel"] | 1;
        relayIndex = channel - 1;  // Convert to 0-based index

        // Support both "on"/"off" strings and boolean
        const char* stateStr = doc["state"] | "off";
        state = (strcmp(stateStr, "on") == 0 || strcmp(stateStr, "1") == 0 || strcmp(stateStr, "true") == 0);
    } else if (doc.containsKey("relay")) {
        // Local format - relay key like "relay1"
        const char* relayKey = doc["relay"] | "";

        for (int i = 0; i < 8; i++) {
            if (strcmp(relayKey, RELAY_KEYS[i]) == 0) {
                relayIndex = i;
                break;
            }
        }

        state = doc["state"] | false;
    }

    if (relayIndex < 0 || relayIndex >= 8) {
        Serial.println("Invalid relay index: " + String(relayIndex));
        return;
    }

    // Set relay state
    setRelay(relayIndex, state);
    Serial.printf("Relay %d => %s\n", relayIndex + 1, state ? "ON" : "OFF");

    // Send ACK
    sendAck("relay");
}

void setRelay(int index, bool state) {
    if (index < 0 || index >= 8) return;

    relayStates[index] = state;
    digitalWrite(RELAY_PINS[index], state ? LOW : HIGH);
}

void setAllRelays(bool state) {
    for (int i = 0; i < 8; i++) {
        setRelay(i, state);
    }
}

// ============================================
// ACK
// ============================================

void sendAck(const char* action) {
    StaticJsonDocument<256> ackDoc;
    ackDoc["action"] = action;
    ackDoc["status"] = "ok";
    ackDoc["timestamp"] = millis();

    char buffer[256];
    serializeJson(ackDoc, buffer);

    // Send to local MQTT
    if (localMqttClient.connected()) {
        localMqttClient.publish(LOCAL_ACK_TOPIC, buffer);
    }

    // Also send to cloud MQTT
    if (cloudMqttClient.connected()) {
        cloudMqttClient.publish(CLOUD_ACK_TOPIC, buffer);
    }
}

// ============================================
// HEARTBEAT
// ============================================

void sendHeartbeat() {
    StaticJsonDocument<512> doc;
    doc["device_code"] = DEVICE_CODE;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["firmware_name"] = FIRMWARE_NAME;
    doc["device_type"] = DEVICE_TYPE;
    doc["uptime_seconds"] = millis() / 1000;
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["ip_address"] = WiFi.localIP().toString();
    doc["free_heap"] = ESP.getFreeHeap();
    doc["local_mqtt"] = localConnected;
    doc["cloud_mqtt"] = cloudConnected;

    // Include relay states
    JsonObject relays = doc.createNestedObject("relays");
    for (int i = 0; i < 8; i++) {
        relays[RELAY_KEYS[i]] = relayStates[i] ? "on" : "off";
    }

    char buffer[512];
    serializeJson(doc, buffer);

    // Send to both brokers
    if (localMqttClient.connected()) {
        localMqttClient.publish(LOCAL_HEARTBEAT_TOPIC, buffer);
    }
    if (cloudMqttClient.connected()) {
        cloudMqttClient.publish(CLOUD_HEARTBEAT_TOPIC, buffer);
    }
}

// ============================================
// OTA UPDATE
// ============================================

void checkForOta() {
    Serial.println("Checking for OTA updates...");

    char url[256];
    snprintf(url, sizeof(url), "%s/api/firmware/latest/%s", LOCAL_SERVER, DEVICE_TYPE);

    HTTPClient http;
    http.begin(url);

    int httpCode = http.GET();

    if (httpCode == 200) {
        String payload = http.getString();

        StaticJsonDocument<512> doc;
        DeserializationError error = deserializeJson(doc, payload);

        if (!error) {
            const char* latestVersion = doc["version"] | "";

            Serial.printf("Current: %s, Latest: %s\n", FIRMWARE_VERSION, latestVersion);

            // Compare versions (simple string comparison works for semver)
            if (strcmp(FIRMWARE_VERSION, latestVersion) < 0) {
                Serial.println("New firmware available! Starting OTA...");
                // Build download URL
                char downloadUrl[256];
                snprintf(downloadUrl, sizeof(downloadUrl), "%s/api/firmware/download/%s",
                    LOCAL_SERVER, doc["id"] | "0");
                performOta(downloadUrl);
            } else {
                Serial.println("Firmware is up to date");
            }
        }
    } else {
        Serial.printf("OTA check failed: HTTP %d\n", httpCode);
    }

    http.end();
}

void handleOtaCommand(JsonDocument& doc) {
    const char* url = doc["url"] | "";
    if (strlen(url) > 0) {
        performOta(url);
    }
}

void performOta(const char* url) {
    Serial.println("Starting OTA from: " + String(url));

    HTTPClient http;
    http.begin(url);

    int httpCode = http.GET();

    if (httpCode != 200) {
        Serial.printf("OTA download failed: HTTP %d\n", httpCode);
        http.end();
        return;
    }

    int contentLength = http.getSize();
    Serial.printf("OTA size: %d bytes\n", contentLength);

    if (contentLength <= 0) {
        Serial.println("Invalid content length");
        http.end();
        return;
    }

    // Start OTA update
    if (!Update.begin(contentLength)) {
        Serial.println("OTA begin failed");
        http.end();
        return;
    }

    // Stream update
    WiFiClient* stream = http.getStreamPtr();
    size_t written = 0;
    uint8_t buffer[1024];

    while (http.connected() && written < contentLength) {
        size_t available = stream->available();
        if (available) {
            int bytesRead = stream.readBytes(buffer, min(available, sizeof(buffer)));
            written += Update.write(buffer, bytesRead);
            Serial.printf("OTA progress: %d / %d bytes\r", written, contentLength);
        }
        delay(1);
    }
    Serial.println();

    http.end();

    if (Update.end(true)) {
        Serial.println("OTA complete! Rebooting...");
        delay(1000);
        ESP.restart();
    } else {
        Serial.printf("OTA failed: %s\n", Update.errorString());
    }
}

// ============================================
// RELAY INITIALIZATION
// ============================================

void initRelays() {
    Serial.println("Initializing relays...");
    for (int i = 0; i < 8; i++) {
        pinMode(RELAY_PINS[i], OUTPUT);
        digitalWrite(RELAY_PINS[i], HIGH);  // OFF = HIGH (relay is active LOW)
        relayStates[i] = false;
        Serial.printf("Relay %d (GPIO %d) initialized OFF\n", i + 1, RELAY_PINS[i]);
    }
}
