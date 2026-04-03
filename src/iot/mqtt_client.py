"""MQTT Client - Connects to LOCAL Mosquitto broker (primary) with cloud fallback."""

import json
import logging
import threading
import time
from typing import Callable, Optional
import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


class MqttClient:
    """Singleton MQTT client for local broker communication."""

    _instance: Optional["MqttClient"] = None

    def __init__(self):
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        self.host = ""
        self.port = 1883
        self.username = ""
        self.password = ""
        self.client_id = "cfarm_local_server"
        self._callbacks: dict[str, list[Callable]] = {}
        self._lock = threading.Lock()
        self._reconnect_thread: Optional[threading.Thread] = None
        self._message_count = 0
        self._last_message_at: Optional[float] = None

    @classmethod
    def get_instance(cls) -> "MqttClient":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def configure(self, config: dict):
        """Configure from YAML mqtt section."""
        self.host = config.get("host", "localhost")
        self.port = config.get("port", 1883)
        self.username = config.get("username", "cfarm_server")
        self.password = config.get("password", "cfarm_server_2026")
        self.client_id = config.get("client_id", "cfarm_local_server")

    def configure_local_default(self):
        """Quick configure for local Mosquitto broker (Docker)."""
        self.configure({
            "host": "localhost",
            "port": 1883,
            "username": "cfarm_server",
            "password": "cfarm_server_2026",
            "client_id": "cfarm_local_server",
        })

    def connect(self):
        """Connect to MQTT broker."""
        if not self.host:
            logger.warning("MQTT: No broker configured, skipping")
            return

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

        # Will message - server offline notification
        self.client.will_set(
            "cfarm/server/status",
            json.dumps({"status": "offline", "timestamp": time.time()}),
            qos=1,
            retain=True,
        )

        try:
            self.client.connect(self.host, self.port, keepalive=60)
            self.client.loop_start()
            logger.info(f"MQTT: Connecting to {self.host}:{self.port}...")
        except Exception as e:
            logger.error(f"MQTT: Connection failed - {e}")
            self._schedule_reconnect()

    def disconnect(self):
        """Disconnect from broker."""
        if self.client:
            # Publish clean offline status
            self.publish("cfarm/server/status", {
                "status": "offline",
                "timestamp": time.time(),
            }, retain=True)
            self.client.loop_stop()
            self.client.disconnect()
            self.connected = False
            logger.info("MQTT: Disconnected")

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.connected = True
            logger.info(f"MQTT: Connected to {self.host}")
            # Subscribe to all cfarm topics
            client.subscribe("cfarm/#", qos=1)
            # Announce server online
            self.publish("cfarm/server/status", {
                "status": "online",
                "timestamp": time.time(),
            }, retain=True)
        else:
            codes = {
                1: "incorrect protocol",
                2: "invalid client id",
                3: "server unavailable",
                4: "bad credentials",
                5: "not authorized",
            }
            reason = codes.get(rc, f"unknown rc={rc}")
            logger.error(f"MQTT: Connection refused ({reason})")

    def _on_disconnect(self, client, userdata, rc):
        self.connected = False
        if rc != 0:
            logger.warning(f"MQTT: Unexpected disconnect (rc={rc})")
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
                        logger.info("MQTT: Reconnected")
                        return
                except Exception:
                    delay = min(delay * 2, 60)
                    logger.warning(f"MQTT: Reconnect failed, retry in {delay}s")

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
                            logger.error(f"MQTT callback error [{pattern}]: {e}")

    def subscribe(self, topic_pattern: str, callback: Callable):
        """Register a callback for a topic pattern."""
        with self._lock:
            self._callbacks.setdefault(topic_pattern, []).append(callback)
        # Actually subscribe to the MQTT broker
        if self.client and self.connected:
            self.client.subscribe(topic_pattern, qos=1)
        logger.info(f"MQTT: Registered handler for {topic_pattern}")

    def publish(self, topic: str, payload: dict, qos: int = 1, retain: bool = False) -> bool:
        """Publish a message."""
        if not self.client or not self.connected:
            logger.warning(f"MQTT: Not connected, cannot publish to {topic}")
            return False

        try:
            message = json.dumps(payload)
            result = self.client.publish(topic, message, qos=qos, retain=retain)
            return result.rc == mqtt.MQTT_ERR_SUCCESS
        except Exception as e:
            logger.error(f"MQTT: Publish failed - {e}")
            return False

    def send_relay_command(
        self,
        mqtt_topic: str,
        channel: int,
        state: str,
        seq: int = None,
        cmd_id: int = None,
    ) -> bool:
        """Send relay on/off command. Topic format: cfarm/{device_topic}/cmd

        Args:
            mqtt_topic: Device MQTT topic
            channel: Relay channel number
            state: Command state (on/off/timed)
            seq: Optional sequence number for acknowledgment tracking
            cmd_id: Optional command ID for acknowledgment tracking
        """
        topic = f"{mqtt_topic}/cmd" if not mqtt_topic.endswith("/cmd") else mqtt_topic
        payload = {
            "action": "relay",
            "channel": channel,
            "state": state,
        }
        if seq is not None:
            payload["seq"] = seq
        if cmd_id is not None:
            payload["cmd_id"] = cmd_id
        return self.publish(topic, payload)

    def get_stats(self) -> dict:
        """Get MQTT connection stats."""
        return {
            "connected": self.connected,
            "host": self.host,
            "port": self.port,
            "message_count": self._message_count,
            "last_message_at": self._last_message_at,
        }

    @staticmethod
    def _topic_matches(pattern: str, topic: str) -> bool:
        """MQTT topic matching with # and + wildcards."""
        if pattern == topic:
            return True

        # Split into levels
        pattern_parts = pattern.split("/")
        topic_parts = topic.split("/")

        # Check each part
        for i, p in enumerate(pattern_parts):
            if i >= len(topic_parts):
                return False
            if p == "#":
                return True  # # matches rest
            if p == "+":
                continue  # + matches any single level
            if p != topic_parts[i]:
                return False

        return len(pattern_parts) == len(topic_parts)


# Module-level singleton
mqtt_client = MqttClient.get_instance()
