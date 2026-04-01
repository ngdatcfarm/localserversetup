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
const char* WIFI_SSID = "YourWiFiSSID";
const char* WIFI_PASSWORD = "YourWiFiPassword";

// Device Identity
const char* DEVICE_CODE = "esp-001";        // Must match device_code in local DB
const char* DEVICE_TYPE = "relay_8ch";      // relay_4ch, relay_8ch, sensor, mixed

// Local Server (where this firmware will check for OTA)
const char* LOCAL_SERVER = "http://192.168.1.100:8000";  // Local server IP

// MQTT Brokers
const char* LOCAL_MQTT_SERVER = "192.168.1.100";  // Local Mosquitto IP
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
const unsigned long RELAY_CHECK_INTERVAL = 1000;   // 1 second
const unsigned long WIFI_RECONNECT_DELAY = 5000;   // 5 seconds
const unsigned long OTA_CHECK_INTERVAL = 300000;   // 5 minutes

// Local command lock duration (30 seconds priority)
const unsigned long LOCAL_LOCK_MS = 30000;

// ============================================
// Global Variables
// ============================================

WiFiClient wifiClient;
PubSubClient localMqttClient;
PubSubClient cloudMqttClient;

unsigned long lastHeartbeat = 0;
unsigned long lastRelayCheck = 0;
unsigned long lastOtaCheck = 0;
unsigned long lastLocalCommandTime = 0;
unsigned long lastCloudCommandTime = 0;

// Connection state
bool localConnected = false;
bool cloudConnected = false;

// ============================================
// TOPIC NAMES
// ============================================

char CMD_TOPIC[64];
char HEARTBEAT_TOPIC[64];
char STATUS_TOPIC[64];
char DATA_TOPIC[64];
char OTA_TOPIC[64];

void buildTopics() {
    snprintf(CMD_TOPIC, sizeof(CMD_TOPIC), "cfarm/%s/cmd", DEVICE_CODE);
    snprintf(HEARTBEAT_TOPIC, sizeof(HEARTBEAT_TOPIC), "cfarm/%s/heartbeat", DEVICE_CODE);
    snprintf(STATUS_TOPIC, sizeof(STATUS_TOPIC), "cfarm/%s/status", DEVICE_CODE);
    snprintf(DATA_TOPIC, sizeof(DATA_TOPIC), "cfarm/%s/data", DEVICE_CODE);
    snprintf(OTA_TOPIC, sizeof(OTA_TOPIC), "cfarm/%s/ota", DEVICE_CODE);
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
    localMqttClient.setCallback(mqttCallback);
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
// MQTT - LOCAL
// ============================================

void connectLocalMqtt() {
    Serial.println("Connecting to LOCAL MQTT: " + String(LOCAL_MQTT_SERVER));

    if (localMqttClient.connect(DEVICE_CODE, LOCAL_MQTT_USER, LOCAL_MQTT_PASS)) {
        Serial.println("Local MQTT Connected!");
        localMqttClient.subscribe(CMD_TOPIC);
        Serial.println("Subscribed to: " + String(CMD_TOPIC));
        localConnected = true;
    } else {
        Serial.print("Local MQTT Failed, rc=");
        Serial.println(localMqttClient.state());
        localConnected = false;
    }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    Serial.println("LOCAL MQTT received on: " + String(topic));

    // Verify this is our command topic
    if (String(topic) != CMD_TOPIC) return;

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
// MQTT - CLOUD
// ============================================

void connectCloudMqtt() {
    Serial.println("Connecting to CLOUD MQTT: " + String(CLOUD_MQTT_SERVER));

    // Use different client ID for cloud
    char cloudClientId[64];
    snprintf(cloudClientId, sizeof(cloudClientId), "%s_cloud", DEVICE_CODE);

    if (cloudMqttClient.connect(cloudClientId, CLOUD_MQTT_USER, CLOUD_MQTT_PASS)) {
        Serial.println("Cloud MQTT Connected!");
        cloudMqttClient.subscribe(CMD_TOPIC);
        Serial.println("Subscribed to: " + String(CMD_TOPIC));
        cloudConnected = true;
    } else {
        Serial.print("Cloud MQTT Failed, rc=");
        Serial.println(cloudMqttClient.state());
        cloudConnected = false;
    }
}

void cloudMqttCallback(char* topic, byte* payload, unsigned int length) {
    Serial.println("CLOUD MQTT received on: " + String(topic));

    // Verify this is our command topic
    if (String(topic) != CMD_TOPIC) return;

    // Check local lock
    unsigned long elapsed = millis() - lastLocalCommandTime;
    if (elapsed < LOCAL_LOCK_MS) {
        Serial.println("CLOUD command REJECTED - Local lock active");
        return;
    }

    // Parse JSON command
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload, length);

    if (!error) {
        handleCommand(doc, "CLOUD");
        lastCloudCommandTime = millis();
    } else {
        Serial.println("JSON parse error!");
    }
}

// ============================================
// COMMAND HANDLING
// ============================================

void handleCommand(JsonDocument& doc, const char* source) {
    Serial.println("Handling command from: " + String(source));

    // Get action
    const char* action = doc["action"] | "unknown";

    if (strcmp(action, "relay") == 0) {
        handleRelayCommand(doc);
    } else if (strcmp(action, "ping") == 0) {
        Serial.println("Ping received!");
        sendAck("ping", doc);
    } else if (strcmp(action, "ota") == 0) {
        handleOtaCommand(doc);
    } else if (strcmp(action, "test") == 0) {
        Serial.println("Test command received!");
        sendAck("test", doc);
    } else {
        Serial.println("Unknown action: " + String(action));
    }
}

void handleRelayCommand(JsonDocument& doc) {
    // Get relay key and state
    const char* relayKey = doc["relay"] | "";
    bool state = doc["state"] | false;

    // Find relay index
    int relayIndex = -1;
    for (int i = 0; i < 8; i++) {
        if (strcmp(relayKey, RELAY_KEYS[i]) == 0) {
            relayIndex = i;
            break;
        }
    }

    if (relayIndex == -1) {
        Serial.println("Unknown relay: " + String(relayKey));
        return;
    }

    // Set relay state
    setRelay(relayIndex, state);
    Serial.printf("Relay %d (%s) => %s\n", relayIndex + 1, relayKey, state ? "ON" : "OFF");

    // Send ACK
    sendAck("relay", doc);
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

void sendAck(const char* action, JsonDocument& doc) {
    char ackTopic[64];
    snprintf(ackTopic, sizeof(ackTopic), "cfarm/%s/ack", DEVICE_CODE);

    StaticJsonDocument<256> ackDoc;
    ackDoc["action"] = action;
    ackDoc["status"] = "ok";
    ackDoc["timestamp"] = millis();

    // Include original command info
    if (doc.containsKey("relay")) ackDoc["relay"] = doc["relay"];
    if (doc.containsKey("state")) ackDoc["state"] = doc["state"];

    char buffer[256];
    serializeJson(ackDoc, buffer);

    // Send to local MQTT
    if (localMqttClient.connected()) {
        localMqttClient.publish(ackTopic, buffer);
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

    if (localMqttClient.connected()) {
        localMqttClient.publish(HEARTBEAT_TOPIC, buffer);
        Serial.println("Heartbeat sent (LOCAL)");
    }

    if (cloudMqttClient.connected()) {
        cloudMqttClient.publish(HEARTBEAT_TOPIC, buffer);
        Serial.println("Heartbeat sent (CLOUD)");
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
                performOta(doc["url"], doc["checksum"], doc["size"]);
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
    const char* checksum = doc["checksum"] | "";
    int size = doc["size"] | 0;

    if (strlen(url) > 0) {
        performOta(url, checksum, size);
    }
}

void performOta(const char* url, const char* expectedChecksum, int expectedSize) {
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

    while (http.connected() && (written < contentLength)) {
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

// ============================================
// UTILITY
// ============================================

void printDeviceInfo() {
    Serial.println("===========================================");
    Serial.println("Device Information");
    Serial.println("===========================================");
    Serial.println("Code: " + String(DEVICE_CODE));
    Serial.println("Type: " + String(DEVICE_TYPE));
    Serial.println("Firmware: " + String(FIRMWARE_VERSION));
    Serial.println("===========================================");
}
