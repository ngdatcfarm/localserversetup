"""MQTT Client - Connects to cfarm cloud broker."""

import json
import threading
import time
from typing import Callable, Optional
import paho.mqtt.client as mqtt


class MqttClient:
    """Singleton MQTT client for cloud communication."""

    _instance: Optional["MqttClient"] = None

    def __init__(self):
        self.client: Optional[mqtt.Client] = None
        self.connected = False
        self.host = ""
        self.port = 1883
        self.username = ""
        self.password = ""
        self._callbacks: dict[str, list[Callable]] = {}
        self._lock = threading.Lock()
        self._reconnect_thread: Optional[threading.Thread] = None

    @classmethod
    def get_instance(cls) -> "MqttClient":
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def configure(self, config: dict):
        """Configure from YAML mqtt section."""
        self.host = config.get("host", "")
        self.port = config.get("port", 1883)
        self.username = config.get("username", "")
        self.password = config.get("password", "")

    def connect(self):
        """Connect to MQTT broker."""
        if not self.host:
            print("MQTT: No broker configured, skipping")
            return

        self.client = mqtt.Client(
            client_id="cfarm_local_server",
            protocol=mqtt.MQTTv311,
        )
        if self.username:
            self.client.username_pw_set(self.username, self.password)

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        try:
            self.client.connect(self.host, self.port, keepalive=60)
            self.client.loop_start()
            print(f"MQTT: Connecting to {self.host}:{self.port}...")
        except Exception as e:
            print(f"MQTT: Connection failed - {e}")
            self._schedule_reconnect()

    def disconnect(self):
        """Disconnect from broker."""
        if self.client:
            self.client.loop_stop()
            self.client.disconnect()
            self.connected = False

    def _on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            self.connected = True
            print(f"MQTT: Connected to {self.host}")
            # Subscribe to all cfarm topics
            client.subscribe("cfarm/#", qos=1)
        else:
            print(f"MQTT: Connection refused (rc={rc})")

    def _on_disconnect(self, client, userdata, rc):
        self.connected = False
        if rc != 0:
            print(f"MQTT: Unexpected disconnect (rc={rc})")
            self._schedule_reconnect()

    def _schedule_reconnect(self):
        """Auto-reconnect in background."""
        if self._reconnect_thread and self._reconnect_thread.is_alive():
            return

        def _reconnect():
            delay = 5
            while not self.connected:
                time.sleep(delay)
                try:
                    if self.client:
                        self.client.reconnect()
                        print("MQTT: Reconnected")
                        return
                except Exception:
                    delay = min(delay * 2, 60)
                    print(f"MQTT: Reconnect failed, retry in {delay}s")

        self._reconnect_thread = threading.Thread(target=_reconnect, daemon=True)
        self._reconnect_thread.start()

    def _on_message(self, client, userdata, msg):
        """Route incoming messages to registered callbacks."""
        topic = msg.topic
        try:
            payload = json.loads(msg.payload.decode())
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = msg.payload.decode()

        with self._lock:
            for pattern, handlers in self._callbacks.items():
                if self._topic_matches(pattern, topic):
                    for handler in handlers:
                        try:
                            handler(topic, payload)
                        except Exception as e:
                            print(f"MQTT callback error: {e}")

    def subscribe(self, topic_pattern: str, callback: Callable):
        """Register a callback for a topic pattern."""
        with self._lock:
            self._callbacks.setdefault(topic_pattern, []).append(callback)

    def publish(self, topic: str, payload: dict, qos: int = 1) -> bool:
        """Publish a message."""
        if not self.client or not self.connected:
            print(f"MQTT: Not connected, cannot publish to {topic}")
            return False

        try:
            message = json.dumps(payload)
            result = self.client.publish(topic, message, qos=qos)
            return result.rc == mqtt.MQTT_ERR_SUCCESS
        except Exception as e:
            print(f"MQTT: Publish failed - {e}")
            return False

    def send_relay_command(self, mqtt_topic: str, channel: int, state: str) -> bool:
        """Send relay on/off command. Topic format: cfarm/{device_topic}/cmd"""
        topic = f"{mqtt_topic}/cmd" if not mqtt_topic.endswith("/cmd") else mqtt_topic
        return self.publish(topic, {
            "action": "relay",
            "channel": channel,
            "state": state,
        })

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
