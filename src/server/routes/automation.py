"""Automation and alert API routes."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from src.iot.automation_service import automation_service
from src.iot.alert_service import alert_service
from src.services.database.db import db

router = APIRouter(prefix="/api", tags=["automation"])


# ── Request Models ──────────────────────────────────

class AutomationRuleRequest(BaseModel):
    name: str
    device_id: int
    channel_number: int
    rule_type: str                              # 'schedule' or 'condition'
    enabled: bool = True
    # Schedule
    cron_expression: Optional[str] = None
    action_state: Optional[str] = None          # 'on' or 'off'
    duration_seconds: Optional[int] = None
    # Condition
    sensor_device_id: Optional[int] = None
    sensor_type: Optional[str] = None
    operator: Optional[str] = None              # >, <, >=, <=, ==
    threshold: Optional[float] = None
    condition_action: Optional[str] = None
    cooldown_seconds: int = 300


class AlertRuleRequest(BaseModel):
    name: str
    barn_id: Optional[str] = None
    sensor_type: str
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    severity: str = "warning"
    enabled: bool = True
    cooldown_minutes: int = 15


class TimedRelayRequest(BaseModel):
    device_topic: str
    channel: int
    duration_seconds: int


# ── Automation Rules ────────────────────────────────

@router.get("/automation/rules")
async def list_automation_rules(device_id: int = None):
    return await automation_service.list_rules(device_id)


@router.post("/automation/rules")
async def create_automation_rule(req: AutomationRuleRequest):
    result = await automation_service.create_rule(req.model_dump())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result["rule"]


@router.get("/automation/rules/{rule_id}")
async def get_automation_rule(rule_id: int):
    rule = await automation_service.get_rule(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    return rule


@router.put("/automation/rules/{rule_id}")
async def update_automation_rule(rule_id: int, req: AutomationRuleRequest):
    return await automation_service.update_rule(rule_id, req.model_dump(exclude_none=True))


@router.delete("/automation/rules/{rule_id}")
async def delete_automation_rule(rule_id: int):
    deleted = await automation_service.delete_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"ok": True}


@router.post("/automation/rules/{rule_id}/toggle")
async def toggle_automation_rule(rule_id: int, enabled: bool = True):
    return await automation_service.toggle_rule(rule_id, enabled)


# ── Timed Relay ─────────────────────────────────────

@router.post("/iot/relay/timed")
async def send_timed_relay(req: TimedRelayRequest):
    """Turn relay ON for N seconds, then auto OFF."""
    device_id = None
    if db.pool:
        device_id = await db.fetchval(
            "SELECT id FROM devices WHERE mqtt_topic = $1", req.device_topic
        )
    result = await automation_service.send_timed_relay(
        req.device_topic, req.channel, req.duration_seconds, device_id
    )
    if not result["ok"]:
        raise HTTPException(status_code=502, detail=result["message"])
    return result


# ── Alert Rules ─────────────────────────────────────

@router.get("/alerts/rules")
async def list_alert_rules(barn_id: str = None):
    return await alert_service.list_rules(barn_id)


@router.post("/alerts/rules")
async def create_alert_rule(req: AlertRuleRequest):
    result = await alert_service.create_rule(req.model_dump())
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result["rule"]


@router.put("/alerts/rules/{rule_id}")
async def update_alert_rule(rule_id: int, req: AlertRuleRequest):
    return await alert_service.update_rule(rule_id, req.model_dump(exclude_none=True))


@router.delete("/alerts/rules/{rule_id}")
async def delete_alert_rule(rule_id: int):
    deleted = await alert_service.delete_rule(rule_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Rule not found")
    return {"ok": True}


# ── Alerts ──────────────────────────────────────────

@router.get("/alerts")
async def list_alerts(acknowledged: bool = None, barn_id: str = None, limit: int = 50):
    return await alert_service.list_alerts(acknowledged, barn_id, limit)


@router.get("/alerts/active")
async def list_active_alerts(barn_id: str = None):
    return await alert_service.list_alerts(acknowledged=False, barn_id=barn_id)


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: int):
    return await alert_service.acknowledge(alert_id)


@router.post("/alerts/acknowledge-all")
async def acknowledge_all_alerts(barn_id: str = None):
    return await alert_service.acknowledge_all(barn_id)
