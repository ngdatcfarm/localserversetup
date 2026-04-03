"""Cloud MQTT Client - Publish commands to cloud MQTT broker for ESP32 dual-subscribe.

This allows the local server to send commands to ESP32 devices via cloud MQTT,
providing a fallback path when local MQTT is not accessible.

Cloud Broker: 103.166.183.215:1883
Topic Format: cfarm.vn/{device_code}/cmd
"""

import json
import logging
import threading
import time
from typing import Callable, Optional

import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


class CloudMqttClient:
    """Singleton MQTT client for cloud broker communication.

    Used to send commands to ESP32 devices via cloud MQTT when:
    1. User is remote (not on local network)
    2. Local server wants to provide redundant command path
    3. Automation rules need to ensure command delivery
    """

    _instance: Optional["CloudMqttClient"] = None

    def __init__(self):
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        self.host = "103.166.183.215"
        self.port = 1883
        self.username = "cfarm_server"
        self.password = "Abc@@123"
        self.client_id = "cfarm_local_server_cloud"
        self._callbacks: dict[str, list[Callable]] = {}
        self._lock = threading.Lock()
        self._reconnect_thread: Optional[threading.Thread] = None
        self._message_count = 0
        self._last_message_at: Optional[float] = None

    @classmethod
    def get_instance(cls) -> "CloudMqttClient":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def configure(
        self,
        host: str = "103.166.183.215",
        port: int = 1883,
        username: str = "cfarm_server",
        password: str = "Abc@@123",
    ):
        """Configure cloud MQTT connection."""
        self.host = host
        self.port = port
        self.username = username
        self.password = password

    def connect(self) -> bool:
        """Connect to cloud MQTT broker."""
        if not self.host:
            logger.warning("CloudMQTT: No broker configured, skipping")
            return False

        self.client = mqtt.Client(
            client_id=self.client_id,
            protocol=mqtt.MQTTv311,
            clean_session=True,
        )
        if self.username:
            self.client.username_pw_set(self.username, self.password)

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        try:
            self.client.connect(self.host, self.port, keepalive=60)
            self.client.loop_start()
            logger.info(f"CloudMQTT: Connecting to {self.host}:{self.port}...")
            return True
        except Exception as e:
            logger.error(f"CloudMQTT: Connection failed - {e}")
            self._schedule_reconnect()
            return False

    def disconnect(self):
        """Disconnect from cloud broker."""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.connected = False
            logger.info("CloudMQTT: Disconnected")

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.connected = True
            logger.info(f"CloudMQTT: Connected to {self.host}")
            # Subscribe to cloud topics for device responses
            client.subscribe("cfarm.vn/#", qos=1)
        else:
            codes = {
                1: "incorrect protocol",
                2: "invalid client id",
                3: "server unavailable",
                4: "bad credentials",
                5: "not authorized",
            }
            reason = codes.get(rc, f"unknown rc={rc}")
            logger.error(f"CloudMQTT: Connection refused ({reason})")

    def _on_disconnect(self, client, userdata, rc):
        self.connected = False
        if rc != 0:
            logger.warning(f"CloudMQTT: Unexpected disconnect (rc={rc})")
            self._schedule_reconnect()

    def _schedule_reconnect(self):
        """Auto-reconnect in background with exponential backoff."""
        if self._reconnect_thread and self._reconnect_thread.is_alive():
            return

        def _reconnect():
            delay = 5
            while not self.connected:
                time.sleep(delay)
                try:
                    if self.client:
                        self.client.reconnect()
                        logger.info("CloudMQTT: Reconnected")
                        return
                except Exception:
                    delay = min(delay * 2, 60)
                    logger.warning(f"CloudMQTT: Reconnect failed, retry in {delay}s")

        self._reconnect_thread = threading.Thread(target=_reconnect, daemon=True)
        self._reconnect_thread.start()

    def _on_message(self, client, userdata, msg):
        """Route incoming messages to registered callbacks."""
        topic = msg.topic
        try:
            payload = json.loads(msg.payload.decode())
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = msg.payload.decode()

        self._message_count += 1
        self._last_message_at = time.time()

        with self._lock:
            for pattern, handlers in self._callbacks.items():
                if self._topic_matches(pattern, topic):
                    for handler in handlers:
                        try:
                            handler(topic, payload)
                        except Exception as e:
                            logger.error(f"CloudMQTT callback error [{pattern}]: {e}")

    def subscribe(self, topic_pattern: str, callback: Callable):
        """Register a callback for a topic pattern."""
        with self._lock:
            self._callbacks.setdefault(topic_pattern, []).append(callback)
        logger.info(f"CloudMQTT: Registered handler for {topic_pattern}")

    def publish(self, topic: str, payload: dict, qos: int = 1, retain: bool = False) -> bool:
        """Publish a message to cloud MQTT."""
        if not self.client or not self.connected:
            logger.warning(f"CloudMQTT: Not connected, cannot publish to {topic}")
            return False

        try:
            message = json.dumps(payload)
            result = self.client.publish(topic, message, qos=qos, retain=retain)
            return result.rc == mqtt.MQTT_ERR_SUCCESS
        except Exception as e:
            logger.error(f"CloudMQTT: Publish failed - {e}")
            return False

    # =========================================================================
    # Command Publishing Methods (for dual-subscribe ESP32)
    # =========================================================================

    def _build_cloud_topic(self, device_code: str, suffix: str = "cmd") -> str:
        """Build cloud MQTT topic from device code.

        Args:
            device_code: Device identifier (e.g., 'barn1')
            suffix: Topic suffix (cmd, state, heartbeat, pong)

        Returns:
            Topic in format: cfarm.vn/{device_code}/{suffix}
        """
        return f"cfarm.vn/{device_code}/{suffix}"

    def send_relay_command(
        self,
        device_code: str,
        channel: int,
        state: str,
        seq: int = None,
        cmd_id: int = None,
    ) -> bool:
        """Send relay on/off command via cloud MQTT.

        Args:
            device_code: Device identifier
            channel: Relay channel (1-8)
            state: "on" or "off"
            seq: Optional sequence number for tracking
            cmd_id: Optional command ID for acknowledgment

        Returns:
            True if published successfully
        """
        topic = self._build_cloud_topic(device_code, "cmd")
        payload = {
            "action": "relay",
            "channel": channel,
            "state": state,
        }
        if seq is not None:
            payload["seq"] = seq
        if cmd_id is not None:
            payload["cmd_id"] = cmd_id

        result = self.publish(topic, payload)
        if result:
            logger.info(f"CloudMQTT: Relay {state} sent to {device_code} ch{channel}")
        return result

    def send_relay_timed(
        self,
        device_code: str,
        channel: int,
        duration_seconds: int,
        seq: int = None,
        cmd_id: int = None,
    ) -> bool:
        """Send timed relay command via cloud MQTT.

        Args:
            device_code: Device identifier
            channel: Relay channel (1-8)
            duration_seconds: Auto-off duration in seconds
            seq: Optional sequence number
            cmd_id: Optional command ID

        Returns:
            True if published successfully
        """
        topic = self._build_cloud_topic(device_code, "cmd")
        payload = {
            "action": "relay",
            "channel": channel,
            "state": "on",
            "duration": duration_seconds,
        }
        if seq is not None:
            payload["seq"] = seq
        if cmd_id is not None:
            payload["cmd_id"] = cmd_id

        result = self.publish(topic, payload)
        if result:
            logger.info(f"CloudMQTT: Timed relay ({duration_seconds}s) sent to {device_code} ch{channel}")
        return result

    def send_curtain_position(
        self,
        device_code: str,
        position: int,
        seq: int = None,
        cmd_id: int = None,
    ) -> bool:
        """Send curtain position command via cloud MQTT.

        Args:
            device_code: Device identifier
            position: Target position (0-100%)
            seq: Optional sequence number
            cmd_id: Optional command ID

        Returns:
            True if published successfully
        """
        topic = self._build_cloud_topic(device_code, "cmd")
        payload = {
            "action": "set_position",
            "to": position,
        }
        if seq is not None:
            payload["seq"] = seq
        if cmd_id is not None:
            payload["cmd_id"] = cmd_id

        result = self.publish(topic, payload)
        if result:
            logger.info(f"CloudMQTT: Curtain position {position}% sent to {device_code}")
        return result

    def send_ping(self, device_code: str) -> bool:
        """Send ping to device via cloud MQTT.

        Args:
            device_code: Device identifier

        Returns:
            True if published successfully
        """
        topic = self._build_cloud_topic(device_code, "cmd")
        payload = {
            "action": "ping",
            "ts": int(time.time()),
        }

        result = self.publish(topic, payload)
        if result:
            logger.info(f"CloudMQTT: Ping sent to {device_code}")
        return result

    def send_all_relay(
        self,
        device_code: str,
        state: str,
        seq: int = None,
        cmd_id: int = None,
    ) -> bool:
        """Send all relays on/off command via cloud MQTT.

        Args:
            device_code: Device identifier
            state: "on" or "off"
            seq: Optional sequence number
            cmd_id: Optional command ID

        Returns:
            True if published successfully
        """
        topic = self._build_cloud_topic(device_code, "cmd")
        payload = {
            "action": "all",
            "state": state,
        }
        if seq is not None:
            payload["seq"] = seq
        if cmd_id is not None:
            payload["cmd_id"] = cmd_id

        result = self.publish(topic, payload)
        if result:
            logger.info(f"CloudMQTT: All relays {state} sent to {device_code}")
        return result

    def get_stats(self) -> dict:
        """Get cloud MQTT connection stats."""
        return {
            "connected": self.connected,
            "host": self.host,
            "port": self.port,
            "message_count": self._message_count,
            "last_message_at": self._last_message_at,
        }

    @staticmethod
    def _topic_matches(pattern: str, topic: str) -> bool:
        """Simple MQTT topic matching with # wildcard."""
        if pattern == topic:
            return True
        if pattern.endswith("/#"):
            prefix = pattern[:-2]
            return topic.startswith(prefix + "/") or topic == prefix
        if "#" in pattern:
            prefix = pattern.split("#")[0]
            return topic.startswith(prefix)
        return False


# Module-level singleton
cloud_mqtt_client = CloudMqttClient.get_instance()
