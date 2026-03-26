#!/bin/bash
# Generate Mosquitto password file
# Run this ONCE after starting the container:
#   docker exec cfarm-mqtt sh /mosquitto/config/generate_passwd.sh

# Create password file with users
mosquitto_passwd -c -b /mosquitto/config/passwd cfarm_server cfarm_server_2026
mosquitto_passwd -b /mosquitto/config/passwd cfarm_device cfarm_device_2026
mosquitto_passwd -b /mosquitto/config/passwd cfarm_cloud cfarm_cloud_2026

echo "Password file created with 3 users: cfarm_server, cfarm_device, cfarm_cloud"
