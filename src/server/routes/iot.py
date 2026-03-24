"""IoT control API routes - MQTT, curtains, devices."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.iot.mqtt_client import mqtt_client
from src.iot.curtain_service import curtain_service
from src.services.storage.config_service import ConfigService

router = APIRouter(prefix="/api/iot", tags=["iot"])
config_service = ConfigService()


# ── Request Models ──────────────────────────────────

class CurtainMoveRequest(BaseModel):
    target_pct: int  # 0-100


class CurtainConfigRequest(BaseModel):
    id: str
    name: str
    barn_name: str = ""
    device_topic: str = ""
    up_channel: int = 1
    down_channel: int = 2
    full_up_seconds: float = 60
    full_down_seconds: float = 60
    current_position: int = 0


class RelayCommandRequest(BaseModel):
    device_topic: str
    channel: int
    state: str  # "on" or "off"


# ── MQTT Status ─────────────────────────────────────

@router.get("/mqtt/status")
async def mqtt_status():
    """Get MQTT connection status."""
    return {
        "connected": mqtt_client.connected,
        "host": mqtt_client.host,
        "port": mqtt_client.port,
    }


# ── Curtain Endpoints ───────────────────────────────

@router.get("/curtains")
async def get_curtains():
    """Get all curtains with real-time position."""
    return curtain_service.get_all()


@router.get("/curtains/{curtain_id}")
async def get_curtain_status(curtain_id: str):
    """Get single curtain status."""
    status = curtain_service.get_status(curtain_id)
    if not status:
        raise HTTPException(status_code=404, detail="Curtain not found")
    return status


@router.post("/curtains/{curtain_id}/move")
async def move_curtain(curtain_id: str, req: CurtainMoveRequest):
    """Move curtain to target position (0-100%)."""
    result = curtain_service.move_to(curtain_id, req.target_pct)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.post("/curtains/{curtain_id}/stop")
async def stop_curtain(curtain_id: str):
    """Stop curtain immediately."""
    result = curtain_service.stop(curtain_id)
    if not result["ok"]:
        raise HTTPException(status_code=404, detail=result["message"])
    return result


@router.post("/curtains")
async def add_curtain(req: CurtainConfigRequest):
    """Add a new curtain."""
    config = req.model_dump()
    result = curtain_service.add_curtain(config)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])

    # Save to YAML
    cfg = config_service.load_config()
    cfg.setdefault("curtains", [])
    cfg["curtains"].append(config)
    config_service.save_config(cfg)
    return config


@router.put("/curtains/{curtain_id}")
async def update_curtain(curtain_id: str, req: CurtainConfigRequest):
    """Update curtain configuration."""
    if req.id != curtain_id:
        raise HTTPException(status_code=400, detail="ID mismatch")

    config = req.model_dump()
    result = curtain_service.update_curtain(curtain_id, config)
    if not result["ok"]:
        raise HTTPException(status_code=404, detail=result["message"])

    # Update YAML
    cfg = config_service.load_config()
    curtains = cfg.get("curtains", [])
    for i, c in enumerate(curtains):
        if c["id"] == curtain_id:
            curtains[i] = config
            break
    config_service.save_config(cfg)
    return config


@router.delete("/curtains/{curtain_id}")
async def delete_curtain(curtain_id: str):
    """Delete a curtain."""
    if not curtain_service.remove_curtain(curtain_id):
        raise HTTPException(status_code=404, detail="Curtain not found")

    # Remove from YAML
    cfg = config_service.load_config()
    cfg["curtains"] = [c for c in cfg.get("curtains", []) if c["id"] != curtain_id]
    config_service.save_config(cfg)
    return {"ok": True}


# ── Direct Relay Control ────────────────────────────

@router.post("/relay")
async def send_relay_command(req: RelayCommandRequest):
    """Send direct relay command via MQTT."""
    if req.state not in ("on", "off"):
        raise HTTPException(status_code=400, detail="State must be 'on' or 'off'")

    sent = mqtt_client.send_relay_command(req.device_topic, req.channel, req.state)
    if not sent:
        raise HTTPException(status_code=502, detail="MQTT send failed")
    return {"ok": True, "topic": req.device_topic, "channel": req.channel, "state": req.state}
