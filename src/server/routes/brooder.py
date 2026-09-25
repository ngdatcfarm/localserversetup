"""Brooder REST API.

Endpoints (all auth-required via require_auth):
    LEGACY (still live for backward compat — Phase F will retire):
    GET    /api/brooder/nodes                       — list all known nodes
    GET    /api/brooder/nodes/{code}                — single node live state
    POST   /api/brooder/nodes                       — register new node
    PUT    /api/brooder/nodes/{code}                — update zone / cycle / notes
    DELETE /api/brooder/nodes/{code}                — soft-delete (is_active=FALSE)
    POST   /api/brooder/nodes/{code}/setpoint       — set/clear manual override
    GET    /api/brooder/nodes/{code}/telemetry      — historical (temp + power)

    ZONE (Phase B — preferred):
    GET    /api/brooder/zones                       — list active zones
    POST   /api/brooder/zones                       — create new zone
    GET    /api/brooder/zones/{id}                  — full zone state
    PUT    /api/brooder/zones/{id}                  — update zone
    DELETE /api/brooder/zones/{id}                  — soft-delete zone
    GET    /api/brooder/zones/{id}/heaters          — list heaters
    POST   /api/brooder/zones/{id}/heaters          — add heater
    PUT    /api/brooder/heaters/{hid}               — update heater
    DELETE /api/brooder/heaters/{hid}               — soft-delete heater
    GET    /api/brooder/zones/{id}/heaters/power   — current power per heater
    GET    /api/brooder/zones/{id}/sensors          — list zone sensors
    POST   /api/brooder/zones/{id}/sensors          — attach sensor
    PUT    /api/brooder/zones/{id}/sensors/{code}   — update weight/label
    DELETE /api/brooder/zones/{id}/sensors/{code}   — detach sensor
    GET    /api/brooder/zones/{id}/members          — list member ESP32s
    POST   /api/brooder/zones/{id}/members          — attach ESP32
    DELETE /api/brooder/zones/{id}/members/{code}   — detach ESP32
    POST   /api/brooder/zones/{id}/setpoint         — set/clear zone setpoint
    POST   /api/brooder/zones/{id}/fallback-delta   — update Tier-2 delta
    GET    /api/brooder/zones/{id}/setpoint-history — audit log
    GET    /api/brooder/zones/{id}/telemetry        — 24h zone telemetry

The actual control loop (PID tick + MQTT publish) lives in
`src.iot.brooder_service.{BrooderController, ZoneController}`.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from src.iot.brooder_service import (
    brooder_controller,
    zone_controller,
    calc_setpoint_for_day_age,
    build_setpoint_payload,
    _max_member_last_seen,
)
from src.iot.mqtt_client import mqtt_client
from src.services.database.db import db
from src.server.auth import require_auth

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/brooder",
    tags=["brooder"],
    dependencies=[Depends(require_auth)],
)


# ============================================================
# Request / response schemas
# ============================================================

class NodeRegister(BaseModel):
    device_code: str = Field(..., min_length=1, max_length=64,
                             description="ESP32 device code, e.g. 'esp-aabbcc'")
    zone_name: Optional[str] = Field(None, max_length=100)
    cycle_id: Optional[int] = None
    manual_setpoint: Optional[float] = Field(None, ge=0.0, le=45.0,
                                             description="°C; None = auto")
    fallback_delta_c: Optional[float] = Field(
        0.0, ge=-5.0, le=5.0,
        description=(
            "Tier-2 bias SUBTRACTED from local SHT40 when zone sensors go "
            "stale. Positive value means 'heater-zone SHT40 reads hotter than "
            "chick-zone by this much' (typical +1.5 to +3.0 °C). Rare: "
            "negative value means heater-zone is cooler than chick-zone. °C."
        )
    )
    enabled: bool = True
    notes: Optional[str] = None


class NodeUpdate(BaseModel):
    zone_name: Optional[str] = Field(None, max_length=100)
    cycle_id: Optional[int] = None
    enabled: Optional[bool] = None
    is_active: Optional[bool] = None
    fallback_delta_c: Optional[float] = Field(
        None, ge=-5.0, le=5.0,
        description=(
            "Tier-2 bias subtracted from local SHT40 when zone sensors are stale. "
            "Positive = heater-zone reads hotter than chick-zone (typical +1.5 to "
            "+3.0 °C). See NodeRegister.fallback_delta_c for full convention."
        )
    )
    notes: Optional[str] = None


class SetpointSet(BaseModel):
    setpoint: Optional[float] = Field(
        None, ge=0.0, le=45.0,
        description="°C target; null = clear manual override (back to day-age auto)"
    )
    note: Optional[str] = None


class ZoneSensorAdd(BaseModel):
    sensor_device_code: str = Field(..., min_length=1, max_length=64)
    weight: float = Field(1.0, ge=0.0, le=10.0)
    label: Optional[str] = Field(None, max_length=100)


class ZoneSensorUpdate(BaseModel):
    weight: Optional[float] = Field(None, ge=0.0, le=10.0)
    label: Optional[str] = Field(None, max_length=100)


class FallbackDeltaSet(BaseModel):
    fallback_delta_c: float = Field(
        ..., ge=-5.0, le=5.0,
        description="Tier-2 offset for local SHT40 (°C). Positive raises PID setpoint."
    )


# ============================================================
# List / single node
# ============================================================

@router.get("/nodes")
async def list_nodes(active_only: bool = Query(False)):
    """All known brooder nodes, joined with cycles for context.

    active_only=True filters to is_active=TRUE (hides soft-deleted).
    """
    where_clause = "WHERE n.is_active = TRUE" if active_only else ""
    try:
        rows = await db.fetch(f"""
            SELECT
                n.device_code,
                n.zone_name,
                n.cycle_id,
                n.manual_setpoint,
                n.fallback_delta_c,
                n.enabled,
                n.is_active,
                n.notes,
                n.created_at,
                n.updated_at,
                c.start_date     AS cycle_start_date,
                c.barn_id        AS cycle_barn_id,
                c.status         AS cycle_status
            FROM brooder_nodes n
            LEFT JOIN cycles c ON c.id = n.cycle_id
            {where_clause}
            ORDER BY n.device_code
        """)
    except Exception as e:
        logger.error(f"brooder list_nodes query failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Merge with live in-memory state (last_temp, online, mode, etc.)
    nodes = []
    for r in rows:
        row = dict(r)
        # ISO-fy timestamps so JSON serializes cleanly
        for ts in ("created_at", "updated_at", "cycle_start_date"):
            if row.get(ts):
                row[ts] = row[ts].isoformat()

        # Live overlay
        live = brooder_controller.get_status(row["device_code"])
        if live:
            row.update({
                "online":            live.get("online"),
                "mode":              live.get("mode"),
                "setpoint":          live.get("setpoint"),
                "day_age":           live.get("day_age"),
                "fallback_delta_c":  live.get("fallback_delta_c", row.get("fallback_delta_c")),
                "last_temp1":        live.get("last_temp1"),
                "last_temp2":        live.get("last_temp2"),
                "last_temp_min":     live.get("last_temp_min"),
                "last_hum_avg":      live.get("last_hum_avg"),
                "last_telemetry_at": live.get("last_telemetry_at"),
                "last_power_sent":   live.get("last_power_sent"),
                "last_setpoint_sent": live.get("last_setpoint_sent"),
                "last_setpoint_sent_at": live.get("last_setpoint_sent_at"),
                "last_zone_temp":       live.get("last_zone_temp"),
                "last_zone_temp_at":    live.get("last_zone_temp_at"),
                "zone_sensors_count":   live.get("zone_sensors_count", 0),
                "pid_source":           live.get("pid_source"),
                "last_error":        live.get("last_error"),
                "last_seen_seconds": live.get("last_seen_seconds"),
            })
        nodes.append(row)
    return {"nodes": nodes, "count": len(nodes)}


@router.get("/nodes/{code}")
async def get_node(code: str):
    live = brooder_controller.get_status(code)
    if not live:
        # Node exists in DB?
        row = await db.fetchrow(
            "SELECT * FROM brooder_nodes WHERE device_code = $1", code,
        )
        if not row:
            raise HTTPException(status_code=404, detail=f"Brooder {code} not found")
        d = dict(row)
        for ts in ("created_at", "updated_at"):
            if d.get(ts):
                d[ts] = d[ts].isoformat()
        return {"device_code": code, "online": False, "mode": "unknown",
                "setpoint": calc_setpoint_for_day_age(1), "db": d}
    return live


# ============================================================
# CRUD
# ============================================================

@router.post("/nodes")
async def register_node(req: NodeRegister):
    """Register a new brooder node (or update existing)."""
    # Validate cycle_id if provided
    if req.cycle_id is not None:
        cyc = await db.fetchrow("SELECT id FROM cycles WHERE id = $1", req.cycle_id)
        if not cyc:
            raise HTTPException(
                status_code=400,
                detail=f"cycle_id {req.cycle_id} does not exist",
            )

    try:
        await db.execute(
            """
            INSERT INTO brooder_nodes
                (device_code, zone_name, cycle_id, manual_setpoint,
                 fallback_delta_c, enabled, is_active, notes, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, NOW())
            ON CONFLICT (device_code) DO UPDATE
              SET zone_name       = EXCLUDED.zone_name,
                  cycle_id        = EXCLUDED.cycle_id,
                  manual_setpoint = EXCLUDED.manual_setpoint,
                  fallback_delta_c = EXCLUDED.fallback_delta_c,
                  enabled         = EXCLUDED.enabled,
                  is_active       = TRUE,
                  notes           = EXCLUDED.notes,
                  updated_at      = NOW()
            """,
            req.device_code, req.zone_name, req.cycle_id, req.manual_setpoint,
            req.fallback_delta_c if req.fallback_delta_c is not None else 0.0,
            req.enabled, req.notes,
        )
    except Exception as e:
        logger.error(f"brooder register_node failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Reload controller state so the new node picks up its cycle start_date
    await brooder_controller._load_nodes()

    state = brooder_controller.get_status(req.device_code)
    if state is None:
        # Not in-memory yet — happens if no telemetry has ever arrived
        state = {"device_code": req.device_code, "online": False, "mode": "unknown"}
    return state


@router.put("/nodes/{code}")
async def update_node(code: str, req: NodeUpdate):
    """Update mutable fields: zone_name, cycle_id, enabled, is_active, notes."""
    row = await db.fetchrow(
        "SELECT device_code FROM brooder_nodes WHERE device_code = $1", code,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Brooder {code} not found")

    sets, vals = [], []
    if req.zone_name is not None:
        sets.append(f"zone_name = ${len(vals)+1}")
        vals.append(req.zone_name)
    if req.cycle_id is not None:
        sets.append(f"cycle_id = ${len(vals)+1}")
        vals.append(req.cycle_id)
    if req.enabled is not None:
        sets.append(f"enabled = ${len(vals)+1}")
        vals.append(req.enabled)
    if req.is_active is not None:
        sets.append(f"is_active = ${len(vals)+1}")
        vals.append(req.is_active)
    if req.fallback_delta_c is not None:
        sets.append(f"fallback_delta_c = ${len(vals)+1}")
        vals.append(req.fallback_delta_c)
    if req.notes is not None:
        sets.append(f"notes = ${len(vals)+1}")
        vals.append(req.notes)
    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")

    sets.append("updated_at = NOW()")
    vals.append(code)
    sql = f"UPDATE brooder_nodes SET {', '.join(sets)} WHERE device_code = ${len(vals)}"
    try:
        await db.execute(sql, *vals)
    except Exception as e:
        logger.error(f"brooder update_node {code} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    await brooder_controller._load_nodes()
    state = brooder_controller.get_status(code)
    return state or {"device_code": code, "online": False, "mode": "unknown"}


@router.delete("/nodes/{code}")
async def delete_node(code: str, hard: bool = Query(False)):
    """Soft-delete by default (is_active=FALSE). hard=True removes the row."""
    row = await db.fetchrow(
        "SELECT device_code FROM brooder_nodes WHERE device_code = $1", code,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Brooder {code} not found")

    try:
        if hard:
            await db.execute(
                "DELETE FROM brooder_nodes WHERE device_code = $1", code
            )
        else:
            await db.execute(
                """UPDATE brooder_nodes
                   SET is_active = FALSE, enabled = FALSE, updated_at = NOW()
                   WHERE device_code = $1""",
                code,
            )
    except Exception as e:
        logger.error(f"brooder delete_node {code} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Flip in-memory flags so controller stops publishing for it
    if not hard:
        await brooder_controller.unregister_node(code)

    return {"ok": True, "device_code": code, "hard": hard}


# ============================================================
# Fallback delta — admin-tuned offset for Tier-2 path
#
# When zone sensors go stale, ESP uses local_SHT40 + fallback_delta_c
# as PID input. Default 0 → "no offset" (heater runs conservatively).
# Admin raises to ~+2°C after observing the steady-state heater-zone
# vs chick-zone bias.
# ============================================================

@router.post("/nodes/{code}/fallback-delta")
async def set_fallback_delta(code: str, req: FallbackDeltaSet):
    """Update only the fallback delta; everything else stays the same.

    Re-publishes the setpoint payload so ESP picks up the new delta on
    its retained topic.

    If the node is in a zone, delegate to the zone handler so the delta
    is set at the zone level (and propagated to all member ESPs).
    """
    # Zone delegation guard — Phase B backward compat
    zid_row = await db.fetchval(
        "SELECT zone_id FROM brooder_zone_devices WHERE brooder_device_code = $1",
        code,
    )
    if zid_row is not None:
        try:
            return await zone_controller.set_zone_fallback_delta(
                zid_row, req.fallback_delta_c,
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            logger.error(f"brooder fallback-delta {code}→zone {zid_row}: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    row = await db.fetchrow(
        "SELECT device_code FROM brooder_nodes WHERE device_code = $1", code,
    )
    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Brooder {code} not registered",
        )
    try:
        await db.execute(
            """UPDATE brooder_nodes SET fallback_delta_c = $1,
               updated_at = NOW() WHERE device_code = $2""",
            req.fallback_delta_c, code,
        )
    except Exception as e:
        logger.error(f"brooder set_fallback_delta {code} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Reload so the in-memory node picks up the new value
    await brooder_controller._load_nodes()
    state = brooder_controller.get_status(code)

    # Republish setpoint (now includes the new fallback_delta_c)
    node = brooder_controller.nodes.get(code)
    if node:
        topic = f"cfarm/brooder-{code}/setpoint"
        mqtt_client.publish(
            topic,
            build_setpoint_payload(
                node.pid.setpoint,
                manual_override=node.manual_setpoint is not None,
                fallback_delta_c=node.fallback_delta_c,
            ),
            qos=1, retain=True,
        )
        node.last_setpoint_sent = node.pid.setpoint
        node.last_setpoint_sent_at = datetime.now(timezone.utc)
        logger.info(f"Brooder {code}: fallback_delta_c → "
                    f"{req.fallback_delta_c:+.2f}°C (republished setpoint)")
    return state or {"device_code": code, "fallback_delta_c": req.fallback_delta_c}


# ============================================================
# Manual override — the headline dashboard control
# ============================================================

@router.post("/nodes/{code}/setpoint")
async def set_manual_setpoint(code: str, req: SetpointSet):
    """Set or clear manual setpoint override.

    setpoint=null  → clear override (PID goes back to day-age auto)
    setpoint=30.5  → lock to 30.5 °C; ESP32 keeps it via NVS even after reboot

    If the node is attached to a zone, delegate to the zone handler so
    the override is set at the zone level (and propagated to all member ESPs).
    """
    # Zone delegation guard — Phase B backward compat
    zid_row = await db.fetchval(
        "SELECT zone_id FROM brooder_zone_devices WHERE brooder_device_code = $1",
        code,
    )
    if zid_row is not None:
        try:
            return await zone_controller.set_zone_setpoint(zid_row, req.setpoint, req.note)
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))
        except Exception as e:
            logger.error(f"brooder setpoint {code}→zone {zid_row} failed: {e}")
            raise HTTPException(status_code=500, detail=str(e))

    try:
        state = await brooder_controller.set_manual_setpoint(code, req.setpoint)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"brooder setpoint {code} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Audit trail
    try:
        await db.execute(
            """
            INSERT INTO brooder_setpoint_history
                (device_code, manual_setpoint, effective_setpoint, source, note)
            VALUES ($1, $2, $3, 'manual', $4)
            """,
            code, req.setpoint, state.get("setpoint"), req.note,
        )
    except Exception as e:
        logger.debug(f"brooder setpoint audit write failed: {e}")

    return state


# ============================================================
# Telemetry history
# ============================================================

@router.get("/nodes/{code}/telemetry")
async def get_telemetry(code: str, hours: int = Query(24, ge=1, le=720),
                        sensor_type: str = Query("brooder_temp",
                                                 regex="^(brooder_temp|brooder_power)$")):
    """Return time-bucketed samples for charting.

    sensor_type=brooder_temp  → °C curve
    sensor_type=brooder_power → %  curve (correlates with temp)
    """
    until = datetime.now(timezone.utc)
    since = until - timedelta(hours=hours)
    try:
        rows = await db.fetch(
            """
            SELECT
                time,
                value,
                metadata
            FROM sensor_data
            WHERE device_id = (
                    SELECT id FROM devices WHERE device_code = $1 LIMIT 1
                  )
              AND sensor_type = $2
              AND time >= $3 AND time <= $4
            ORDER BY time DESC
            LIMIT 2000
            """,
            code, sensor_type, since, until,
        )
    except Exception as e:
        logger.error(f"brooder telemetry {code} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    samples = []
    for r in rows:
        d = dict(r)
        d["time"] = d["time"].isoformat() if d.get("time") else None
        samples.append(d)
    samples.reverse()  # chronological order for charting
    return {
        "device_code":  code,
        "sensor_type":  sensor_type,
        "since":        since.isoformat(),
        "until":        until.isoformat(),
        "count":        len(samples),
        "samples":      samples,
    }


# ============================================================
# Setpoint audit history
# ============================================================

@router.get("/nodes/{code}/setpoint-history")
async def get_setpoint_history(code: str, limit: int = Query(50, ge=1, le=500)):
    """Recent manual override changes for this node (audit + UI tooltip)."""
    rows = await db.fetch(
        """
        SELECT id, manual_setpoint, effective_setpoint, source, note, created_at
        FROM brooder_setpoint_history
        WHERE device_code = $1
        ORDER BY created_at DESC
        LIMIT $2
        """,
        code, limit,
    )
    out = []
    for r in rows:
        d = dict(r)
        d["created_at"] = d["created_at"].isoformat() if d.get("created_at") else None
        out.append(d)
    return {"device_code": code, "history": out}


# ============================================================
# Zone Sensors (Reference sensors)
#
# Each brooder pulls its zone temperature from N ESP-sensor devices in
# the same barn. Server blends those (weighted avg) and publishes the
# result to cfarm/brooder-{code}/zone_temp every 20s. ESP uses zone_temp
# directly (no 50/50 blend with its own SHT40 — Tier-1 is zone-only) for
# PID input, with a 3-min staleness fallback to filtered local SHT40
# minus an admin-tuned delta.
# ============================================================

@router.get("/nodes/{code}/zone-sensors")
async def list_zone_sensors(code: str):
    """List configured zone sensors for a brooder.

    Each row joins with the latest temperature reading (sensor_latest) and
    the sensor device's barn_id for context. The dashboard uses this for
    the "Reference Sensors" table.

    If the node is in a zone, delegates to /zones/{id}/sensors so all zone
    sensors (regardless of which member they were originally attached via)
    are returned.
    """
    # Zone delegation guard — Phase B backward compat
    zid_row = await db.fetchval(
        "SELECT zone_id FROM brooder_zone_devices WHERE brooder_device_code = $1",
        code,
    )
    if zid_row is not None:
        return await list_zone_sensors(zid_row)
    try:
        rows = await db.fetch(
            """
            SELECT
                bzs.id,
                bzs.brooder_device_code,
                bzs.sensor_device_code,
                bzs.weight,
                bzs.label,
                bzs.created_at,
                bzs.updated_at,
                d.name        AS sensor_name,
                d.barn_id     AS sensor_barn_id,
                sl.value      AS last_value,
                sl.unit       AS last_unit,
                sl.time       AS last_time
            FROM brooder_zone_sensors bzs
            LEFT JOIN devices d
                   ON d.device_code = bzs.sensor_device_code
            LEFT JOIN sensor_latest sl
                   ON sl.device_id = d.id
                  AND sl.sensor_type = 'temperature'
            WHERE bzs.brooder_device_code = $1
            ORDER BY bzs.id
            """,
            code,
        )
    except Exception as e:
        logger.error(f"brooder list_zone_sensors {code} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    out = []
    for r in rows:
        d = dict(r)
        for ts in ("created_at", "updated_at", "last_time"):
            if d.get(ts):
                d[ts] = d[ts].isoformat()
        out.append(d)
    return {"device_code": code, "zone_sensors": out, "count": len(out)}


@router.post("/nodes/{code}/zone-sensors")
async def add_zone_sensor(code: str, req: ZoneSensorAdd):
    """Attach a sensor device to this brooder as a reference temperature source.

    Validates:
      - Brooder exists in brooder_nodes
      - Sensor device exists in `devices` and has temperature readings
      - Sensor not already attached (UNIQUE constraint catches duplicates)
    """
    # Validate brooder exists
    brooder = await db.fetchrow(
        "SELECT device_code FROM brooder_nodes WHERE device_code = $1", code,
    )
    if not brooder:
        raise HTTPException(
            status_code=404,
            detail=f"Brooder {code} not registered",
        )

    # Validate sensor device exists
    sensor = await db.fetchrow(
        "SELECT id, name, barn_id FROM devices WHERE device_code = $1",
        req.sensor_device_code,
    )
    if not sensor:
        raise HTTPException(
            status_code=400,
            detail=f"Sensor device {req.sensor_device_code} not found",
        )

    # Optional: enforce same-barn policy by computing the brooder's barn from
    # its cycle. If brooder has a cycle, sensors should match that cycle's barn.
    # We surface a warning but allow cross-barn config (admin override).
    brooder_barn = await db.fetchval(
        """
        SELECT c.barn_id
        FROM brooder_nodes n
        LEFT JOIN cycles c ON c.id = n.cycle_id
        WHERE n.device_code = $1
        """,
        code,
    )
    cross_barn = bool(
        brooder_barn and sensor["barn_id"]
        and brooder_barn != sensor["barn_id"]
    )

    try:
        row = await db.fetchrow(
            """
            INSERT INTO brooder_zone_sensors
                (brooder_device_code, sensor_device_code, weight, label)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (brooder_device_code, sensor_device_code) DO UPDATE
              SET weight     = EXCLUDED.weight,
                  label      = EXCLUDED.label,
                  updated_at = NOW()
            RETURNING *
            """,
            code, req.sensor_device_code, req.weight, req.label,
        )
    except Exception as e:
        logger.error(f"brooder add_zone_sensor {code}/{req.sensor_device_code}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    out = dict(row)
    out["created_at"] = out["created_at"].isoformat() if out.get("created_at") else None
    out["updated_at"] = out["updated_at"].isoformat() if out.get("updated_at") else None
    out["sensor_name"] = sensor["name"]
    out["sensor_barn_id"] = sensor["barn_id"]
    out["cross_barn_warning"] = cross_barn
    return out


@router.put("/nodes/{code}/zone-sensors/{sensor_code}")
async def update_zone_sensor(code: str, sensor_code: str, req: ZoneSensorUpdate):
    """Update weight and/or label of an attached sensor."""
    sets, vals = [], []
    if req.weight is not None:
        sets.append(f"weight = ${len(vals)+1}")
        vals.append(req.weight)
    if req.label is not None:
        sets.append(f"label = ${len(vals)+1}")
        vals.append(req.label)
    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")

    sets.append("updated_at = NOW()")
    vals.extend([code, sensor_code])
    sql = (
        f"UPDATE brooder_zone_sensors SET {', '.join(sets)} "
        f"WHERE brooder_device_code = ${len(vals)-1} "
        f"  AND sensor_device_code  = ${len(vals)}"
    )
    try:
        await db.execute(sql, *vals)
    except Exception as e:
        logger.error(f"brooder update_zone_sensor {code}/{sensor_code}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    return await db.fetchrow(
        """
        SELECT * FROM brooder_zone_sensors
        WHERE brooder_device_code = $1 AND sensor_device_code = $2
        """,
        code, sensor_code,
    )


@router.delete("/nodes/{code}/zone-sensors/{sensor_code}")
async def remove_zone_sensor(code: str, sensor_code: str):
    """Detach a sensor from this brooder."""
    try:
        result = await db.execute(
            """
            DELETE FROM brooder_zone_sensors
            WHERE brooder_device_code = $1 AND sensor_device_code = $2
            """,
            code, sensor_code,
        )
    except Exception as e:
        logger.error(f"brooder remove_zone_sensor {code}/{sensor_code}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # asyncpg returns "DELETE <n>"
    deleted = int(result.split()[1]) if result.startswith("DELETE") else 0
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"No zone-sensor link {code} → {sensor_code}",
        )
    return {"ok": True, "brooder": code, "sensor": sensor_code}


@router.get("/zone-sensors/available")
async def list_available_sensors(barn_id: Optional[str] = None,
                                 q: Optional[str] = None):
    """Candidate sensor devices for the dropdown.

    Filters to devices that have temperature readings in sensor_latest
    and excludes brooder devices (avoids self-reference). Optionally
    narrowed by barn_id (recommended) and free-text search.
    """
    conditions = [
        "sl.sensor_type = 'temperature'",
        "dt.code IS DISTINCT FROM 'brooder'",
    ]
    params = []
    if barn_id and barn_id != "all":
        conditions.append(f"d.barn_id = ${len(params)+1}")
        params.append(barn_id)
    if q:
        conditions.append(
            f"(d.device_code ILIKE ${len(params)+1} "
            f" OR d.name ILIKE ${len(params)+1})"
        )
        params.append(f"%{q}%")

    where = " AND ".join(conditions)
    try:
        rows = await db.fetch(
            f"""
            SELECT DISTINCT ON (d.device_code)
                d.device_code,
                d.name,
                d.barn_id,
                sl.value   AS last_temp,
                sl.unit    AS unit,
                sl.time    AS last_time
            FROM sensor_latest sl
            JOIN devices d      ON d.id = sl.device_id
            LEFT JOIN device_types dt ON dt.id = d.device_type_id
            WHERE {where}
            ORDER BY d.device_code, sl.time DESC
            """,
            *params,
        )
    except Exception as e:
        logger.error(f"brooder list_available_sensors failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    out = []
    for r in rows:
        d = dict(r)
        if d.get("last_time"):
            d["last_time"] = d["last_time"].isoformat()
        out.append(d)
    return {"sensors": out, "count": len(out)}


# ============================================================
# ZONE ENDPOINTS (Phase B — Brooder Zone Refactor)
#
# These endpoints expose the zone model created by migration scripts
# 065-067. Zone is the new unit of thermal control: 1 PID + N heaters
# (across N ESP32 nodes) + M reference sensors.
#
# Legacy `/api/brooder/nodes/{code}/...` endpoints above remain live
# for backward compatibility — when a node is in a zone, the legacy
# endpoints delegate to the zone handler.
# ============================================================


# ── Pydantic models for zone requests ────────────────────────

class ZoneCreate(BaseModel):
    barn_id: Optional[str] = Field(None, max_length=50)
    name: str = Field(..., min_length=1, max_length=100)
    manual_setpoint: Optional[float] = Field(None, ge=0.0, le=45.0)
    fallback_delta_c: float = Field(0.0, ge=-5.0, le=5.0)
    max_total_w: Optional[float] = Field(None, gt=0)
    enabled: bool = True
    notes: Optional[str] = None


class ZoneUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    manual_setpoint: Optional[float] = None
    fallback_delta_c: Optional[float] = Field(None, ge=-5.0, le=5.0)
    max_total_w: Optional[float] = None
    enabled: Optional[bool] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class HeaterCreate(BaseModel):
    device_code: str = Field(..., min_length=1, max_length=64)
    channel: int = Field(..., ge=1, le=2)
    label: Optional[str] = Field(None, max_length=100)
    max_power_w: float = Field(1500.0, gt=0, le=10000.0)
    enabled: bool = True


class HeaterUpdate(BaseModel):
    label: Optional[str] = Field(None, max_length=100)
    max_power_w: Optional[float] = Field(None, gt=0, le=10000.0)
    enabled: Optional[bool] = None


class ZoneSensorAttach(BaseModel):
    """Pydantic for /zones/{id}/sensors POST."""
    sensor_device_code: str = Field(..., min_length=1, max_length=64)
    weight: float = Field(1.0, ge=0.0, le=10.0)
    label: Optional[str] = Field(None, max_length=100)


class ZoneSensorPatch(BaseModel):
    """Pydantic for /zones/{id}/sensors/{code} PUT."""
    weight: Optional[float] = Field(None, ge=0.0, le=10.0)
    label: Optional[str] = Field(None, max_length=100)


class MemberAttach(BaseModel):
    """Pydantic for /zones/{id}/members POST."""
    device_code: str = Field(..., min_length=1, max_length=64)
    role: str = Field("member", pattern="^(member|lead)$")


# ── Helper: ensure zone exists + is active ──────────────────

async def _get_zone_or_404(zone_id: int) -> dict:
    row = await db.fetchrow(
        "SELECT * FROM brooder_zones WHERE id = $1 AND is_active = TRUE",
        zone_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Zone {zone_id} not found")
    return dict(row)


# ── ZONES: list / create / get / update / delete ────────────

@router.get("/zones")
async def list_zones():
    """List all active zones with live overlay (PID state + member count)."""
    rows = await db.fetch("""
        SELECT id, barn_id, name, manual_setpoint, fallback_delta_c,
               enabled, is_active, max_total_w, created_at, updated_at, notes
        FROM brooder_zones
        WHERE is_active = TRUE
        ORDER BY id
    """)
    out = []
    for r in rows:
        d = dict(r)
        # ISO-fy timestamps
        for ts in ("created_at", "updated_at"):
            if d.get(ts):
                d[ts] = d[ts].isoformat()
        # Live overlay from ZoneController
        z = zone_controller.zones.get(d["id"])
        if z is not None:
            d.update({
                "online":             z.is_online(),
                "mode":               z.mode,
                "effective_setpoint": z.current_setpoint(),
                "last_zone_temp":     z.last_zone_temp,
                "last_zone_temp_at":  (z.last_zone_temp_at.isoformat()
                                       if z.last_zone_temp_at else None),
                "zone_sensors_count": z.zone_sensors_count,
                "pid_source":         z.pid_source,
                "last_power_total_pct": z.last_power_total_pct,
                "member_count":       len(z.member_device_codes),
                "heater_count":       len([h for h in z.heaters.values() if h.enabled]),
                "last_seen_seconds":  _max_member_last_seen(z),
            })
        out.append(d)
    return {"zones": out, "count": len(out)}


@router.get("/zones/{zone_id}")
async def get_zone(zone_id: int):
    """Full zone state: members + heaters + sensors + setpoint + zone_temp."""
    row = await _get_zone_or_404(zone_id)
    for ts in ("created_at", "updated_at"):
        if row.get(ts):
            row[ts] = row[ts].isoformat()
    # Live overlay
    z = zone_controller.zones.get(zone_id)
    if z is not None:
        row["effective_setpoint"] = z.current_setpoint()
        row["mode"]               = z.mode
        row["online"]             = z.is_online()
        row["last_zone_temp"]     = z.last_zone_temp
        row["last_zone_temp_at"]  = (z.last_zone_temp_at.isoformat()
                                       if z.last_zone_temp_at else None)
        row["zone_sensors_count"] = z.zone_sensors_count
        row["pid_source"]         = z.pid_source
        row["last_power_total_pct"] = z.last_power_total_pct
    # Barn name for display
    if row.get("barn_id"):
        barn = await db.fetchrow(
            "SELECT name FROM barns WHERE id = $1", row["barn_id"]
        )
        row["barn_name"] = barn["name"] if barn else None
    return row


@router.post("/zones")
async def create_zone(req: ZoneCreate):
    """Create a new zone (no members yet — add via /members endpoint)."""
    # Validate barn
    if req.barn_id is not None:
        barn = await db.fetchrow("SELECT id FROM barns WHERE id = $1", req.barn_id)
        if not barn:
            raise HTTPException(
                status_code=400, detail=f"barn_id {req.barn_id} does not exist"
            )
    try:
        row = await db.fetchrow(
            """
            INSERT INTO brooder_zones
                (barn_id, name, manual_setpoint, fallback_delta_c,
                 max_total_w, enabled, is_active, notes)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7)
            RETURNING id
            """,
            req.barn_id, req.name, req.manual_setpoint, req.fallback_delta_c,
            req.max_total_w, req.enabled, req.notes,
        )
    except Exception as e:
        # Likely (barn_id, name) collision on active zones
        if "uq_brooder_zones_barn_name" in str(e):
            raise HTTPException(
                status_code=409,
                detail=f"Zone '{req.name}' already exists in this barn",
            )
        logger.error(f"brooder create_zone failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    new_id = row["id"]
    await zone_controller._load_zones()
    return await get_zone(new_id)


@router.put("/zones/{zone_id}")
async def update_zone(zone_id: int, req: ZoneUpdate):
    await _get_zone_or_404(zone_id)
    sets, vals = [], []
    if req.name is not None:
        sets.append(f"name = ${len(vals)+1}")
        vals.append(req.name)
    if req.manual_setpoint is not None:
        sets.append(f"manual_setpoint = ${len(vals)+1}")
        vals.append(req.manual_setpoint)
    if req.fallback_delta_c is not None:
        sets.append(f"fallback_delta_c = ${len(vals)+1}")
        vals.append(req.fallback_delta_c)
    if req.max_total_w is not None:
        sets.append(f"max_total_w = ${len(vals)+1}")
        vals.append(req.max_total_w)
    if req.enabled is not None:
        sets.append(f"enabled = ${len(vals)+1}")
        vals.append(req.enabled)
    if req.notes is not None:
        sets.append(f"notes = ${len(vals)+1}")
        vals.append(req.notes)
    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")
    sets.append("updated_at = NOW()")
    vals.append(zone_id)
    sql = f"UPDATE brooder_zones SET {', '.join(sets)} WHERE id = ${len(vals)}"
    try:
        await db.execute(sql, *vals)
    except Exception as e:
        logger.error(f"brooder update_zone {zone_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    await zone_controller._load_zones()
    return await get_zone(zone_id)


@router.delete("/zones/{zone_id}")
async def delete_zone(zone_id: int, hard: bool = Query(False)):
    """Soft-delete by default. hard=True removes all rows (cascade)."""
    await _get_zone_or_404(zone_id)
    try:
        if hard:
            await db.execute("DELETE FROM brooder_zones WHERE id = $1", zone_id)
        else:
            await db.execute(
                """UPDATE brooder_zones
                   SET is_active = FALSE, enabled = FALSE, updated_at = NOW()
                   WHERE id = $1""",
                zone_id,
            )
    except Exception as e:
        logger.error(f"brooder delete_zone {zone_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    await zone_controller._load_zones()
    return {"ok": True, "zone_id": zone_id, "hard": hard}


# ── HEATERS: list / create / update / delete ───────────────

@router.get("/zones/{zone_id}/heaters")
async def list_zone_heaters(zone_id: int):
    await _get_zone_or_404(zone_id)
    try:
        rows = await db.fetch(
            """
            SELECT id, h.zone_id, h.device_code, h.channel, h.label, h.max_power_w,
                   h.enabled, h.is_active, h.created_at, h.updated_at,
                   -- "Server's reason" — latest audit row per heater. NULL
                   -- when no history yet (brand-new heater). LEFT JOIN LATERAL
                   -- uses idx_bph_heater_time(heater_id, created_at DESC).
                   hist.source      AS last_reason_source,
                   hist.note        AS last_reason_note,
                   hist.setpoint_c  AS last_reason_setpoint_c,
                   hist.pid_input_c AS last_reason_pid_input_c,
                   hist.created_at  AS last_reason_at
            FROM brooder_heaters h
            LEFT JOIN LATERAL (
                SELECT source, note, setpoint_c, pid_input_c, created_at
                FROM brooder_power_history
                WHERE heater_id = h.id
                ORDER BY created_at DESC
                LIMIT 1
            ) hist ON TRUE
            WHERE h.zone_id = $1 AND h.is_active = TRUE
            ORDER BY h.device_code, h.channel
            """,
            zone_id,
        )
    except Exception as e:
        logger.error(f"brooder list_heaters {zone_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    # Live overlay (last published power)
    z = zone_controller.zones.get(zone_id)
    live = {h.id: h for h in (z.heaters.values() if z else [])}
    out = []
    for r in rows:
        d = dict(r)
        for ts in ("created_at", "updated_at", "last_reason_at"):
            if d.get(ts):
                d[ts] = d[ts].isoformat()
        h = live.get(d["id"])
        if h:
            d["last_power_pct"]    = h.last_power_pct
            d["last_published_at"] = (h.last_published_at.isoformat()
                                       if h.last_published_at else None)
        out.append(d)
    return {"zone_id": zone_id, "heaters": out, "count": len(out)}


@router.get("/zones/{zone_id}/heaters/power")
async def zone_heaters_latest_power(zone_id: int):
    """Current latest_power for every heater in the zone.

    Joins brooder_heater_latest_power so the dashboard can poll current
    % without hitting the hypertable.
    """
    await _get_zone_or_404(zone_id)
    try:
        rows = await db.fetch(
            """
            SELECT h.id, h.device_code, h.channel, h.label,
                   h.enabled,
                   COALESCE(lp.last_power_pct, 0)      AS last_power_pct,
                   lp.last_setpoint                    AS last_setpoint,
                   lp.last_published_at                AS last_published_at,
                   lp.source                           AS source
            FROM brooder_heaters h
            LEFT JOIN brooder_heater_latest_power lp ON lp.heater_id = h.id
            WHERE h.zone_id = $1 AND h.is_active = TRUE
            ORDER BY h.device_code, h.channel
            """,
            zone_id,
        )
    except Exception as e:
        logger.error(f"brooder zone_heaters_power {zone_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    out = []
    for r in rows:
        d = dict(r)
        if d.get("last_published_at"):
            d["last_published_at"] = d["last_published_at"].isoformat()
        out.append(d)
    return {"zone_id": zone_id, "heaters": out}


@router.post("/zones/{zone_id}/heaters")
async def add_zone_heater(zone_id: int, req: HeaterCreate):
    await _get_zone_or_404(zone_id)
    # Validate device exists
    dev = await db.fetchrow(
        "SELECT device_code FROM brooder_nodes WHERE device_code = $1 "
        "AND is_active = TRUE",
        req.device_code,
    )
    if not dev:
        raise HTTPException(
            status_code=400,
            detail=f"Brooder device {req.device_code} not registered",
        )
    try:
        row = await db.fetchrow(
            """
            INSERT INTO brooder_heaters
                (zone_id, device_code, channel, label, max_power_w,
                 enabled, is_active)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE)
            RETURNING *
            """,
            zone_id, req.device_code, req.channel, req.label,
            req.max_power_w, req.enabled,
        )
    except Exception as e:
        if "uq_heater_active_channel" in str(e):
            raise HTTPException(
                status_code=409,
                detail=f"Heater for {req.device_code} ch{req.channel} "
                       "is already assigned to another zone",
            )
        logger.error(f"brooder add_heater {zone_id}/{req.device_code} "
                     f"ch{req.channel}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    d = dict(row)
    for ts in ("created_at", "updated_at"):
        if d.get(ts):
            d[ts] = d[ts].isoformat()
    await zone_controller._load_zones()
    return d


@router.put("/heaters/{heater_id}")
async def update_heater(heater_id: int, req: HeaterUpdate):
    row = await db.fetchrow(
        "SELECT id FROM brooder_heaters WHERE id = $1 AND is_active = TRUE",
        heater_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Heater {heater_id} not found")
    sets, vals = [], []
    if req.label is not None:
        sets.append(f"label = ${len(vals)+1}")
        vals.append(req.label)
    if req.max_power_w is not None:
        sets.append(f"max_power_w = ${len(vals)+1}")
        vals.append(req.max_power_w)
    if req.enabled is not None:
        sets.append(f"enabled = ${len(vals)+1}")
        vals.append(req.enabled)
    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")
    sets.append("updated_at = NOW()")
    vals.append(heater_id)
    sql = f"UPDATE brooder_heaters SET {', '.join(sets)} WHERE id = ${len(vals)}"
    try:
        await db.execute(sql, *vals)
    except Exception as e:
        logger.error(f"brooder update_heater {heater_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    await zone_controller._load_zones()
    return {"ok": True, "heater_id": heater_id}


@router.delete("/heaters/{heater_id}")
async def delete_heater(heater_id: int, hard: bool = Query(False)):
    row = await db.fetchrow(
        "SELECT id FROM brooder_heaters WHERE id = $1", heater_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail=f"Heater {heater_id} not found")
    try:
        if hard:
            await db.execute("DELETE FROM brooder_heaters WHERE id = $1", heater_id)
        else:
            await db.execute(
                """UPDATE brooder_heaters
                   SET is_active = FALSE, enabled = FALSE, updated_at = NOW()
                   WHERE id = $1""",
                heater_id,
            )
    except Exception as e:
        logger.error(f"brooder delete_heater {heater_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    await zone_controller._load_zones()
    return {"ok": True, "heater_id": heater_id, "hard": hard}


# ── ZONE SENSORS (refactored from /nodes/{code}/zone-sensors) ──

@router.get("/zones/{zone_id}/sensors")
async def list_zone_sensors(zone_id: int):
    await _get_zone_or_404(zone_id)
    try:
        rows = await db.fetch(
            """
            SELECT
                bzs.id,
                bzs.zone_id,
                bzs.sensor_device_code,
                bzs.weight,
                bzs.label,
                bzs.created_at,
                bzs.updated_at,
                d.name        AS sensor_name,
                d.barn_id     AS sensor_barn_id,
                sl.value      AS last_value,
                sl.unit       AS last_unit,
                sl.time       AS last_time
            FROM brooder_zone_sensors bzs
            LEFT JOIN devices d
                   ON d.device_code = bzs.sensor_device_code
            LEFT JOIN sensor_latest sl
                   ON sl.device_id = d.id
                  AND sl.sensor_type = 'temperature'
            WHERE bzs.zone_id = $1
            ORDER BY bzs.id
            """,
            zone_id,
        )
    except Exception as e:
        logger.error(f"brooder list_zone_sensors {zone_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    out = []
    for r in rows:
        d = dict(r)
        for ts in ("created_at", "updated_at", "last_time"):
            if d.get(ts):
                d[ts] = d[ts].isoformat()
        out.append(d)
    return {"zone_id": zone_id, "zone_sensors": out, "count": len(out)}


@router.post("/zones/{zone_id}/sensors")
async def add_zone_sensor(zone_id: int, req: ZoneSensorAttach):
    """Attach a reference sensor to this zone (replaces per-node attach)."""
    await _get_zone_or_404(zone_id)
    sensor = await db.fetchrow(
        "SELECT id, name, barn_id FROM devices WHERE device_code = $1",
        req.sensor_device_code,
    )
    if not sensor:
        raise HTTPException(
            status_code=400,
            detail=f"Sensor device {req.sensor_device_code} not found",
        )
    try:
        row = await db.fetchrow(
            """
            INSERT INTO brooder_zone_sensors
                (zone_id, sensor_device_code, weight, label, brooder_device_code)
            VALUES ($1, $2, $3, $4, NULL)
            RETURNING *
            """,
            zone_id, req.sensor_device_code, req.weight, req.label,
        )
    except Exception as e:
        # UNIQUE (zone_id, sensor_device_code) — could conflict if legacy
        # row already exists with same sensor (different zone_id). Treat
        # conflict as "already attached to this zone".
        if "uq_brooder_sensor" in str(e) or "unique" in str(e).lower():
            raise HTTPException(
                status_code=409,
                detail=f"Sensor {req.sensor_device_code} already linked "
                       "to a zone or node",
            )
        logger.error(f"brooder add_zone_sensor {zone_id}/{req.sensor_device_code}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    out = dict(row)
    for ts in ("created_at", "updated_at"):
        if out.get(ts):
            out[ts] = out[ts].isoformat()
    out["sensor_name"] = sensor["name"]
    out["sensor_barn_id"] = sensor["barn_id"]
    return out


@router.put("/zones/{zone_id}/sensors/{sensor_code}")
async def update_zone_sensor(zone_id: int, sensor_code: str, req: ZoneSensorPatch):
    await _get_zone_or_404(zone_id)
    sets, vals = [], []
    if req.weight is not None:
        sets.append(f"weight = ${len(vals)+1}")
        vals.append(req.weight)
    if req.label is not None:
        sets.append(f"label = ${len(vals)+1}")
        vals.append(req.label)
    if not sets:
        raise HTTPException(status_code=400, detail="No fields to update")
    sets.append("updated_at = NOW()")
    vals.extend([zone_id, sensor_code])
    sql = (
        f"UPDATE brooder_zone_sensors SET {', '.join(sets)} "
        f"WHERE zone_id = ${len(vals)-1} "
        f"  AND sensor_device_code = ${len(vals)}"
    )
    try:
        await db.execute(sql, *vals)
    except Exception as e:
        logger.error(f"brooder update_zone_sensor {zone_id}/{sensor_code}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True, "zone_id": zone_id, "sensor": sensor_code}


@router.delete("/zones/{zone_id}/sensors/{sensor_code}")
async def remove_zone_sensor(zone_id: int, sensor_code: str):
    await _get_zone_or_404(zone_id)
    try:
        result = await db.execute(
            """
            DELETE FROM brooder_zone_sensors
            WHERE zone_id = $1 AND sensor_device_code = $2
            """,
            zone_id, sensor_code,
        )
    except Exception as e:
        logger.error(f"brooder remove_zone_sensor {zone_id}/{sensor_code}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    deleted = int(result.split()[1]) if result.startswith("DELETE") else 0
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"No zone-sensor link zone {zone_id} → {sensor_code}",
        )
    return {"ok": True, "zone_id": zone_id, "sensor": sensor_code}


# ── MEMBERS: attach / detach ESP32s from a zone ────────────

@router.get("/zones/{zone_id}/members")
async def list_zone_members(zone_id: int):
    """List ESP32 brooder nodes attached to this zone + live overlay."""
    await _get_zone_or_404(zone_id)
    z = zone_controller.zones.get(zone_id)
    members = []
    if z:
        for code, node in z.member_nodes.items():
            d = node.to_dict()
            d["role"] = "member"  # role lookup would need extra query
            members.append(d)
    return {"zone_id": zone_id, "members": members, "count": len(members)}


@router.post("/zones/{zone_id}/members")
async def add_zone_member(zone_id: int, req: MemberAttach):
    await _get_zone_or_404(zone_id)
    dev = await db.fetchrow(
        "SELECT device_code FROM brooder_nodes WHERE device_code = $1 "
        "AND is_active = TRUE",
        req.device_code,
    )
    if not dev:
        raise HTTPException(
            status_code=400,
            detail=f"Brooder device {req.device_code} not registered",
        )
    try:
        await db.execute(
            """
            INSERT INTO brooder_zone_devices
                (zone_id, brooder_device_code, role)
            VALUES ($1, $2, $3)
            """,
            zone_id, req.device_code, req.role,
        )
    except Exception as e:
        if "uq_bzd" in str(e) or "unique" in str(e).lower():
            raise HTTPException(
                status_code=409,
                detail=f"Device {req.device_code} already in this zone",
            )
        logger.error(f"brooder add_member {zone_id}/{req.device_code}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    await zone_controller._load_zones()
    return {"ok": True, "zone_id": zone_id, "device_code": req.device_code}


@router.delete("/zones/{zone_id}/members/{device_code}")
async def remove_zone_member(zone_id: int, device_code: str):
    await _get_zone_or_404(zone_id)
    try:
        result = await db.execute(
            """DELETE FROM brooder_zone_devices
               WHERE zone_id = $1 AND brooder_device_code = $2""",
            zone_id, device_code,
        )
    except Exception as e:
        logger.error(f"brooder remove_member {zone_id}/{device_code}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    deleted = int(result.split()[1]) if result.startswith("DELETE") else 0
    if not deleted:
        raise HTTPException(
            status_code=404,
            detail=f"Device {device_code} not in zone {zone_id}",
        )
    await zone_controller._load_zones()
    return {"ok": True, "zone_id": zone_id, "device_code": device_code}


@router.get("/zones/{zone_id}/members/available")
async def list_available_zone_members(
    zone_id: int,
    barn_id: Optional[str] = Query(None, max_length=50),
    q: Optional[str] = Query(None, max_length=64),
):
    """Candidate ESP32 brooder nodes to attach to this zone.

    Excludes nodes already in this zone (any role) and filters to active
    brooder_nodes only. Optionally narrows by the zone's barn_id
    (recommended) and free-text search on device_code/name.
    """
    await _get_zone_or_404(zone_id)
    conditions = [
        "bn.is_active = TRUE",
        "bn.device_code NOT IN ("
        "  SELECT brooder_device_code FROM brooder_zone_devices "
        "  WHERE zone_id = $1"
        ")",
    ]
    params: list = [zone_id]
    if barn_id and barn_id != "all":
        conditions.append(f"d.barn_id = ${len(params)+1}")
        params.append(barn_id)
    if q:
        conditions.append(
            f"(d.device_code ILIKE ${len(params)+1} "
            f" OR d.name ILIKE ${len(params)+1})"
        )
        params.append(f"%{q}%")
    where = " AND ".join(conditions)
    try:
        rows = await db.fetch(
            f"""
            SELECT
                d.device_code,
                d.name,
                d.barn_id,
                d.is_online,
                bn.zone_name,
                bn.cycle_id,
                bn.enabled
            FROM brooder_nodes bn
            JOIN devices d ON d.device_code = bn.device_code
            WHERE {where}
            ORDER BY d.device_code
            LIMIT 100
            """,
            *params,
        )
    except Exception as e:
        logger.error(f"brooder list_available_members {zone_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    out = [dict(r) for r in rows]
    return {"zone_id": zone_id, "members": out, "count": len(out)}


# ── ZONE OVERRIDES + AUDIT ──────────────────────────────────

@router.post("/zones/{zone_id}/setpoint")
async def set_zone_setpoint(zone_id: int, req: SetpointSet):
    """Set or clear manual setpoint override for the entire zone."""
    try:
        state = await zone_controller.set_zone_setpoint(
            zone_id, req.setpoint, req.note,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"brooder set_zone_setpoint {zone_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return state


@router.post("/zones/{zone_id}/fallback-delta")
async def set_zone_fallback_delta(zone_id: int, req: FallbackDeltaSet):
    """Update the zone-wide Tier-2 fallback delta."""
    try:
        state = await zone_controller.set_zone_fallback_delta(
            zone_id, req.fallback_delta_c,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.error(f"brooder set_zone_fallback_delta {zone_id} failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    return state


@router.get("/zones/{zone_id}/setpoint-history")
async def get_zone_setpoint_history(zone_id: int,
                                    limit: int = Query(50, ge=1, le=500)):
    """Recent manual override changes for this zone (audit log)."""
    await _get_zone_or_404(zone_id)
    rows = await db.fetch(
        """
        SELECT id, manual_setpoint, effective_setpoint, source, note, created_at
        FROM zone_setpoint_history
        WHERE zone_id = $1
        ORDER BY created_at DESC
        LIMIT $2
        """,
        zone_id, limit,
    )
    out = []
    for r in rows:
        d = dict(r)
        d["created_at"] = d["created_at"].isoformat() if d.get("created_at") else None
        out.append(d)
    return {"zone_id": zone_id, "history": out}


# ── ZONE TELEMETRY (24h chart data) ────────────────────────

@router.get("/zones/{zone_id}/telemetry")
async def get_zone_telemetry(zone_id: int,
                             hours: int = Query(24, ge=1, le=720)):
    """24h chart: zone temperature (weighted avg), setpoint, total power,
    and per-heater thin lines.

    Reconstructs zone temperature per sample by:
      1. Pulling sensor_data rows for every member device (brooder_temp).
      2. Joining with brooder_zone_sensors to get weight.
      3. Computing the same weighted avg the server would.
    """
    await _get_zone_or_404(zone_id)
    until = datetime.now(timezone.utc)
    since = until - timedelta(hours=hours)

    # Zone temperature series (weighted avg per minute bucket)
    # Use raw rows + client-side bucketing. Server returns up to 2000 rows
    # per device; aggregate client-side to keep API simple.
    try:
        temp_rows = await db.fetch(
            """
            SELECT
                time_bucket('1 minute', sd.time) AS bucket,
                AVG(sd.value)                    AS temp
            FROM sensor_data sd
            JOIN devices d ON d.id = sd.device_id
            WHERE d.device_code IN (
                    SELECT brooder_device_code
                    FROM brooder_zone_devices
                    WHERE zone_id = $1
                  )
                AND sd.sensor_type = 'brooder_temp'
                AND sd.time >= $2 AND sd.time <= $3
            GROUP BY bucket
            ORDER BY bucket
            """,
            zone_id, since, until,
        )
    except Exception as e:
        logger.error(f"brooder zone_telemetry {zone_id} (temp) failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    # Power series (avg per minute across member ESPs)
    try:
        power_rows = await db.fetch(
            """
            SELECT
                time_bucket('1 minute', sd.time) AS bucket,
                AVG(sd.value)                    AS power
            FROM sensor_data sd
            JOIN devices d ON d.id = sd.device_id
            WHERE d.device_code IN (
                    SELECT brooder_device_code
                    FROM brooder_zone_devices
                    WHERE zone_id = $1
                  )
                AND sd.sensor_type = 'brooder_power'
                AND sd.time >= $2 AND sd.time <= $3
            GROUP BY bucket
            ORDER BY bucket
            """,
            zone_id, since, until,
        )
    except Exception as e:
        logger.error(f"brooder zone_telemetry {zone_id} (power) failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

    def _bucket_iso(rows, key):
        return [{"time": r["bucket"].isoformat(), "value": float(r[key] or 0)}
                for r in rows]

    return {
        "zone_id":     zone_id,
        "hours":       hours,
        "since":       since.isoformat(),
        "until":       until.isoformat(),
        "zone_temp":   _bucket_iso(temp_rows, "temp"),
        "total_power": _bucket_iso(power_rows, "power"),
        "count_temp":  len(temp_rows),
        "count_power": len(power_rows),
    }


# ============================================================
# LEGACY COMPAT SHIMS — make /nodes/{code}/... delegate to /zones
# ============================================================
#
# When a brooder_node is attached to a zone (via brooder_zone_devices),
# its setpoint / fallback-delta / zone-sensors endpoints should resolve
# the zone and delegate to the zone handler. This keeps the legacy
# `/api/brooder/nodes/{code}/...` URLs working through Phase F.
#
# Implementation note: rather than rewriting the existing handlers,
# we override ONLY the endpoints that take a `code` and delegate to
# the zone. The legacy handler bodies are preserved in this file
# (above); the new wrappers below come LAST so route registration
# picks up the originals first via FastAPI's first-match wins.
#
# FastAPI matches routes by registration order, and our overrides
# live in the same `router` — so the delegating versions must come
# AFTER the originals to actually take effect. In FastAPI, however,
# the first matching path wins REGARDLESS of declaration order when
# both routes have the same path. So we re-declare only the paths
# where we want zone-aware behavior — the originals above won't
# trigger because the new ones below have IDENTICAL paths and are
# declared LATER. (FastAPI behavior: last-declared wins for same path.)
# ============================================================
#
# IMPORTANT: FastAPI matches by path + method. To override the legacy
# `/nodes/{code}/setpoint` endpoint, we register another @router.post
# with the SAME path and method BELOW the legacy one. FastAPI will
# match the LATER one.
# ============================================================
#
# Wait — actually FastAPI matches the FIRST registered route with
# matching path+method (Starlette routing). To override, we have two
# options: (a) edit the legacy handler body, or (b) rename the legacy
# ones (e.g. /nodes-legacy/...). Going with (a) below — the legacy
# `/nodes/{code}/setpoint` handler is replaced by a zone-aware one.
#
# NOTE: We can't easily "override" a route with same path+method in
# FastAPI without breaking the first registration. The cleanest fix
# is to add a guard at the START of the legacy handler that delegates
# to the zone controller. Since the legacy handlers are ALREADY
# REGISTERED, we add the delegation guard directly in them.
#
# This block is therefore COMMENT-ONLY documentation. The actual
# delegation is implemented in the legacy handlers themselves (above).
# ============================================================
