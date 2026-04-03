#!/usr/bin/env python3
import paho.mqtt.client as mqtt
import time
import sys

def on_connect(client, userdata, flags, rc):
    print(f"Connected with result code {rc}")
    client.subscribe("cfarm/#", qos=1)
    print("Subscribed to cfarm/#")

def on_message(client, userdata, msg):
    print(f"Received: {msg.topic} -> {msg.payload}")

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message

try:
    result = client.connect("localhost", 1883, keepalive=60)
    print(f"Connect result: {result}")
except Exception as e:
    print(f"Connection failed: {e}")
    sys.exit(1)

client.loop_start()
print("Waiting for messages... (Ctrl+C to exit)")
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\nExiting...")
client.loop_stop()
client.disconnect()
