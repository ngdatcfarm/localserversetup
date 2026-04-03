import paho.mqtt.client as mqtt
import time

c = mqtt.Client()
result = c.connect('localhost', 1883, keepalive=60)
print(f"Connect result: {result}")
c.loop_start()

time.sleep(1)  # Give time for connection

result, _ = c.publish('cfarm/esp32-01/heartbeat', '{"device_code":"esp32-01","rssi":-50}')
print(f"Publish result: {result}")

time.sleep(1)  # Give time for message to be sent
c.loop_stop()
c.disconnect()
print('Done')
