#!/usr/bin/env python3
"""Test MQTT listener - subscribe and print all messages"""
import paho.mqtt.client as mqtt
import time
import json

def on_connect(client, userdata, flags, rc):
    print(f"[SUB] Connected with result code {rc}")
    client.subscribe("cfarm/#", qos=1)

def on_message(client, userdata, msg):
    print(f"\n[SUB] Topic: {msg.topic}")
    print(f"[SUB] Payload: {msg.payload.decode()[:200]}")
    try:
        data = json.loads(msg.payload)
        print(f"[SUB] Parsed JSON: {data}")
        if "device_code" in data:
            print(f"[SUB] Device code: {data.get('device_code')}")
    except:
        print("[SUB] Not JSON")

client = mqtt.Client()
client.on_connect = on_connect
client.on_message = on_message

print("Connecting to localhost:1883...")
client.connect("localhost", 1883, keepalive=60)
client.loop_start()

print("Waiting for messages (Ctrl+C to exit)...")
try:
    while True:
        time.sleep(1)
except KeyboardInterrupt:
    print("\nExiting...")
    client.loop_stop()
    client.disconnect()
