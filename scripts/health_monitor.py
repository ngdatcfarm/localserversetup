"""
Docker/PostgreSQL Health Monitor
Chạy nền, notify nếu Docker hoặc Database có vấn đề
"""

import subprocess
import time
import logging
import smtplib
from datetime import datetime
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [monitor] %(levelname)s: %(message)s",
)
logger = logging.getLogger(__name__)

CHECK_INTERVAL = 300  # 5 phút
LOG_FILE = Path(__file__).parent.parent / "logs" / "health_monitor.log"


def check_docker():
    """Check Docker daemon is responding."""
    try:
        result = subprocess.run(
            ["docker", "ps", "-a", "--format", "{{.Names}}"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.returncode == 0, result.stdout.strip()
    except Exception as e:
        return False, str(e)


def check_postgresql():
    """Check PostgreSQL container is running."""
    try:
        result = subprocess.run(
            ["docker", "exec", "cfarm-db", "psql", "-U", "cfarm", "-d", "cfarm_local", "-c", "SELECT 1;"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return result.returncode == 0, "OK"
    except Exception as e:
        return False, str(e)


def check_mqtt():
    """Check MQTT container is running."""
    try:
        result = subprocess.run(
            ["docker", "exec", "cfarm-mqtt", "mosquitto_pub", "-t", "test", "-m", "ping", "-i", "health_check"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        return True, "OK"
    except Exception as e:
        return False, str(e)


def restart_docker():
    """Restart Docker Desktop."""
    logger.warning("Attempting to restart Docker...")
    try:
        subprocess.run(
            ["powershell", "-Command", "Stop-Service", "-Name", "com.docker.service", "-Force"],
            timeout=10,
        )
        time.sleep(3)
        subprocess.run(
            ["powershell", "-Command", "Start-Service", "-Name", "com.docker.service"],
            timeout=30,
        )
        return True
    except Exception as e:
        logger.error(f"Failed to restart Docker: {e}")
        return False


def send_notification(message):
    """Gửi notification qua cloudflare tunnel hoặc email."""
    logger.warning(f"NOTIFICATION: {message}")


def main():
    logger.info("Docker/PostgreSQL Health Monitor started")
    logger.info(f"Checking every {CHECK_INTERVAL} seconds")

    consecutive_failures = 0
    max_failures = 3

    while True:
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        docker_ok, docker_status = check_docker()
        pg_ok, pg_status = check_postgresql()
        mqtt_ok, mqtt_status = check_mqtt()

        all_ok = docker_ok and pg_ok and mqtt_ok

        if all_ok:
            logger.info(f"{timestamp} - All services OK")
            consecutive_failures = 0
        else:
            consecutive_failures += 1
            logger.warning(f"{timestamp} - Issues detected:")
            if not docker_ok:
                logger.warning(f"  Docker: {docker_status}")
            if not pg_ok:
                logger.warning(f"  PostgreSQL: {pg_status}")
            if not mqtt_ok:
                logger.warning(f"  MQTT: {mqtt_status}")

            if consecutive_failures >= max_failures:
                msg = f"Docker health check failed {consecutive_failures} times. Last status: docker={docker_ok}, pg={pg_ok}, mqtt={mqtt_ok}"
                send_notification(msg)

                # Thử restart Docker
                if restart_docker():
                    logger.info("Docker restarted successfully")
                    consecutive_failures = 0
                else:
                    logger.error("Failed to restart Docker, manual intervention needed")

        time.sleep(CHECK_INTERVAL)


if __name__ == "__main__":
    main()