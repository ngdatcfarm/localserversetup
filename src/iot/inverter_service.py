"""Luxpower inverter polling service (Phase 1 — read-only monitoring).

Polls the inverter every N seconds, caches the latest sample in memory and
persists it to the `inverter_runtime` TimescaleDB hypertable. The Vue dashboard
(`/inverter`) reads the cache via /api/inverter/current and history via
/api/inverter/history.

Lifecycle is identical to the other singleton background services
(AlertService, AI logic service, etc.) — see `alert_service.py` for the
canonical pattern.

Phase 1 = READ-ONLY. This service never writes to the inverter.
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone
from typing import Optional

from src.iot.inverter_client import InverterConfig, LuxpowerClient
from src.iot.inverter_models import InverterRuntime
from src.services.database.db import db

logger = logging.getLogger(__name__)


# Number of uint16 registers to read in each poll.
# The Luxpower dongle returns a FIXED-size payload regardless of count
# requested — observed LEN field is always 191 bytes, which decodes to:
#   LEN = serials(20) + cmd(1) + payload + CRC(2) = 191
#   payload = 168 bytes = 84 uint16 registers (0x54)
# We MUST request exactly 0x54 registers; otherwise the LEN validation in
# _parse_query_response rejects the frame as malformed.
BANK1_REG_COUNT = 0x54


class InverterPollingService:
    """Singleton that polls the Luxpower inverter and caches the latest sample."""

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None

        # Configuration (set via configure() before start())
        self._enabled: bool = False
        self._cfg: Optional[InverterConfig] = None
        self._poll_interval: float = 5.0

        # Runtime state
        self._client: Optional[LuxpowerClient] = None
        self._current: Optional[InverterRuntime] = None
        self._last_poll_at: Optional[datetime] = None
        self._last_error: Optional[str] = None
        self._poll_count: int = 0
        self._error_count: int = 0

    # ── Public introspection (read-only) ───────────────────────────────
    @property
    def enabled(self) -> bool:
        return self._enabled

    @property
    def connected(self) -> bool:
        return self._client is not None and self._client.connected

    @property
    def current(self) -> Optional[InverterRuntime]:
        return self._current

    def status(self) -> dict:
        """Snapshot of internal state — for /api/inverter/status."""
        return {
            "enabled": self._enabled,
            "running": self._running,
            "connected": self.connected,
            "last_poll_at": (
                self._last_poll_at.astimezone(timezone.utc).isoformat()
                if self._last_poll_at
                else None
            ),
            "last_error": self._last_error,
            "poll_count": self._poll_count,
            "error_count": self._error_count,
            "poll_interval_seconds": self._poll_interval,
        }

    # ── Configuration ──────────────────────────────────────────────────
    def configure(self, cfg: dict) -> None:
        """Read config from `config/cameras.yaml` `inverter:` section.

        Safe to call before start(); no I/O happens here.
        """
        self._enabled = bool(cfg.get("enabled", False))
        if not self._enabled:
            logger.info("InverterPollingService: disabled by config")
            return

        self._cfg = InverterConfig(
            host=cfg.get("host", "192.168.1.50"),
            port=int(cfg.get("port", 8000)),
            dongle_serial=cfg.get("dongle_serial", "BAxxxxxxxx"),
            inverter_serial=cfg.get("inverter_serial", "xxxxxxxxxx"),
            timeout_seconds=float(cfg.get("timeout_seconds", 5.0)),
            reconnect_interval_seconds=float(
                cfg.get("reconnect_interval_seconds", 10.0)
            ),
        )
        self._poll_interval = float(cfg.get("poll_interval_seconds", 5.0))
        logger.info(
            "InverterPollingService configured (host=%s port=%d interval=%.1fs)",
            self._cfg.host,
            self._cfg.port,
            self._poll_interval,
        )

    # ── Lifecycle ──────────────────────────────────────────────────────
    async def start(self) -> None:
        """Start the polling loop."""
        if not self._enabled:
            logger.info("InverterPollingService: not starting (disabled)")
            return
        if self._cfg is None:
            logger.warning("InverterPollingService: configure() not called yet")
            return
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        logger.info(
            "InverterPollingService started (interval=%.1fs)", self._poll_interval
        )

    async def stop(self) -> None:
        """Stop the polling loop and close the TCP connection."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):
                pass
            self._task = None
        if self._client:
            await self._client.close()
            self._client = None
        logger.info("InverterPollingService stopped")

    # ── Main loop ──────────────────────────────────────────────────────
    async def _loop(self) -> None:
        # Small initial backoff so we don't race MQTT / DB on boot
        await asyncio.sleep(1.0)
        backoff = 1.0
        while self._running:
            try:
                await self._poll_once()
                backoff = 1.0  # reset on success
                await asyncio.sleep(self._poll_interval)
            except asyncio.CancelledError:
                raise
            except Exception as e:
                self._last_error = str(e)
                self._error_count += 1
                logger.warning(
                    "Inverter poll error (#%d): %s — retrying in %.1fs",
                    self._error_count,
                    e,
                    min(backoff, self._poll_interval * 4),
                )
                await asyncio.sleep(backoff)
                backoff = min(backoff * 2.0, 30.0)

    async def _poll_once(self) -> None:
        """One poll cycle: connect (if needed) → read → cache → persist."""
        if self._client is None:
            self._client = LuxpowerClient(self._cfg)  # type: ignore[arg-type]

        if not self._client.connected:
            try:
                await self._client.connect()
            except Exception as e:
                # Surface as last_error; outer loop will retry with backoff.
                raise ConnectionError(f"connect failed: {e}") from e

        regs = await self._client.read_input_registers(0, BANK1_REG_COUNT)
        ts = datetime.now(timezone.utc)
        rt = InverterRuntime.from_registers(regs, ts=ts)

        # Cache first (so /current always works), then persist best-effort.
        self._current = rt
        self._last_poll_at = ts
        self._poll_count += 1
        self._last_error = None

        # Persist (don't fail the cycle if DB is down)
        try:
            await db.execute(
                """INSERT INTO inverter_runtime
                       (ts, ppv1, ppv2, p_grid, p_eps, p_bat,
                        soc, v_bat, raw)
                   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)""",
                ts,
                rt.ppv1,
                rt.ppv2,
                rt.p_grid,
                rt.p_eps,
                rt.p_bat,
                rt.soc,
                rt.v_bat,
                json.dumps(rt.raw_registers),
            )
        except Exception as e:
            logger.debug("Inverter persist failed (non-fatal): %s", e)

        if self._poll_count == 1 or self._poll_count % 12 == 0:
            logger.info(
                "Inverter poll #%d: ppv=%.0fW (%.0f+%.0f) grid=%+.0fW "
                "load=%.0fW bat=%+.0fW soc=%.0f%%",
                self._poll_count,
                rt.total_pv(),
                rt.ppv1,
                rt.ppv2,
                rt.p_grid,
                rt.p_eps,
                rt.p_bat,
                rt.soc,
            )


# Module-level singleton — `from src.iot.inverter_service import inverter_service`
inverter_service = InverterPollingService()


__all__ = ["InverterPollingService", "inverter_service"]
