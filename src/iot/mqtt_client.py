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

    def send_relay_command(self, mqtt_topic: str, channel: int, state: str) -> bool:
        """Send relay on/off command. Topic format: cfarm/{device_topic}/cmd"""
        topic = f"{mqtt_topic}/cmd" if not mqtt_topic.endswith("/cmd") else mqtt_topic
        return self.publish(topic, {
            "action": "relay",
            "channel": channel,
            "state": state,
        })

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
mqtt_client = MqttClient.get_instance()
