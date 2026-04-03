@echo off
echo Stopping Mosquitto...
net stop mosquitto

echo.
echo Copying fixed config (forward slashes)...
copy "E:\Local-server\docker\mosquitto\config\mosquitto_fixed2.conf" "C:\Program Files\Mosquitto\mosquitto.conf" /Y

echo.
echo Starting Mosquitto...
net start mosquitto

echo.
echo Testing MQTT connection...
timeout /t 3
netstat -an | findstr 1883

echo.
pause
