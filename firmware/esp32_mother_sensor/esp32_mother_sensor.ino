/**
 * =========================================================
 * CFarm ESP32 Mother Sensor Firmware
 * Stable Reconnect + OTA Version
 * ESP32 Core 3.x Compatible
 * Version: 1.0.2
 * =========================================================
 */

#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <Update.h>

#include <Wire.h>
#include <Adafruit_SHT4x.h>

#include <esp_task_wdt.h>

// ======================================================
// WIFI
// ======================================================

const char* WIFI_SSID = "Dat Lim";
const char* WIFI_PASSWORD = "hoilamgi";

// ======================================================
// DEVICE
// ======================================================

const char* DEVICE_CODE = "esp-41399";
const char* DEVICE_TYPE = "sensor";

// ======================================================
// SERVER
// ======================================================

const char* LOCAL_SERVER = "http://192.168.1.9:8002";

// ======================================================
// MQTT
// ======================================================

// LOCAL
const char* LOCAL_MQTT_SERVER = "192.168.1.9";
const int LOCAL_MQTT_PORT = 1884;

const char* LOCAL_MQTT_USER = "cfarm_device";
const char* LOCAL_MQTT_PASS = "cfarm_device_2026";

// CLOUD
const char* CLOUD_MQTT_SERVER = "103.166.183.215";
const int CLOUD_MQTT_PORT = 1883;

const char* CLOUD_MQTT_USER = "cfarm_server";
const char* CLOUD_MQTT_PASS = "Abc@@123";

// ======================================================
// FIRMWARE
// ======================================================

const char* FIRMWARE_VERSION = "1.0.2";
const char* FIRMWARE_NAME = "esp32_mother_sensor";

// ======================================================
// GPIO
// ======================================================

#define MQ135_PIN 34
#define MQ137_PIN 35

#define I2C_SDA 21
#define I2C_SCL 22

#define STATUS_LED 2

// ======================================================
// SENSOR OBJECTS
// ======================================================

Adafruit_SHT4x sht4;

// ======================================================
// CLIENTS
// ======================================================

WiFiClient wifiClientLocal;
WiFiClient wifiClientCloud;

PubSubClient localMqttClient(wifiClientLocal);
PubSubClient cloudMqttClient(wifiClientCloud);

// ======================================================
// TIMING
// ======================================================

const unsigned long SENSOR_INTERVAL = 10000;
const unsigned long HEARTBEAT_INTERVAL = 30000;

const unsigned long WIFI_RETRY_INTERVAL = 10000;
const unsigned long MQTT_RETRY_INTERVAL = 5000;

unsigned long lastSensorSend = 0;
unsigned long lastHeartbeat = 0;

unsigned long lastWifiRetry = 0;
unsigned long lastLocalMqttRetry = 0;
unsigned long lastCloudMqttRetry = 0;

// ======================================================
// SENSOR VALUES
// ======================================================

float temperature = 0;
float humidity = 0;

int mq135Raw = 0;
int mq137Raw = 0;

// ======================================================
// OTA
// ======================================================

bool otaPending = false;

char otaUrl[256];

// ======================================================
// TOPICS
// ======================================================

char LOCAL_CMD_TOPIC[64];
char LOCAL_SENSOR_TOPIC[64];
char LOCAL_HEARTBEAT_TOPIC[64];

char CLOUD_CMD_TOPIC[64];
char CLOUD_SENSOR_TOPIC[64];
char CLOUD_HEARTBEAT_TOPIC[64];

// ======================================================
// BUILD TOPICS
// ======================================================

void buildTopics() {

  snprintf(LOCAL_CMD_TOPIC, sizeof(LOCAL_CMD_TOPIC),
    "cfarm/%s/cmd", DEVICE_CODE);

  snprintf(LOCAL_SENSOR_TOPIC, sizeof(LOCAL_SENSOR_TOPIC),
    "cfarm/%s/sensor", DEVICE_CODE);

  snprintf(LOCAL_HEARTBEAT_TOPIC, sizeof(LOCAL_HEARTBEAT_TOPIC),
    "cfarm/%s/heartbeat", DEVICE_CODE);

  snprintf(CLOUD_CMD_TOPIC, sizeof(CLOUD_CMD_TOPIC),
    "cfarm.vn/%s/cmd", DEVICE_CODE);

  snprintf(CLOUD_SENSOR_TOPIC, sizeof(CLOUD_SENSOR_TOPIC),
    "cfarm.vn/%s/sensor", DEVICE_CODE);

  snprintf(CLOUD_HEARTBEAT_TOPIC, sizeof(CLOUD_HEARTBEAT_TOPIC),
    "cfarm.vn/%s/heartbeat", DEVICE_CODE);
}

// ======================================================
// WIFI
// ======================================================

void connectWiFi() {

  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  if (millis() - lastWifiRetry < WIFI_RETRY_INTERVAL) {
    return;
  }

  lastWifiRetry = millis();

  Serial.println("WiFi reconnecting...");

  WiFi.disconnect(true);
  delay(100);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
}

// ======================================================
// MQTT
// ======================================================

void connectLocalMqtt() {

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  if (localMqttClient.connected()) {
    return;
  }

  if (millis() - lastLocalMqttRetry < MQTT_RETRY_INTERVAL) {
    return;
  }

  lastLocalMqttRetry = millis();

  wifiClientLocal.stop();

  Serial.println("Connecting LOCAL MQTT...");

  if (localMqttClient.connect(DEVICE_CODE, LOCAL_MQTT_USER, LOCAL_MQTT_PASS)) {

    Serial.println("LOCAL MQTT Connected");
    localMqttClient.subscribe(LOCAL_CMD_TOPIC);

  } else {

    Serial.print("LOCAL MQTT FAIL rc=");
    Serial.println(localMqttClient.state());
  }
}

void connectCloudMqtt() {

  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  if (cloudMqttClient.connected()) {
    return;
  }

  if (millis() - lastCloudMqttRetry < MQTT_RETRY_INTERVAL) {
    return;
  }

  lastCloudMqttRetry = millis();

  wifiClientCloud.stop();

  char clientId[64];
  snprintf(clientId, sizeof(clientId), "%s_cloud", DEVICE_CODE);

  Serial.println("Connecting CLOUD MQTT...");

  if (cloudMqttClient.connect(clientId, CLOUD_MQTT_USER, CLOUD_MQTT_PASS)) {

    Serial.println("CLOUD MQTT Connected");
    cloudMqttClient.subscribe(CLOUD_CMD_TOPIC);

  } else {

    Serial.print("CLOUD MQTT FAIL rc=");
    Serial.println(cloudMqttClient.state());
  }
}

// ======================================================
// OTA
// ======================================================

void performOta(const char* url) {

  Serial.println("===== OTA START =====");

  localMqttClient.disconnect();
  cloudMqttClient.disconnect();

  HTTPClient http;
  WiFiClient client;

  client.setTimeout(5);
  http.setTimeout(5000);

  if (!http.begin(client, url)) {
    Serial.println("OTA begin fail");
    return;
  }

  int httpCode = http.GET();

  if (httpCode != HTTP_CODE_OK) {
    Serial.println("OTA GET fail");
    http.end();
    return;
  }

  int contentLength = http.getSize();

  if (contentLength <= 0) {
    Serial.println("Invalid OTA size");
    http.end();
    return;
  }

  if (!Update.begin(contentLength)) {
    Serial.println("OTA begin update fail");
    http.end();
    return;
  }

  WiFiClient* stream = http.getStreamPtr();
  uint8_t buffer[1024];
  int writtenTotal = 0;

  while (http.connected() && writtenTotal < contentLength) {

    esp_task_wdt_reset();

    size_t available = stream->available();

    if (available) {

      int readBytes = stream->readBytes(buffer, min((int)available, (int)sizeof(buffer)));

      if (readBytes > 0) {
        Update.write(buffer, readBytes);
        writtenTotal += readBytes;
        Serial.printf("OTA %d/%d\n", writtenTotal, contentLength);
      }
    }

    delay(1);
  }

  if (!Update.end()) {
    Serial.println("OTA end fail");
    http.end();
    return;
  }

  if (!Update.isFinished()) {
    Serial.println("OTA incomplete");
    http.end();
    return;
  }

  Serial.println("OTA SUCCESS");
  http.end();
  delay(1000);
  ESP.restart();
}

// ======================================================
// COMMAND
// ======================================================

void handleCommand(JsonDocument& doc) {

  const char* action = doc["action"] | "";

  if (strcmp(action, "ping") == 0) {
    Serial.println("PING");

  } else if (strcmp(action, "ota") == 0) {

    const char* url = doc["url"] | "";

    if (strlen(url) > 0) {
      strncpy(otaUrl, url, sizeof(otaUrl));
      otaPending = true;
      Serial.println("OTA queued");
    }
  }
}

// ======================================================
// MQTT CALLBACKS
// ======================================================

void localMqttCallback(char* topic, byte* payload, unsigned int length) {

  StaticJsonDocument<512> doc;

  if (deserializeJson(doc, payload, length) == DeserializationError::Ok) {
    handleCommand(doc);
  }
}

void cloudMqttCallback(char* topic, byte* payload, unsigned int length) {

  StaticJsonDocument<512> doc;

  if (deserializeJson(doc, payload, length) == DeserializationError::Ok) {
    handleCommand(doc);
  }
}

// ======================================================
// SENSOR
// ======================================================

void initSensors() {

  Wire.begin(I2C_SDA, I2C_SCL);

  if (!sht4.begin()) {
    Serial.println("SHT40 FAIL");
  } else {
    Serial.println("SHT40 OK");
  }

  analogReadResolution(12);
}

void readSensors() {

  mq135Raw = analogRead(MQ135_PIN);
  mq137Raw = analogRead(MQ137_PIN);

  sensors_event_t humidityEvent;
  sensors_event_t tempEvent;

  if (sht4.getEvent(&humidityEvent, &tempEvent)) {
    temperature = tempEvent.temperature;
    humidity = humidityEvent.relative_humidity;
  }
}

// ======================================================
// SEND SENSOR
// ======================================================

void sendSensorData() {

  StaticJsonDocument<512> doc;

  doc["device_code"] = DEVICE_CODE;
  doc["temperature"] = temperature;
  doc["humidity"] = humidity;
  doc["mq135_raw"] = mq135Raw;
  doc["mq137_raw"] = mq137Raw;
  doc["timestamp"] = millis();

  char buffer[512];
  serializeJson(doc, buffer);

  if (localMqttClient.connected()) {
    localMqttClient.publish(LOCAL_SENSOR_TOPIC, buffer);
  }

  if (cloudMqttClient.connected()) {
    cloudMqttClient.publish(CLOUD_SENSOR_TOPIC, buffer);
  }

  Serial.println("Sensor sent");
}

// ======================================================
// HEARTBEAT (FIXED)
// ======================================================

void sendHeartbeat() {

  StaticJsonDocument<512> doc;

  doc["device_code"] = DEVICE_CODE;
  doc["firmware_version"] = FIRMWARE_VERSION;
  doc["firmware_name"] = FIRMWARE_NAME;
  doc["device_type"] = DEVICE_TYPE;
  doc["uptime_seconds"] = millis() / 1000;
  doc["wifi_rssi"] = WiFi.RSSI();
  doc["free_heap"] = ESP.getFreeHeap();
  doc["ip_address"] = WiFi.localIP();  // FIXED: no .toString()
  doc["local_mqtt"] = localMqttClient.connected();
  doc["cloud_mqtt"] = cloudMqttClient.connected();

  char buffer[512];
  serializeJson(doc, buffer);

  if (localMqttClient.connected()) {
    localMqttClient.publish(LOCAL_HEARTBEAT_TOPIC, buffer);
  }

  if (cloudMqttClient.connected()) {
    cloudMqttClient.publish(CLOUD_HEARTBEAT_TOPIC, buffer);
  }

  Serial.println("Heartbeat sent");
}

// ======================================================
// SETUP
// ======================================================

void setup() {

  Serial.begin(115200);

  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(STATUS_LED, LOW);

  buildTopics();
  initSensors();

  // WIFI
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  // MQTT
  localMqttClient.setServer(LOCAL_MQTT_SERVER, LOCAL_MQTT_PORT);
  cloudMqttClient.setServer(CLOUD_MQTT_SERVER, CLOUD_MQTT_PORT);

  localMqttClient.setCallback(localMqttCallback);
  cloudMqttClient.setCallback(cloudMqttCallback);

  localMqttClient.setKeepAlive(15);
  cloudMqttClient.setKeepAlive(15);

  localMqttClient.setSocketTimeout(3);
  cloudMqttClient.setSocketTimeout(3);

  // WATCHDOG
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = 120000,
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic = true
  };

  esp_task_wdt_init(&wdt_config);
  esp_task_wdt_add(NULL);

  Serial.println("System Ready");
}

// ======================================================
// LOOP
// ======================================================

void loop() {

  esp_task_wdt_reset();

  unsigned long now = millis();

  // WIFI
  if (WiFi.status() != WL_CONNECTED) {
    digitalWrite(STATUS_LED, LOW);
    connectWiFi();
  } else {
    digitalWrite(STATUS_LED, HIGH);
  }

  // MQTT
  connectLocalMqtt();
  connectCloudMqtt();

  localMqttClient.loop();
  cloudMqttClient.loop();

  // OTA
  if (otaPending) {
    otaPending = false;
    performOta(otaUrl);
  }

  // SENSOR
  if (now - lastSensorSend >= SENSOR_INTERVAL) {
    readSensors();
    sendSensorData();
    lastSensorSend = now;
  }

  // HEARTBEAT
  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL) {
    sendHeartbeat();
    lastHeartbeat = now;
  }

  delay(1);
}