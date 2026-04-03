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
 * Version: 1.2.0
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <Update.h>
#include <HTTPClient.h>

// Increase MQTT buffer size
#define MQTT_MAX_PACKET_SIZE 512

// ============================================
// CONFIGURATION - Edit these values
// ============================================

// WiFi
const char* WIFI_SSID = "Dat Lim TN";
const char* WIFI_PASSWORD = "hoilamgi";

// Device Identity
const char* DEVICE_CODE = "esp32-01";
const char* DEVICE_TYPE = "relay_8ch";

// Local Server
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
const char* FIRMWARE_NAME = "esp32_relay_8ch_hybrid";

// ============================================
// GPIO Configuration
// ============================================

const int RELAY_PINS[8] = {18, 19, 21, 22, 23, 25, 26, 27};
const char* RELAY_KEYS[8] = {
    "relay1", "relay2", "relay3", "relay4",
    "relay5", "relay6", "relay7", "relay8"
};

bool relayStates[8] = {false, false, false, false, false, false, false, false};

// ============================================
// Timing Configuration
// ============================================

const unsigned long HEARTBEAT_INTERVAL = 30000;
const unsigned long WIFI_RECONNECT_DELAY = 5000;
const unsigned long OTA_CHECK_INTERVAL = 300000;
const unsigned long MQTT_RECONNECT_DELAY = 5000;
const unsigned long LOCAL_LOCK_MS = 30000;

// ============================================
// Global Variables
// ============================================

WiFiClient wifiClientLocal;
WiFiClient wifiClientCloud;

PubSubClient localMqttClient(wifiClientLocal);
PubSubClient cloudMqttClient(wifiClientCloud);

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
char LOCAL_OTA_TOPIC[64];

char CLOUD_CMD_TOPIC[64];
char CLOUD_HEARTBEAT_TOPIC[64];
char CLOUD_ACK_TOPIC[64];

void buildTopics() {
    snprintf(LOCAL_CMD_TOPIC, sizeof(LOCAL_CMD_TOPIC), "cfarm/%s/cmd", DEVICE_CODE);
    snprintf(LOCAL_HEARTBEAT_TOPIC, sizeof(LOCAL_HEARTBEAT_TOPIC), "cfarm/%s/heartbeat", DEVICE_CODE);
    snprintf(LOCAL_ACK_TOPIC, sizeof(LOCAL_ACK_TOPIC), "cfarm/%s/ack", DEVICE_CODE);
    snprintf(LOCAL_OTA_TOPIC, sizeof(LOCAL_OTA_TOPIC), "cfarm/%s/ota", DEVICE_CODE);

    snprintf(CLOUD_CMD_TOPIC, sizeof(CLOUD_CMD_TOPIC), "cfarm.vn/%s/cmd", DEVICE_CODE);
    snprintf(CLOUD_HEARTBEAT_TOPIC, sizeof(CLOUD_HEARTBEAT_TOPIC), "cfarm.vn/%s/heartbeat", DEVICE_CODE);
    snprintf(CLOUD_ACK_TOPIC, sizeof(CLOUD_ACK_TOPIC), "cfarm.vn/%s/ack", DEVICE_CODE);
}

// ============================================
// VERSION COMPARISON
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
    Serial.println("ESP32 Relay 8CH Hybrid Firmware");
    Serial.println("Version: " + String(FIRMWARE_VERSION));
    Serial.println("Device: " + String(DEVICE_CODE));
    Serial.println("===========================================");

    initRelays();
    connectWiFi();
    buildTopics();

    // Setup local MQTT
    localMqttClient.setServer(LOCAL_MQTT_SERVER, LOCAL_MQTT_PORT);
    localMqttClient.setCallback(localMqttCallback);
    connectLocalMqtt();

    // Setup cloud MQTT
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

    // WiFi reconnect
    if (WiFi.status() != WL_CONNECTED) {
        if (now - lastWifiReconnectAttempt >= WIFI_RECONNECT_DELAY) {
            lastWifiReconnectAttempt = now;
            Serial.println("WiFi lost! Reconnecting...");
            connectWiFi();
        }
    }

    // Local MQTT - use state() for accurate status
    if (localMqttClient.connected()) {
        localMqttClient.loop();
    } else {
        if (now - lastLocalMqttReconnectAttempt >= MQTT_RECONNECT_DELAY) {
            lastLocalMqttReconnectAttempt = now;
            connectLocalMqtt();
        }
    }

    // Cloud MQTT
    if (cloudMqttClient.connected()) {
        cloudMqttClient.loop();
    } else {
        if (now - lastCloudMqttReconnectAttempt >= MQTT_RECONNECT_DELAY) {
            lastCloudMqttReconnectAttempt = now;
            connectCloudMqtt();
        }
    }

    // Heartbeat
    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
        sendHeartbeat();
        lastHeartbeat = now;
    }

    // OTA check
    if (now - lastOtaCheck >= OTA_CHECK_INTERVAL) {
        checkForOta();
        lastOtaCheck = now;
    }

    delay(5);
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
        Serial.println("WiFi Connected!");
        Serial.println("IP: " + WiFi.localIP().toString());
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

    if (localMqttClient.connected()) {
        localMqttClient.disconnect();
        delay(200);
    }

    bool connected = localMqttClient.connect(DEVICE_CODE, LOCAL_MQTT_USER, LOCAL_MQTT_PASS);
    Serial.println(connected ? "OK" : "FAILED");

    if (connected) {
        // Wait briefly for CONNACK
        delay(100);
        localMqttClient.loop();
        localMqttClient.subscribe(LOCAL_CMD_TOPIC);
        Serial.println("Subscribed to: " + String(LOCAL_CMD_TOPIC));
    }
}

// ============================================
// MQTT - CLOUD (SECONDARY)
// ============================================

void connectCloudMqtt() {
    Serial.print("Connecting to CLOUD MQTT... ");

    char cloudClientId[64];
    snprintf(cloudClientId, sizeof(cloudClientId), "%s_cloud", DEVICE_CODE);

    if (cloudMqttClient.connected()) {
        cloudMqttClient.disconnect();
        delay(200);
    }

    bool connected = cloudMqttClient.connect(cloudClientId, CLOUD_MQTT_USER, CLOUD_MQTT_PASS);
    Serial.println(connected ? "OK" : "FAILED");

    if (connected) {
        delay(100);
        cloudMqttClient.loop();
        cloudMqttClient.subscribe(CLOUD_CMD_TOPIC);
        Serial.println("Subscribed to: " + String(CLOUD_CMD_TOPIC));
    }
}

// ============================================
// MQTT CALLBACKS
// ============================================

void localMqttCallback(char* topic, byte* payload, unsigned int length) {
    Serial.println("LOCAL MQTT: " + String(topic));
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    if (!error) {
        handleCommand(doc, "LOCAL");
        lastLocalCommandTime = millis();
    }
}

void cloudMqttCallback(char* topic, byte* payload, unsigned int length) {
    Serial.println("CLOUD MQTT: " + String(topic));
    unsigned long elapsed = millis() - lastLocalCommandTime;
    if (elapsed < LOCAL_LOCK_MS) {
        Serial.println("CLOUD command REJECTED - Local priority lock");
        return;
    }
    StaticJsonDocument<512> doc;
    DeserializationError error = deserializeJson(doc, payload, length);
    if (!error) {
        handleCommand(doc, "CLOUD");
    }
}

// ============================================
// COMMAND HANDLING
// ============================================

void handleCommand(JsonDocument& doc, const char* source) {
    Serial.println("Command from: " + String(source));
    const char* action = doc["action"] | "unknown";

    if (strcmp(action, "relay") == 0) {
        handleRelayCommand(doc);
    } else if (strcmp(action, "ping") == 0 || strcmp(action, "test") == 0) {
        Serial.println("Ping/test received!");
        sendAck("pong");
    } else if (strcmp(action, "ota") == 0) {
        handleOtaCommand(doc);
    }
}

void handleRelayCommand(JsonDocument& doc) {
    int relayIndex = -1;
    bool state = false;

    if (doc.containsKey("channel")) {
        int channel = doc["channel"] | 1;
        relayIndex = channel - 1;
        const char* stateStr = doc["state"] | "off";
        state = (strcmp(stateStr, "on") == 0 || strcmp(stateStr, "1") == 0);
    } else if (doc.containsKey("relay")) {
        const char* relayKey = doc["relay"] | "";
        for (int i = 0; i < 8; i++) {
            if (strcmp(relayKey, RELAY_KEYS[i]) == 0) {
                relayIndex = i;
                break;
            }
        }
        state = doc["state"] | false;
    }

    if (relayIndex >= 0 && relayIndex < 8) {
        setRelay(relayIndex, state);
        Serial.printf("Relay %d => %s\n", relayIndex + 1, state ? "ON" : "OFF");
        sendAck("relay");
    }
}

void setRelay(int index, bool state) {
    if (index < 0 || index >= 8) return;
    relayStates[index] = state;
    digitalWrite(RELAY_PINS[index], state ? LOW : HIGH);
}

void setAllRelays(bool state) {
    for (int i = 0; i < 8; i++) setRelay(i, state);
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
    Serial.println("--- HEARTBEAT ---");
    Serial.println("WiFi RSSI: " + String(WiFi.RSSI()));
    Serial.println("Local MQTT: " + String(localMqttClient.connected() ? "connected" : "disconnected"));

    // Call loop() first to ensure outgoing buffer is processed
    localMqttClient.loop();
    cloudMqttClient.loop();
    delay(10);

    // Simple compact JSON first
    String payload = "{\"code\":\"" + String(DEVICE_CODE) + "\",";
    payload += "\"rssi\":" + String(WiFi.RSSI()) + ",";
    payload += "\"uptime\":" + String(millis() / 1000) + ",";
    payload += "\"heap\":" + String(ESP.getFreeHeap()) + "}";

    Serial.println("Payload length: " + String(payload.length()));

    if (localMqttClient.connected()) {
        localMqttClient.loop();  // Process more before publish
        delay(5);
        bool ok = localMqttClient.publish(LOCAL_HEARTBEAT_TOPIC, (uint8_t*)payload.c_str(), payload.length());
        Serial.println("Local publish: " + String(ok ? "OK" : "FAILED"));
        localMqttClient.loop();  // Process after publish
    }

    Serial.println("--- END ---");
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
    http.setTimeout(5000);
    int httpCode = http.GET();

    if (httpCode == 200) {
        String payload = http.getString();
        StaticJsonDocument<512> doc;
        DeserializationError error = deserializeJson(doc, payload);
        if (!error) {
            const char* latestVersion = doc["version"] | "";
            if (isNewerVersion(FIRMWARE_VERSION, latestVersion)) {
                Serial.println("New firmware: " + String(latestVersion));
                char downloadUrl[256];
                snprintf(downloadUrl, sizeof(downloadUrl), "%s/api/firmware/download/%s",
                    LOCAL_SERVER, doc["id"] | "0");
                performOta(downloadUrl);
            } else {
                Serial.println("Firmware up to date");
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
    Serial.println("Starting OTA: " + String(url));
    HTTPClient http;
    http.begin(url);
    int httpCode = http.GET();

    if (httpCode != 200) {
        Serial.printf("OTA download failed: HTTP %d\n", httpCode);
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
    uint8_t buffer[1024];
    unsigned long startTime = millis();

    while (http.connected() && written < contentLength) {
        if (millis() - startTime > 300000) {
            Serial.println("OTA timeout!");
            Update.abort();
            break;
        }
        size_t available = stream->available();
        if (available) {
            int bytesRead = stream->readBytes(buffer, min(available, sizeof(buffer)));
            if (bytesRead > 0) {
                written += Update.write(buffer, bytesRead);
                Serial.printf("OTA: %d / %d bytes\r", written, contentLength);
            }
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
        digitalWrite(RELAY_PINS[i], HIGH);
        relayStates[i] = false;
        Serial.printf("Relay %d (GPIO %d) OFF\n", i + 1, RELAY_PINS[i]);
    }
}
