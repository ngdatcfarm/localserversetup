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
const char* DEVICE_CODE = "esp-004ch-001";     // Must match device_code in local DB
const char* DEVICE_TYPE = "relay_4ch";         // relay_4ch, relay_8ch, sensor, mixed

// Local Server (for OTA checks)
const char* LOCAL_SERVER = "http://192.168.1.9:8000";

// MQTT Brokers
const char* LOCAL_MQTT_SERVER = "192.168.1.9";
const int LOCAL_MQTT_PORT = 1883;
const char* LOCAL_MQTT_USER = "cfarm";
const char* LOCAL_MQTT_PASS = "cfarm_local";

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
const unsigned long RELAY_CHECK_INTERVAL = 1000;  // 1 second
const unsigned long LOCAL_LOCK_MS = 30000;        // 30 seconds local priority lock
const unsigned long OTA_CHECK_INTERVAL = 300000;  // 5 minutes

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

char CMD_TOPIC[64];
char HEARTBEAT_TOPIC[64];
char STATUS_TOPIC[64];
char ACK_TOPIC[64];
char OTA_TOPIC[64];

void buildTopics() {
    snprintf(CMD_TOPIC, sizeof(CMD_TOPIC), "cfarm/%s/cmd", DEVICE_CODE);
    snprintf(HEARTBEAT_TOPIC, sizeof(HEARTBEAT_TOPIC), "cfarm/%s/heartbeat", DEVICE_CODE);
    snprintf(STATUS_TOPIC, sizeof(STATUS_TOPIC), "cfarm/%s/status", DEVICE_CODE);
    snprintf(ACK_TOPIC, sizeof(ACK_TOPIC), "cfarm/%s/ack", DEVICE_CODE);
    snprintf(OTA_TOPIC, sizeof(OTA_TOPIC), "cfarm/%s/ota", DEVICE_CODE);
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

    localMqttClient.setClient(wifiClient);
    localMqttClient.setServer(LOCAL_MQTT_SERVER, LOCAL_MQTT_PORT);
    localMqttClient.setCallback(mqttCallback);
    connectLocalMqtt();

    cloudMqttClient.setClient(wifiClient);
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

    if (WiFi.status() != WL_CONNECTED) {
        connectWiFi();
    }

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

    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
        sendHeartbeat();
        lastHeartbeat = now;
    }

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
    Serial.println("Connecting to WiFi...");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 30) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.println("WiFi Connected! IP: " + WiFi.localIP().toString());
    }
}

// ============================================
// MQTT - LOCAL (PRIMARY)
// ============================================

void connectLocalMqtt() {
    Serial.print("Connecting to LOCAL MQTT... ");

    if (localMqttClient.connect(DEVICE_CODE, LOCAL_MQTT_USER, LOCAL_MQTT_PASS)) {
        Serial.println("OK");
        localMqttClient.subscribe(CMD_TOPIC);
        localConnected = true;
    } else {
        Serial.print("FAILED rc=");
        Serial.println(localMqttClient.state());
        localConnected = false;
    }
}

void mqttCallback(char* topic, byte* payload, unsigned int length) {
    if (String(topic) != CMD_TOPIC) return;

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
        cloudMqttClient.subscribe(CMD_TOPIC);
        cloudConnected = true;
    } else {
        Serial.print("FAILED rc=");
        Serial.println(cloudMqttClient.state());
        cloudConnected = false;
    }
}

void cloudMqttCallback(char* topic, byte* payload, unsigned int length) {
    if (String(topic) != CMD_TOPIC) return;

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
        const char* relayKey = doc["relay"] | "";
        bool state = doc["state"] | false;

        int relayIndex = -1;
        for (int i = 0; i < 4; i++) {
            if (strcmp(relayKey, RELAY_KEYS[i]) == 0) {
                relayIndex = i;
                break;
            }
        }

        if (relayIndex >= 0) {
            setRelay(relayIndex, state);
            Serial.printf("Relay %d => %s\n", relayIndex + 1, state ? "ON" : "OFF");
            sendAck("relay", relayKey, state);
        }
    } else if (strcmp(action, "ping") == 0) {
        Serial.println("PING");
        sendAck("ping", "", false);
    } else if (strcmp(action, "ota") == 0) {
        Serial.println("OTA command");
        const char* url = doc["url"] | "";
        if (strlen(url) > 0) {
            performOta(url);
        }
    } else if (strcmp(action, "test") == 0) {
        Serial.println("TEST");
        sendAck("test", "", false);
    } else {
        Serial.println(action);
    }
}

void setRelay(int index, bool state) {
    if (index < 0 || index >= 4) return;
    relayStates[index] = state;
    digitalWrite(RELAY_PINS[index], state ? LOW : HIGH);
}

// ============================================
// ACK
// ============================================

void sendAck(const char* action, const char* relayKey, bool state) {
    StaticJsonDocument<256> ackDoc;
    ackDoc["action"] = action;
    ackDoc["status"] = "ok";
    ackDoc["timestamp"] = millis();
    if (strlen(relayKey) > 0) {
        ackDoc["relay"] = relayKey;
        ackDoc["state"] = state;
    }

    char buffer[256];
    serializeJson(ackDoc, buffer);

    if (localMqttClient.connected()) {
        localMqttClient.publish(ACK_TOPIC, buffer);
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

    JsonObject relays = doc.createNestedObject("relays");
    for (int i = 0; i < 4; i++) {
        relays[RELAY_KEYS[i]] = relayStates[i] ? "on" : "off";
    }

    char buffer[512];
    serializeJson(doc, buffer);

    if (localMqttClient.connected()) {
        localMqttClient.publish(HEARTBEAT_TOPIC, buffer);
    }
    if (cloudMqttClient.connected()) {
        cloudMqttClient.publish(HEARTBEAT_TOPIC, buffer);
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

            if (strcmp(FIRMWARE_VERSION, latestVersion) < 0) {
                Serial.printf("New firmware: %s -> %s\n", FIRMWARE_VERSION, latestVersion);
                const char* fwUrl = doc["url"] | "";
                if (strlen(fwUrl) > 0) {
                    performOta(fwUrl);
                }
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
    if (!Update.begin(contentLength)) {
        Serial.println("OTA begin failed");
        http.end();
        return;
    }

    WiFiClient* stream = http.getStreamPtr();
    size_t written = 0;

    while (http.connected() && written < contentLength) {
        size_t available = stream->available();
        if (available) {
            uint8_t buffer[1024];
            int bytesRead = stream.readBytes(buffer, min(available, sizeof(buffer)));
            written += Update.write(buffer, bytesRead);
        }
        delay(1);
    }

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
