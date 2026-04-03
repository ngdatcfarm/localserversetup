#!/usr/bin/env python3
import paho.mqtt.client as mqtt
import time
import threading
import sys

received_messages = []

def on_connect(client, userdata, flags, rc):
    print(f"[SUB] Connected with result code {rc}")
    client.subscribe("cfarm/#", qos=1)
    print("[SUB] Subscribed to cfarm/#")

def on_message(client, userdata, msg):
    print(f"[SUB] Received: {msg.topic} -> {msg.payload.decode()}")
    received_messages.append(msg)

# Create subscriber
sub_client = mqtt.Client(client_id="test_subscriber")
sub_client.on_connect = on_connect
sub_client.on_message = on_message

# Connect
print("[SUB] Connecting to localhost:1883...")
result = sub_client.connect("localhost", 1883, keepalive=60)
print(f"[SUB] Connect result: {result}")

# Start loop in background
sub_client.loop_start()
print("[SUB] Loop started, waiting for messages...")

# Wait for connection
time.sleep(2)

# Create publisher
pub_client = mqtt.Client(client_id="test_publisher")
pub_result = pub_client.connect("localhost", 1883, keepalive=60)
print(f"[PUB] Connect result: {pub_result}")
pub_client.loop_start()
time.sleep(1)

# Publish
pub_result, _ = pub_client.publish("cfarm/esp32-01/heartbeat", '{"device_code":"esp32-01","rssi":-50}', qos=1)
print(f"[PUB] Publish result: {pub_result}")

# Wait for message to be received
time.sleep(3)

# Check results
print(f"\n=== RESULTS ===")
print(f"Messages received: {len(received_messages)}")
for msg in received_messages:
    print(f"  - {msg.topic}: {msg.payload}")

if len(received_messages) > 0:
    print("\n✓ MQTT Pub/Sub is WORKING!")
else:
    print("\n✗ MQTT Pub/Sub is NOT working - no messages received!")

# Cleanup
sub_client.loop_stop()
sub_client.disconnect()
pub_client.loop_stop()
pub_client.disconnect()
