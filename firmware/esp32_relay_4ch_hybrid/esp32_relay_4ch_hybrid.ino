/**
 * ESP32 Relay 4CH Hybrid Firmware
 *
 * Dual-subscribe MQTT firmware for farm automation
 * - Subscribes to LOCAL MQTT broker (priority)
 * - Subscribes to CLOUD MQTT broker (fallback)
 * - Reports firmware version in heartbeat
 * - Supports OTA updates from local server
 *
 * Author: CFarm
 * Version: 1.1.0
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
const char* DEVICE_CODE = "esp-004ch-001";     // Must match device_code in local DB
const char* DEVICE_TYPE = "relay_4ch";           // relay_4ch, relay_8ch, sensor, mixed

// Local Server (for OTA checks)
const char* LOCAL_SERVER = "http://192.168.1.9:8000";

// MQTT Brokers
const char* LOCAL_MQTT_SERVER = "192.168.1.9";
const int LOCAL_MQTT_PORT = 1883;
const char* LOCAL_MQTT_USER = "cfarm_device";
const char* LOCAL_MQTT_PASS = "cfarm_device_2026";

const char* CLOUD_MQTT_SERVER = "103.166.183.215";
const int CLOUD_MQTT_PORT = 1883;
const char* CLOUD_MQTT_USER = "cfarm_server";
const char* CLOUD_MQTT_PASS = "Abc@@123";

// Firmware Info
const char* FIRMWARE_VERSION = "1.0.0";
const char* FIRMWARE_NAME = "esp32_relay_4ch_hybrid";

// ============================================
// GPIO Configuration
// ============================================

// Relay GPIO pins (4 channels only)
const int RELAY_PINS[4] = {18, 19, 21, 22};
const char* RELAY_KEYS[4] = {
    "relay1", "relay2", "relay3", "relay4"
};

bool relayStates[4] = {false, false, false, false};

// ============================================
// Timing Configuration
// ============================================

const unsigned long HEARTBEAT_INTERVAL = 30000;    // 30 seconds
const unsigned long LOCAL_LOCK_MS = 30000;        // 30 seconds local priority lock
const unsigned long OTA_CHECK_INTERVAL = 300000;  // 5 minutes
const unsigned long WIFI_RECONNECT_DELAY = 5000;   // 5 seconds between WiFi reconnect attempts
const unsigned long MQTT_RECONNECT_DELAY = 5000;    // 5 seconds between MQTT reconnect attempts

// ============================================
// Global Variables
// ============================================

// SEPARATE WiFi clients for local and cloud MQTT
WiFiClient wifiClientLocal;
WiFiClient wifiClientCloud;

PubSubClient localMqttClient;
PubSubClient cloudMqttClient;

unsigned long lastHeartbeat = 0;
unsigned long lastOtaCheck = 0;
unsigned long lastLocalCommandTime = 0;
unsigned long lastWifiReconnectAttempt = 0;
unsigned long lastLocalMqttReconnectAttempt = 0;
unsigned long lastCloudMqttReconnectAttempt = 0;

// ============================================
// TOPIC NAMES
// ============================================

char LOCAL_CMD_TOPIC[64];
char LOCAL_HEARTBEAT_TOPIC[64];
char LOCAL_ACK_TOPIC[64];

char CLOUD_CMD_TOPIC[64];
char CLOUD_HEARTBEAT_TOPIC[64];
char CLOUD_ACK_TOPIC[64];

void buildTopics() {
    // Local topics: cfarm/{device_code}/...
    snprintf(LOCAL_CMD_TOPIC, sizeof(LOCAL_CMD_TOPIC), "cfarm/%s/cmd", DEVICE_CODE);
    snprintf(LOCAL_HEARTBEAT_TOPIC, sizeof(LOCAL_HEARTBEAT_TOPIC), "cfarm/%s/heartbeat", DEVICE_CODE);
    snprintf(LOCAL_ACK_TOPIC, sizeof(LOCAL_ACK_TOPIC), "cfarm/%s/ack", DEVICE_CODE);

    // Cloud topics: cfarm.vn/{device_code}/...
    snprintf(CLOUD_CMD_TOPIC, sizeof(CLOUD_CMD_TOPIC), "cfarm.vn/%s/cmd", DEVICE_CODE);
    snprintf(CLOUD_HEARTBEAT_TOPIC, sizeof(CLOUD_HEARTBEAT_TOPIC), "cfarm.vn/%s/heartbeat", DEVICE_CODE);
    snprintf(CLOUD_ACK_TOPIC, sizeof(CLOUD_ACK_TOPIC), "cfarm.vn/%s/ack", DEVICE_CODE);
}

// ============================================
// VERSION COMPARISON (semver)
// ============================================

bool isNewerVersion(const char* current, const char* latest) {
    int currMaj = 0, currMin = 0, currPatch = 0;
    int latMaj = 0, latMin = 0, latPatch = 0;

    sscanf(current, "%d.%d.%d", &currMaj, &currMin, &currPatch);
    sscanf(latest, "%d.%d.%d", &latMaj, &latMin, &latPatch);

    if (latMaj > currMaj) return true;
    if (latMaj < currMaj) return false;
    if (latMin > currMin) return true;
    if (latMin < currMin) return false;
    return latPatch > currPatch;
}

// ============================================
// SETUP
// ============================================

void setup() {
    Serial.begin(115200);
    Serial.println();
    Serial.println("===========================================");
    Serial.println("ESP32 Relay 4CH Hybrid Firmware");
    Serial.println("Version: " + String(FIRMWARE_VERSION));
    Serial.println("Device: " + String(DEVICE_CODE));
    Serial.println("===========================================");

    initRelays();
    connectWiFi();
    buildTopics();

    // Setup local MQTT with its own WiFiClient
    localMqttClient.setClient(wifiClientLocal);
    localMqttClient.setServer(LOCAL_MQTT_SERVER, LOCAL_MQTT_PORT);
    localMqttClient.setCallback(localMqttCallback);
    connectLocalMqtt();

    // Setup cloud MQTT with its own WiFiClient
    cloudMqttClient.setClient(wifiClientCloud);
    cloudMqttClient.setServer(CLOUD_MQTT_SERVER, CLOUD_MQTT_PORT);
    cloudMqttClient.setCallback(cloudMqttCallback);
    connectCloudMqtt();

    checkForOta();

    Serial.println("Setup complete!");
}

// ============================================
// MAIN LOOP
// ============================================

void loop() {
    unsigned long now = millis();

    // Handle WiFi - non-blocking reconnect
    if (WiFi.status() != WL_CONNECTED) {
        if (now - lastWifiReconnectAttempt >= WIFI_RECONNECT_DELAY) {
            lastWifiReconnectAttempt = now;
            connectWiFi();
        }
    }

    // Handle local MQTT - non-blocking reconnect
    if (!localMqttClient.connected()) {
        if (now - lastLocalMqttReconnectAttempt >= MQTT_RECONNECT_DELAY) {
            lastLocalMqttReconnectAttempt = now;
            connectLocalMqtt();
        }
    } else {
        localMqttClient.loop();
    }

    // Handle cloud MQTT - non-blocking reconnect
    if (!cloudMqttClient.connected()) {
        if (now - lastCloudMqttReconnectAttempt >= MQTT_RECONNECT_DELAY) {
            lastCloudMqttReconnectAttempt = now;
            connectCloudMqtt();
        }
    } else {
        cloudMqttClient.loop();
    }

    // Update connection status in heartbeat
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
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(250);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.println("WiFi Connected! IP: " + WiFi.localIP().toString());
    } else {
        Serial.println();
        Serial.println("WiFi connection failed!");
    }
}

// ============================================
// MQTT - LOCAL (PRIMARY)
// ============================================

void connectLocalMqtt() {
    Serial.print("Connecting to LOCAL MQTT... ");

    if (localMqttClient.connect(DEVICE_CODE, LOCAL_MQTT_USER, LOCAL_MQTT_PASS)) {
        Serial.println("OK");
        localMqttClient.subscribe(LOCAL_CMD_TOPIC);
        Serial.println("Subscribed to: " + String(LOCAL_CMD_TOPIC));
    } else {
        Serial.print("FAILED rc=");
        Serial.println(localMqttClient.state());
    }
}

void localMqttCallback(char* topic, byte* payload, unsigned int length) {
    Serial.println("LOCAL MQTT: " + String(topic));

    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, payload, length) == DeserializationError::ok) {
        handleCommand(doc, "LOCAL");
        lastLocalCommandTime = millis();
    }
}

// ============================================
// MQTT - CLOUD (SECONDARY)
// ============================================

void connectCloudMqtt() {
    Serial.print("Connecting to CLOUD MQTT... ");

    char cloudClientId[64];
    snprintf(cloudClientId, sizeof(cloudClientId), "%s_cloud", DEVICE_CODE);

    if (cloudMqttClient.connect(cloudClientId, CLOUD_MQTT_USER, CLOUD_MQTT_PASS)) {
        Serial.println("OK");
        cloudMqttClient.subscribe(CLOUD_CMD_TOPIC);
        Serial.println("Subscribed to: " + String(CLOUD_CMD_TOPIC));
    } else {
        Serial.print("FAILED rc=");
        Serial.println(cloudMqttClient.state());
    }
}

void cloudMqttCallback(char* topic, byte* payload, unsigned int length) {
    Serial.println("CLOUD MQTT: " + String(topic));

    // Check local priority lock
    unsigned long elapsed = millis() - lastLocalCommandTime;
    if (elapsed < LOCAL_LOCK_MS) {
        Serial.println("Cloud command REJECTED - local priority lock active");
        return;
    }

    StaticJsonDocument<512> doc;
    if (deserializeJson(doc, payload, length) == DeserializationError::ok) {
        handleCommand(doc, "CLOUD");
    }
}

// ============================================
// COMMAND HANDLING
// ============================================

void handleCommand(JsonDocument& doc, const char* source) {
    Serial.printf("Command from %s: ", source);

    const char* action = doc["action"] | "unknown";

    if (strcmp(action, "relay") == 0) {
        handleRelayCommand(doc);
    } else if (strcmp(action, "ping") == 0) {
        Serial.println("PING");
        sendAck("ping");
    } else if (strcmp(action, "ota") == 0) {
        Serial.println("OTA command");
        const char* url = doc["url"] | "";
        if (strlen(url) > 0) {
            performOta(url);
        }
    } else if (strcmp(action, "test") == 0) {
        Serial.println("TEST");
        sendAck("test");
    } else {
        Serial.println(action);
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

        for (int i = 0; i < 4; i++) {
            if (strcmp(relayKey, RELAY_KEYS[i]) == 0) {
                relayIndex = i;
                break;
            }
        }

        state = doc["state"] | false;
    }

    if (relayIndex < 0 || relayIndex >= 4) {
        Serial.println("Invalid relay index");
        return;
    }

    setRelay(relayIndex, state);
    Serial.printf("Relay %d => %s\n", relayIndex + 1, state ? "ON" : "OFF");
    sendAck("relay");
}

void setRelay(int index, bool state) {
    if (index < 0 || index >= 4) return;
    relayStates[index] = state;
    digitalWrite(RELAY_PINS[index], state ? LOW : HIGH);
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

    if (localMqttClient.connected()) {
        localMqttClient.publish(LOCAL_ACK_TOPIC, buffer);
    }
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
    doc["local_mqtt"] = localMqttClient.connected();
    doc["cloud_mqtt"] = cloudMqttClient.connected();

    JsonObject relays = doc.createNestedObject("relays");
    for (int i = 0; i < 4; i++) {
        relays[RELAY_KEYS[i]] = relayStates[i] ? "on" : "off";
    }

    char buffer[512];
    serializeJson(doc, buffer);

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

    if (http.GET() == 200) {
        StaticJsonDocument<512> doc;
        if (deserializeJson(doc, http.getString()) == DeserializationError::ok) {
            const char* latestVersion = doc["version"] | "";

            if (isNewerVersion(FIRMWARE_VERSION, latestVersion)) {
                Serial.printf("New firmware: %s -> %s\n", FIRMWARE_VERSION, latestVersion);
                char downloadUrl[256];
                snprintf(downloadUrl, sizeof(downloadUrl), "%s/api/firmware/download/%s",
                    LOCAL_SERVER, doc["id"] | "0");
                performOta(downloadUrl);
            } else {
                Serial.println("Firmware up to date");
            }
        }
    }
    http.end();
}

void performOta(const char* url) {
    Serial.println("Starting OTA...");

    HTTPClient http;
    http.begin(url);

    if (http.GET() != 200) {
        Serial.println("OTA download failed");
        http.end();
        return;
    }

    int contentLength = http.getSize();
    if (contentLength <= 0) {
        Serial.println("Invalid content length");
        http.end();
        return;
    }

    if (!Update.begin(contentLength)) {
        Serial.println("OTA begin failed");
        http.end();
        return;
    }

    WiFiClient* stream = http.getStreamPtr();
    size_t written = 0;
    unsigned long startTime = millis();
    const unsigned long OTA_TIMEOUT = 300000; // 5 minutes timeout

    while (http.connected() && written < contentLength) {
        // Check timeout
        if (millis() - startTime > OTA_TIMEOUT) {
            Serial.println("OTA timeout!");
            Update.abort();
            break;
        }

        size_t available = stream->available();
        if (available) {
            uint8_t buffer[1024];
            int bytesRead = stream->readBytes(buffer, min(available, sizeof(buffer)));
            if (bytesRead <= 0) {
                Serial.println("OTA read error!");
                break;
            }
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
// INIT
// ============================================

void initRelays() {
    Serial.println("Initializing 4CH relays...");
    for (int i = 0; i < 4; i++) {
        pinMode(RELAY_PINS[i], OUTPUT);
        digitalWrite(RELAY_PINS[i], HIGH);  // OFF
        relayStates[i] = false;
    }
}
