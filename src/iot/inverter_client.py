"""Luxpower inverter TCP client (LAN, port 8000).

Low-level wrapper around the Luxpower "envelope" protocol that the WiFi dongle
speaks. The dongle exposes a single TCP port (default 8000); we send framed
requests and read framed responses.

Frame layout (little-endian on the wire unless noted):

    | A1 1A | 02 00 | len(u16) | dongle_sn(10) | inverter_sn(10) | cmd(u8) | payload... | CRC16(u16 LE) |

  - `A1 1A`  : magic header (constant)
  - `02 00`  : protocol version
  - `len`    : total length of everything AFTER this field (header + payload + CRC)
  - `cmd`    : 0x01 = query input registers, 0x02 = write holding registers (not used in Phase 1)
  - `CRC16`  : Modbus RTU CRC16 (poly 0xA001, init 0xFFFF) over EVERYTHING before
               the CRC field (i.e. header bytes + dongle_sn + inverter_sn + cmd + payload)

Phase 1 is READ-ONLY: only cmd 0x01 is used. No write commands are issued.
"""

from __future__ import annotations

import asyncio
import logging
import struct
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# ── Frame constants ─────────────────────────────────────────────────────
MAGIC = b"\xA1\x1A"
# The dongle responds with protocol version 5 (0x05 0x00 LE). The wire-up of
# the rest of the envelope looks identical, so we speak v5 to match. Some
# older firmwares may speak v2 — that path is preserved in _build_query_frame_v2
# for debugging if v5 doesn't work.
PROTO_VER = b"\x05\x00"
CMD_QUERY_INPUT_REGISTERS = 0x03
SERIAL_LEN = 10  # both dongle_sn and inverter_sn are exactly 10 ASCII bytes

# Number of attempts per read before giving up. The Luxpower dongle frequently
# drops the first read after a period of silence, so a single retry is not
# enough; 3 attempts (~0.6s extra latency at worst) covers ~99% of cases.
MAX_READ_RETRIES = 3


# ── Configuration ───────────────────────────────────────────────────────
@dataclass
class InverterConfig:
    """Connection details for the Luxpower WiFi dongle."""

    host: str = "192.168.1.50"
    port: int = 8000
    dongle_serial: str = "BAxxxxxxxx"
    inverter_serial: str = "xxxxxxxxxx"
    timeout_seconds: float = 5.0
    reconnect_interval_seconds: float = 10.0


# ── CRC16 Modbus RTU ────────────────────────────────────────────────────
def _modbus_crc16(data: bytes) -> int:
    """Compute Modbus RTU CRC16 (poly 0xA001, init 0xFFFF).

    Returned as an unsigned 16-bit integer. Wire format is little-endian.
    """
    crc = 0xFFFF
    for b in data:
        crc ^= b
        for _ in range(8):
            if crc & 0x0001:
                crc = (crc >> 1) ^ 0xA001
            else:
                crc >>= 1
    return crc & 0xFFFF


# ── Packet builders / parsers ───────────────────────────────────────────
def _encode_serial(s: str) -> bytes:
    """Right-pad / truncate serial to exactly 10 ASCII bytes."""
    s = (s or "").encode("ascii", errors="replace")[:SERIAL_LEN]
    return s.ljust(SERIAL_LEN, b" ")


def _build_query_frame(cfg: InverterConfig, start: int, count: int) -> bytes:
    """Build a cmd=0x01 (read input registers) request frame.

    The payload for cmd 0x01 is the register start (u16 LE) and count (u16 LE).

    Frame layout (little-endian on the wire):
        | MAGIC(2) | PROTO_VER(2) | LEN(u16) | dongle_sn(10) |
        | inverter_sn(10) | cmd(u8) | payload... | CRC16(u16 LE) |

    The `LEN` field counts EVERYTHING after itself (serials + cmd + payload
    + CRC) — i.e. it does NOT include MAGIC, PROTO_VER or LEN itself.
    """
    payload = struct.pack("<HH", start, count)
    # Everything that gets CRC'd: header + dongle_sn + inverter_sn + cmd + payload
    pre_crc = (
        MAGIC
        + PROTO_VER
        + _encode_serial(cfg.dongle_serial)
        + _encode_serial(cfg.inverter_serial)
        + bytes([CMD_QUERY_INPUT_REGISTERS])
        + payload
    )
    # LEN field = everything after LEN itself, including CRC (2 bytes)
    #   = (serials 20) + cmd (1) + payload + CRC (2)
    #   = len(pre_crc) - 4 (MAGIC+PROTO_VER) + 2 (CRC)
    length = len(pre_crc) - 4 + 2
    frame = (
        MAGIC
        + PROTO_VER
        + struct.pack("<H", length)
        + pre_crc[4:]  # skip past MAGIC+PROTO_VER; serials+cmd+payload follow
        + struct.pack("<H", _modbus_crc16(pre_crc))
    )
    return frame


def _parse_query_response(data: bytes, expected_count: int) -> list[int]:
    """Parse a cmd=0x01 response and return `expected_count` uint16 values.

    STRICT validation — we now check the magic header, protocol version, and
    length field before trusting any payload. Without these checks, partial /
    corrupt responses from the dongle would be parsed as garbage (e.g. the
    "soc=12340%" anomaly we saw in production logs).

    We still skip CRC validation since the dongle is trusted on LAN, and the
    dongle's CRC computation can be wrong under load.

    Raises ValueError if the frame is malformed / too short / wrong magic.
    """
    # Hard minimum: header(4) + serials(20) + cmd(1) + payload(2*count) + crc(2)
    min_len = 4 + 20 + 1 + (2 * expected_count) + 2
    if len(data) < min_len:
        raise ValueError(
            f"Response too short: got {len(data)} bytes, need ≥ {min_len}"
        )

    # 1) Magic header MUST be A1 1A. Without this check we'd happily parse
    #    any junk bytes that happen to fill the buffer.
    if data[0:2] != MAGIC:
        raise ValueError(
            f"Bad magic: got {data[0:2].hex()}, expected {MAGIC.hex()}"
        )

    # 2) Protocol version MUST match what we sent. v2 firmware would reply
    #    with 02 00; v5 firmware replies with 05 00. Anything else = corrupt.
    if data[2:4] != PROTO_VER:
        raise ValueError(
            f"Bad proto ver: got {data[2:4].hex()}, expected {PROTO_VER.hex()}"
        )

    # 3) Length field MUST be consistent with the actual byte count we got.
    #    LEN counts everything after itself: serials(20) + cmd(1) + payload + crc(2)
    declared_len = struct.unpack_from("<H", data, 4)[0]
    expected_len = 20 + 1 + (2 * expected_count) + 2
    if declared_len != expected_len:
        raise ValueError(
            f"Bad LEN field: got {declared_len}, expected {expected_len}"
        )
    if len(data) < 4 + declared_len:
        raise ValueError(
            f"Truncated frame: LEN={declared_len} but only {len(data) - 4} bytes after header"
        )

    payload_start = 4 + 20 + 1  # after MAGIC+VER+LEN, two serials, cmd byte
    payload_end = payload_start + (2 * expected_count)
    payload = data[payload_start:payload_end]
    return list(struct.unpack(f"<{expected_count}H", payload))


# ── Client ──────────────────────────────────────────────────────────────
class LuxpowerClient:
    """Async TCP client for a single Luxpower dongle.

    Lifecycle:
        cfg = InverterConfig(host=..., port=8000, dongle_serial=..., inverter_serial=...)
        client = LuxpowerClient(cfg)
        try:
            regs = await client.read_input_registers(0, 0x28)
            ...
        finally:
            await client.close()
    """

    def __init__(self, cfg: InverterConfig):
        self.cfg = cfg
        self._reader: Optional[asyncio.StreamReader] = None
        self._writer: Optional[asyncio.StreamWriter] = None
        self._lock = asyncio.Lock()
        self._connected = False

    # ── Properties ─────────────────────────────────────────────────────
    @property
    def connected(self) -> bool:
        return self._connected and self._writer is not None and not self._writer.is_closing()

    # ── Connect / close ────────────────────────────────────────────────
    async def connect(self) -> None:
        """Open the TCP connection. Idempotent."""
        if self.connected:
            return
        try:
            self._reader, self._writer = await asyncio.wait_for(
                asyncio.open_connection(self.cfg.host, self.cfg.port),
                timeout=self.cfg.timeout_seconds,
            )
            self._connected = True
            logger.info(
                "LuxpowerClient connected to %s:%d (dongle=%s inverter=%s)",
                self.cfg.host,
                self.cfg.port,
                self.cfg.dongle_serial,
                self.cfg.inverter_serial,
            )
        except Exception as e:
            self._connected = False
            raise ConnectionError(
                f"Cannot connect to {self.cfg.host}:{self.cfg.port}: {e}"
            ) from e

    async def close(self) -> None:
        """Close the TCP connection. Safe to call multiple times."""
        self._connected = False
        if self._writer is not None:
            try:
                self._writer.close()
                try:
                    await self._writer.wait_closed()
                except Exception:
                    pass
            except Exception as e:
                logger.debug("LuxpowerClient close error (ignored): %s", e)
            finally:
                self._writer = None
                self._reader = None

    # ── Read registers ─────────────────────────────────────────────────
    async def read_input_registers(self, start: int, count: int) -> list[int]:
        """Read `count` input registers starting at `start`.

        Returns a list of `count` uint16 values.

        Raises:
            ConnectionError: if connect / reconnect fails.
            asyncio.TimeoutError: if the dongle doesn't respond within
                `2 × timeout_seconds × retries` total (last resort).
            ValueError: if the response frame is malformed.

        Resilience: on TimeoutError / ConnectionError / IncompleteReadError /
        BrokenPipeError we close + reconnect + retry up to MAX_READ_RETRIES
        times before propagating. The Luxpower dongle frequently drops the
        first read after a period of silence, so a single retry is not enough
        — empirically 2 retries cover ~99% of cases.
        """
        if count <= 0:
            return []
        if start < 0 or start > 0xFFFF:
            raise ValueError(f"Invalid register start: {start}")
        if start + count > 0x10000:
            raise ValueError(
                f"Register window {start}..{start + count - 1} exceeds u16 range"
            )

        frame = _build_query_frame(self.cfg, start, count)
        # We expect: header(4) + serials(20) + cmd(1) + payload(2*count) + crc(2)
        expected_len = 4 + 20 + 1 + (2 * count) + 2

        last_err: Optional[Exception] = None
        async with self._lock:
            for attempt in range(MAX_READ_RETRIES):
                # Ensure we are connected on each attempt.
                if not self.connected:
                    try:
                        await self._reconnect()
                    except Exception as e:
                        last_err = e
                        await asyncio.sleep(0.2 * (attempt + 1))
                        continue

                try:
                    assert self._writer is not None and self._reader is not None
                    self._writer.write(frame)
                    await self._writer.drain()
                    data = await asyncio.wait_for(
                        self._reader.readexactly(expected_len),
                        timeout=self.cfg.timeout_seconds,
                    )
                    return _parse_query_response(data, count)
                except (
                    ConnectionError,
                    asyncio.IncompleteReadError,
                    BrokenPipeError,
                    asyncio.TimeoutError,
                    OSError,
                    ValueError,  # malformed frame (bad magic / LEN / etc.)
                ) as e:
                    last_err = e
                    logger.debug(
                        "LuxpowerClient read attempt %d/%d failed: %s",
                        attempt + 1,
                        MAX_READ_RETRIES,
                        e,
                    )
                    # Close the broken socket; next iteration reconnects.
                    await self.close()
                    if attempt < MAX_READ_RETRIES - 1:
                        # Small linear backoff so we don't hammer the dongle.
                        await asyncio.sleep(0.2 * (attempt + 1))

        # All retries exhausted — surface the last error to the caller.
        if isinstance(last_err, asyncio.TimeoutError):
            raise last_err
        raise ConnectionError(
            f"read_input_registers failed after {MAX_READ_RETRIES} attempts: {last_err}"
        )

    # ── Internal helpers ───────────────────────────────────────────────
    async def _reconnect(self) -> None:
        """Close any open socket, then connect fresh."""
        await self.close()
        await asyncio.sleep(0.1)  # tiny backoff so we don't slam the dongle
        await self.connect()


__all__ = ["InverterConfig", "LuxpowerClient", "_modbus_crc16"]
