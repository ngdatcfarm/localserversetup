/**
 * ESP32 MQTT Test with ArduinoJson
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

const char* WIFI_SSID = "Dat Lim";
const char* WIFI_PASSWORD = "hoilamgi";
const char* DEVICE_CODE = "esp32-01";
const char* LOCAL_MQTT_SERVER = "192.168.1.9";
const int LOCAL_MQTT_PORT = 1883;
const char* LOCAL_MQTT_USER = "cfarm_device";
const char* LOCAL_MQTT_PASS = "cfarm_device_2026";

WiFiClient wifiClientLocal;
WiFiClient wifiClientCloud;
PubSubClient mqttLocal;
PubSubClient mqttCloud;

unsigned long lastPublish = 0;

void connectWiFi() {
    Serial.println("Connecting to WiFi...");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(250);
        Serial.print(".");
        attempts++;
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi OK: " + WiFi.localIP().toString());
    } else {
        Serial.println("\nWiFi FAILED!");
    }
}

void connectLocalMQTT() {
    Serial.println("Connecting to LOCAL MQTT...");
    mqttLocal.setClient(wifiClientLocal);
    mqttLocal.setServer(LOCAL_MQTT_SERVER, LOCAL_MQTT_PORT);

    if (mqttLocal.connect(DEVICE_CODE, LOCAL_MQTT_USER, LOCAL_MQTT_PASS)) {
        Serial.println("Local MQTT OK!");
    } else {
        Serial.println("Local MQTT FAILED! rc=" + String(mqttLocal.state()));
    }
}

void connectCloudMQTT() {
    Serial.println("Connecting to CLOUD MQTT...");
    mqttCloud.setClient(wifiClientCloud);
    mqttCloud.setServer("103.166.183.215", 1883);

    char clientId[64];
    snprintf(clientId, sizeof(clientId), "%s_cloud", DEVICE_CODE);

    if (mqttCloud.connect(clientId, "cfarm_server", "Abc@@123")) {
        Serial.println("Cloud MQTT OK!");
    } else {
        Serial.println("Cloud MQTT FAILED! rc=" + String(mqttCloud.state()));
    }
}

void publishHeartbeat() {
    Serial.println("\n=== Publishing Heartbeat ===");
    Serial.println("Local: connected=" + String(mqttLocal.connected()) + " state=" + String(mqttLocal.state()));
    Serial.println("Cloud: connected=" + String(mqttCloud.connected()) + " state=" + String(mqttCloud.state()));

    // Create JSON like full firmware
    StaticJsonDocument<512> doc;
    doc["device_code"] = DEVICE_CODE;
    doc["uptime_seconds"] = millis() / 1000;
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["ip_address"] = WiFi.localIP().toString();
    doc["free_heap"] = ESP.getFreeHeap();

    char buffer[512];
    serializeJson(doc, buffer);
    Serial.println("Buffer: " + String(buffer));

    // Publish to local
    if (mqttLocal.connected()) {
        bool ok = mqttLocal.publish("cfarm/esp32-01/heartbeat", (uint8_t*)buffer, strlen(buffer));
        Serial.println("Local publish: " + String(ok ? "OK" : "FAILED"));
    }

    // Publish to cloud
    if (mqttCloud.connected()) {
        bool ok = mqttCloud.publish("cfarm.vn/esp32-01/heartbeat", (uint8_t*)buffer, strlen(buffer));
        Serial.println("Cloud publish: " + String(ok ? "OK" : "FAILED"));
    }

    mqttLocal.loop();
    mqttCloud.loop();
}

void setup() {
    Serial.begin(115200);
    Serial.println("ESP32 MQTT + ArduinoJson Test");
    Serial.println("================================");

    connectWiFi();
    connectLocalMQTT();
    connectCloudMQTT();

    delay(100);

    publishHeartbeat();
}

void loop() {
    mqttLocal.loop();
    mqttCloud.loop();

    if (millis() - lastPublish >= 5000) {
        lastPublish = millis();
        publishHeartbeat();
    }
}
