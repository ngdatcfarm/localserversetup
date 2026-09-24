"""MQTT Client - Connects to LOCAL Mosquitto broker (primary) with cloud fallback."""

import asyncio
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
        # Main asyncio loop reference — set by main.py via set_main_loop()
        # during startup. Needed because paho-mqtt calls our handlers from its
        # OWN IO thread (loop_start() spawns a non-asyncio thread), but
        # coroutines like BrooderController._tick_pid must run on the main
        # event loop. Without this, asyncio.create_task() inside a sync
        # callback raises "no running event loop" and the coroutine is never
        # awaited → PID tick silently never runs.
        self._main_loop: Optional[asyncio.AbstractEventLoop] = None

    def set_main_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        """Capture the main asyncio event loop. Call this from main.py
        BEFORE connect() so any sync MQTT callback can later schedule
        coroutines on it via schedule_coroutine().
        """
        self._main_loop = loop
        logger.info(f"MQTT: Main event loop captured (id={id(loop)})")

    def schedule_coroutine(self, coro):
        """Schedule a coroutine on the captured main event loop.

        Safe to call from paho-mqtt's IO thread (which has no event loop of
        its own). Returns a concurrent.futures.Future for callers that want
        to wait, or None if no main loop has been captured yet (in which
        case the coroutine is dropped — same outcome as the bug we're
        fixing, but at least we log it).
        """
        if self._main_loop is None:
            logger.warning(
                "MQTT: schedule_coroutine called but main loop not yet "
                "captured — coroutine dropped"
            )
            return None
        return asyncio.run_coroutine_threadsafe(coro, self._main_loop)

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
        """Quick configure for local Mosquitto broker."""
        self.configure({
            "host": "192.168.1.9",
            "port": 1884,
            "username": "",
            "password": "",
            "client_id": "cfarm_local_server",
        })

    def connect(self):
        """Connect to MQTT broker."""
        if not self.host:
            logger.warning("MQTT: No broker configured, skipping")
            return

        self.client = mqtt.Client(
            client_id=f"{self.client_id}_{id(self)}",
            protocol=mqtt.MQTTv311,
            clean_session=True,
        )
        if self.username:
            self.client.username_pw_set(self.username, self.password)

        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message

        # No will message - avoid broker conflicts
        # self.client.will_set(...)  # removed to prevent rc=7 disconnects

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
            # Subscribe to ALL cfarm topics via the single broad wildcard.
            # In-process dispatch then routes each message to the correct
            # registered pattern in self._callbacks.
            #
            # IMPORTANT: We deliberately do NOT subscribe to specific patterns
            # like 'cfarm/+/heartbeat' here. Per MQTT spec §3.1.2.6 (v5) /
            # §2.2.1 (v3.1.1), when a client has overlapping subscriptions the
            # broker MUST deliver the message once PER matching subscription.
            # Subscribing to both 'cfarm/#' AND 'cfarm/+/heartbeat' makes every
            # heartbeat / sensor / status / telemetry / lwt message arrive
            # TWICE — once for 'cfarm/#' and once for the specific pattern.
            # The duplicates corrupted _store_heartbeat (rows ×2), thrashed
            # _tick_pid (ticks ×2), and spammed logs with "MQTT HEARTBEAT" 2×.
            # Single broker subscription + in-process pattern matching is the
            # correct fix.
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
        logger.warning(f"MQTT: Disconnected (rc={rc})")
        # NOTE: paho-mqtt's loop_start() already handles auto-reconnect internally.
        # We don't need to call reconnect() manually - that causes rc=7 (session taken over)
        # because paho reconnects async while our _schedule_reconnect also calls reconnect().
        # Just log and let paho's built-in mechanism handle it.

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
            payload = json.loads(msg.payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            # Decode failed (binary payload, or non-UTF-8 bytes from sensor
            # data / Vietnamese chars in 8-bit fields). The previous version
            # re-ran .decode() in the except block, which raised the same
            # UnicodeDecodeError and bubbled up to paho-mqtt's _thread_main —
            # the traceback was logged, the message was DROPPED, and on a
            # crash-loop supervisor the operator saw heartbeats from some
            # devices but a permanent gap on any device whose payload
            # happened to contain a stray 0x80-0xBF byte (e.g. esp32-1168
            # heartbeats at position 385). Fix: keep raw bytes as the
            # fallback. Per-topic handlers can decide whether to .decode()
            # themselves with the right codec.
            payload = msg.payload
            logger.debug(
                "MQTT: payload on %s not UTF-8 JSON, keeping raw bytes (%d bytes)",
                topic, len(msg.payload) if msg.payload else 0,
            )

        self._message_count += 1
        self._last_message_at = time.time()

        logger.info(f"MQTT message: topic={topic}")
        if "heartbeat" in topic:
            # Heartbeats are always JSON; if we ended up with raw bytes,
            # surface the fact instead of crashing the log formatter.
            if isinstance(payload, (bytes, bytearray)):
                logger.warning(
                    "MQTT HEARTBEAT message on %s: <%d bytes, non-UTF-8 payload>",
                    topic, len(payload),
                )
            else:
                logger.warning(f"MQTT HEARTBEAT message on {topic}: {payload}")
        with self._lock:
            for pattern, handlers in self._callbacks.items():
                if self._topic_matches(pattern, topic):
                    for handler in handlers:
                        try:
                            handler(topic, payload)
                        except Exception as e:
                            logger.error(f"MQTT callback error [{pattern}]: {e}")

    def subscribe(self, topic_pattern: str, callback: Callable):
        """Register a callback for a topic pattern.

        Deduplicates: if the same callback object is already registered for this
        pattern, skip the append. Prevents N×duplicate handler invocations on
        every MQTT message after server restarts (each restart called subscribe()
        again and the previous lists were never cleared).

        NOTE: We do NOT forward this pattern to the broker — the broker already
        receives every message via the single 'cfarm/#' subscription in
        _on_connect. Subscribing again per-pattern would cause the broker to
        deliver each overlapping message twice (see _on_connect for details).
        The in-process _callbacks dict does its own MQTT-style pattern matching
        in _topic_matches().
        """
        with self._lock:
            handlers = self._callbacks.setdefault(topic_pattern, [])
            if callback not in handlers:
                handlers.append(callback)
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
