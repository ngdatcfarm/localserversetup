/**
 * ESP32 Relay 4CH - COMPLETE & FIXED
 * - Tăng buffer MQTT để gửi heartbeat JSON lớn
 * - Xử lý lệnh relay qua MQTT (2 định dạng)
 * - Tự động reconnect MQTT với delay hợp lý
 * - Gửi heartbeat mỗi 30 giây
 */

// QUAN TRỌNG: Tăng kích thước gói MQTT lên 512 byte (đủ cho heartbeat JSON)
#define MQTT_MAX_PACKET_SIZE 512
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ========== CẤU HÌNH ==========
// WiFi
const char* WIFI_SSID = "Dat Lim TN";
const char* WIFI_PASSWORD = "hoilamgi";

// Thiết bị
const char* DEVICE_CODE = "esp-XXXXX";  // Thay đổi theo device
const char* DEVICE_TYPE = "relay_4ch";
const char* FIRMWARE_VERSION = "2.0.0";

// MQTT Broker (local)
const char* MQTT_SERVER = "192.168.1.9";
const int MQTT_PORT = 1884;
const char* MQTT_USER = "cfarm_device";
const char* MQTT_PASS = "cfarm_device_2026";

// Relay GPIO (HIGH = OFF, LOW = ON)
const int RELAY_PINS[4] = {18, 19, 21, 22};
const char* RELAY_NAMES[4] = {"relay1", "relay2", "relay3", "relay4"};
bool relayStates[4] = {false, false, false, false};

// Timing
const unsigned long HEARTBEAT_INTERVAL = 30000;   // 30 giây
const unsigned long MQTT_RECONNECT_DELAY = 5000;  // 5 giây

// ========== BIẾN TOÀN CỤC ==========
WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

char cmdTopic[64];
char heartbeatTopic[64];

unsigned long lastHeartbeat = 0;
unsigned long lastReconnectAttempt = 0;

// ========== KHAI BÁO HÀM ==========
void connectWiFi();
void connectMqtt();
void sendHeartbeat();
void callback(char* topic, byte* payload, unsigned int length);
void setRelay(int index, bool state);
void initRelays();

// ========== SETUP ==========
void setup() {
    Serial.begin(115200);
    Serial.println("\n===================================");
    Serial.println("ESP32 Relay 4CH v" + String(FIRMWARE_VERSION));
    Serial.println("Device: " + String(DEVICE_CODE));
    Serial.println("===================================");

    initRelays();
    connectWiFi();

    // Tạo topic
    snprintf(cmdTopic, sizeof(cmdTopic), "cfarm/%s/cmd", DEVICE_CODE);
    snprintf(heartbeatTopic, sizeof(heartbeatTopic), "cfarm/%s/heartbeat", DEVICE_CODE);

    // Cấu hình MQTT
    mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
    mqttClient.setCallback(callback);
    mqttClient.setBufferSize(512);  // Tăng buffer (dự phòng)

    connectMqtt();

    Serial.println("Ready!");
}

// ========== LOOP CHÍNH ==========
void loop() {
    unsigned long now = millis();

    // Xử lý MQTT
    if (mqttClient.connected()) {
        mqttClient.loop();
    } else {
        // Thử reconnect sau khoảng thời gian delay
        if (now - lastReconnectAttempt >= MQTT_RECONNECT_DELAY) {
            lastReconnectAttempt = now;
            connectMqtt();
        }
    }

    // Gửi heartbeat định kỳ
    if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
        lastHeartbeat = now;
        sendHeartbeat();
    }

    delay(10);  // Tránh watchdog, không ảnh hưởng MQTT
}

// ========== KẾT NỐI WiFi ==========
void connectWiFi() {
    Serial.print("Connecting to WiFi");
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 40) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi connected!");
        Serial.println("IP: " + WiFi.localIP().toString());
        Serial.println("RSSI: " + String(WiFi.RSSI()) + " dBm");
    } else {
        Serial.println("\nWiFi FAILED! Check SSID/password.");
    }
}

// ========== KẾT NỐI MQTT ==========
void connectMqtt() {
    Serial.print("Connecting to MQTT... ");
    bool connected = mqttClient.connect(DEVICE_CODE, MQTT_USER, MQTT_PASS);

    if (connected) {
        Serial.println("OK");
        if (mqttClient.subscribe(cmdTopic)) {
            Serial.println("Subscribed to: " + String(cmdTopic));
        } else {
            Serial.println("Subscribe failed!");
        }
    } else {
        Serial.print("FAILED, rc=");
        Serial.println(mqttClient.state());
    }
}

// ========== XỬ LÝ LỆNH MQTT ==========
void callback(char* topic, byte* payload, unsigned int length) {
    // Chuyển payload thành string
    char message[length + 1];
    memcpy(message, payload, length);
    message[length] = '\0';

    Serial.println("MQTT command: " + String(message));

    // Parse JSON
    StaticJsonDocument<256> doc;
    DeserializationError error = deserializeJson(doc, message);

    if (error) {
        Serial.println("JSON parse error!");
        return;
    }

    const char* action = doc["action"] | "";

    if (strcmp(action, "relay") == 0) {
        int relayIndex = -1;
        bool newState = false;

        // Định dạng 1: {"relay":"relay1", "state":true}
        if (doc.containsKey("relay")) {
            const char* relayName = doc["relay"];
            for (int i = 0; i < 4; i++) {
                if (strcmp(relayName, RELAY_NAMES[i]) == 0) {
                    relayIndex = i;
                    break;
                }
            }
            newState = doc["state"] | false;
        }
        // Định dạng 2: {"channel":1, "state":"on"}
        else if (doc.containsKey("channel")) {
            int channel = doc["channel"].as<int>();
            if (channel >= 1 && channel <= 4) {
                relayIndex = channel - 1;
            }
            const char* stateStr = doc["state"] | "off";
            newState = (strcmp(stateStr, "on") == 0 || strcmp(stateStr, "true") == 0);
        }

        if (relayIndex >= 0 && relayIndex < 4) {
            setRelay(relayIndex, newState);
            Serial.printf("Relay %d turned %s\n", relayIndex + 1, newState ? "ON" : "OFF");
        } else {
            Serial.println("Invalid relay channel/name");
        }
    }
    else if (strcmp(action, "ping") == 0) {
        Serial.println("Ping received");
    }
    else {
        Serial.println("Unknown action: " + String(action));
    }
}

// ========== ĐIỀU KHIỂN RELAY ==========
void setRelay(int index, bool state) {
    if (index < 0 || index >= 4) return;
    relayStates[index] = state;
    // Relay module active LOW: LOW = ON, HIGH = OFF
    digitalWrite(RELAY_PINS[index], state ? LOW : HIGH);
}

// ========== GỬI HEARTBEAT ==========
void sendHeartbeat() {
    StaticJsonDocument<384> doc;
    doc["device_code"] = DEVICE_CODE;
    doc["firmware_version"] = FIRMWARE_VERSION;
    doc["device_type"] = DEVICE_TYPE;
    doc["uptime_seconds"] = millis() / 1000;
    doc["wifi_rssi"] = WiFi.RSSI();
    doc["ip"] = WiFi.localIP().toString();
    doc["free_heap"] = ESP.getFreeHeap();
    doc["mqtt_connected"] = mqttClient.connected();

    JsonObject relays = doc.createNestedObject("relays");
    for (int i = 0; i < 4; i++) {
        relays[RELAY_NAMES[i]] = relayStates[i] ? "on" : "off";
    }

    char buffer[512];
    size_t len = serializeJson(doc, buffer);

    if (mqttClient.connected()) {
        bool published = mqttClient.publish(heartbeatTopic, buffer, len);
        if (published) {
            Serial.println("Heartbeat sent OK");
        } else {
            Serial.println("Heartbeat publish FAILED - check MQTT buffer size or broker");
        }
    } else {
        Serial.println("Heartbeat: MQTT not connected");
    }
}

// ========== KHỞI TẠO RELAY ==========
void initRelays() {
    for (int i = 0; i < 4; i++) {
        pinMode(RELAY_PINS[i], OUTPUT);
        digitalWrite(RELAY_PINS[i], HIGH);  // Mặc định OFF
        relayStates[i] = false;
    }
    Serial.println("Relays initialized (OFF state)");
}