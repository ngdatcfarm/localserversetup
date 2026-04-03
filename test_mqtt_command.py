#!/usr/bin/env python3
import paho.mqtt.client as mqtt
import time

# Test publishing to ESP32 command topic
client = mqtt.Client(client_id="test_command_sender")
result = client.connect("localhost", 1883, keepalive=60)
print(f"Connect: {result}")
client.loop_start()
time.sleep(1)

# Publish a command to ESP32
topic = "cfarm/esp32-01/cmd"
payload = '{"action":"test","ping":true}'
result, _ = client.publish(topic, payload, qos=1)
print(f"Publish to {topic}: {result}")

time.sleep(2)
client.loop_stop()
client.disconnect()
print("Done")
