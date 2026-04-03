@echo off
echo Stopping Mosquitto...
net stop mosquitto

echo.
echo Creating password file...
"C:\Program Files\Mosquitto\mosquitto_passwd.exe" -c -b "E:\Local-server\docker\mosquitto\config\passwd" cfarm_device cfarm_device_2026

echo.
echo Copying new config...
copy "E:\Local-server\docker\mosquitto\config\mosquitto_fixed.conf" "C:\Program Files\Mosquitto\mosquitto.conf" /Y

echo.
echo Starting Mosquitto...
net start mosquitto

echo.
echo Verifying (should show 0.0.0.0:1883):
netstat -an | findstr 1883

echo.
pause
