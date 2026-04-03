/**
 * ESP32 MQTT Test - Minimal test to debug connection issue
 * Only tests MQTT connection, nothing else
 */

#include <WiFi.h>
#include <PubSubClient.h>

// WiFi credentials
const char* WIFI_SSID = "Dat Lim TN";
const char* WIFI_PASSWORD = "hoilamgi";

// MQTT
const char* MQTT_SERVER = "192.168.1.9";
const int MQTT_PORT = 1883;
const char* MQTT_USER = "cfarm_device";
const char* MQTT_PASS = "cfarm_device_2026";
const char* DEVICE_CODE = "esp32-01";

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

unsigned long lastMsg = 0;

void callback(char* topic, byte* payload, unsigned int length) {
    Serial.print("Message arrived [");
    Serial.print(topic);
    Serial.print("] ");
    for (int i = 0; i < length; i++) {
        Serial.print((char)payload[i]);
    }
    Serial.println();
}

void reconnect() {
    Serial.print("Attempting MQTT connection...");
    Serial.print(" state before connect: ");
    Serial.println(mqttClient.state());

    // Disconnect first if needed
    if (mqttClient.connected()) {
        Serial.println("Already connected, disconnecting first...");
        mqttClient.disconnect();
        delay(500);
    }

    // Try to connect
    bool connected = mqttClient.connect(DEVICE_CODE, MQTT_USER, MQTT_PASS);
    Serial.print("connect() returned: ");
    Serial.println(connected ? "TRUE" : "FALSE");
    Serial.print("state after connect: ");
    Serial.println(mqttClient.state());

    if (connected) {
        Serial.println("Connected! Subscribing...");
        mqttClient.subscribe("cfarm/esp32-01/cmd");
        Serial.println("Subscribe called");
    } else {
        Serial.print("Connection failed! State: ");
        Serial.println(mqttClient.state());
    }

    // Wait for CONNACK
    Serial.println("Waiting for CONNACK (500ms)...");
    unsigned long start = millis();
    while (millis() - start < 500) {
        mqttClient.loop();
        if (mqttClient.state() == MQTT_CONNECTED) {
            Serial.println("CONNACK received! Now connected!");
            break;
        }
        delay(10);
    }

    Serial.print("Final state: ");
    Serial.println(mqttClient.state());
}

void setup() {
    Serial.begin(115200);
    Serial.println();
    Serial.println("=== ESP32 MQTT Test ===");

    // Connect to WiFi
    Serial.println("Connecting to WiFi...");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
    }
    Serial.println();
    Serial.println("WiFi connected!");
    Serial.println("IP: " + WiFi.localIP().toString());

    // Setup MQTT
    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    mqttClient.setCallback(callback);

    // Initial connection
    reconnect();
}

void loop() {
    // Keep MQTT alive
    if (mqttClient.connected()) {
        mqttClient.loop();

        // Send test message every 10 seconds
        if (millis() - lastMsg > 10000) {
            lastMsg = millis();
            Serial.print("Publishing... state=");
            Serial.println(mqttClient.state());

            String payload = "{\"device_code\":\"esp32-01\",\"test\":true,\"rssi\":";
            payload += WiFi.RSSI();
            payload += "}";

            bool sent = mqttClient.publish("cfarm/esp32-01/heartbeat", payload.c_str());
            Serial.println(sent ? "Published OK" : "Published FAILED");
        }
    } else {
        Serial.println("MQTT disconnected! Reconnecting...");
        reconnect();
    }

    delay(10);
}
