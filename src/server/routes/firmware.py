"""Firmware OTA API routes."""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from typing import Optional

from src.iot.firmware_service import firmware_service

router = APIRouter(prefix="/api/firmware", tags=["firmware"])


@router.get("")
async def list_firmwares(device_type_code: str = None):
    """List all firmware versions."""
    return await firmware_service.list_firmwares(device_type_code)


@router.get("/latest/{device_type_code}")
async def get_latest_firmware(device_type_code: str):
    """Get latest firmware for a device type (used by ESP32 OTA check)."""
    fw = await firmware_service.get_latest(device_type_code)
    if not fw:
        raise HTTPException(status_code=404, detail="No firmware available")
    return fw


@router.get("/default/{device_type_code}")
async def get_default_firmware(device_type_code: str):
    """Get default firmware for a device type (mother preferred, fallback to latest)."""
    fw = await firmware_service.get_default(device_type_code)
    if not fw:
        raise HTTPException(status_code=404, detail="No firmware available")
    return fw


@router.get("/mother/{device_type_code}")
async def get_mother_firmware(device_type_code: str):
    """Get mother (default) firmware for a device type."""
    fw = await firmware_service.get_mother(device_type_code)
    if not fw:
        raise HTTPException(status_code=404, detail="No mother firmware set")
    return fw


@router.post("/set-mother/{firmware_id}")
async def set_mother_firmware(firmware_id: int):
    """Set a firmware as mother (default) for its device type."""
    result = await firmware_service.set_mother(firmware_id)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result


@router.post("/upload")
async def upload_firmware(
    device_type_code: str = Form(...),
    version: str = Form(...),
    changelog: str = Form(""),
    is_mother: bool = Form(False),
    file: UploadFile = File(...),
):
    """Upload a new firmware binary.

    If is_mother=True, sets this as the default firmware for the type.
    First firmware for a type is automatically set as mother.
    """
    content = await file.read()
    if len(content) > 4 * 1024 * 1024:  # 4MB max
        raise HTTPException(status_code=400, detail="File too large (max 4MB)")

    result = await firmware_service.upload(
        device_type_code, version, content, file.filename, changelog, is_mother
    )
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result["firmware"]


@router.get("/download/{firmware_id}")
async def download_firmware(firmware_id: int):
    """Download firmware binary (used by ESP32 OTA)."""
    from src.services.database.db import db
    row = await db.fetchrow("SELECT filename FROM firmwares WHERE id = $1", firmware_id)
    if not row:
        raise HTTPException(status_code=404, detail="Firmware not found")

    filepath = firmware_service.get_file_path(row["filename"])
    if not filepath:
        raise HTTPException(status_code=404, detail="Firmware file missing")

    return FileResponse(
        filepath,
        media_type="application/octet-stream",
        filename=row["filename"],
    )


@router.post("/ota/{device_id}")
async def trigger_ota(device_id: int):
    """Trigger OTA update on a device."""
    result = await firmware_service.trigger_ota(device_id)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.delete("/{firmware_id}")
async def delete_firmware(firmware_id: int):
    """Delete a firmware version."""
    deleted = await firmware_service.delete(firmware_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Firmware not found")
    return {"ok": True}


@router.get("/generate/{device_id}")
async def generate_device_firmware(device_id: int):
    """Generate customized firmware source code for a device.

    Reads the mother firmware for the device's type, substitutes
    device-specific variables (DEVICE_CODE, MQTT topic, etc.),
    and returns the customized source code for manual flashing.
    """
    from src.iot.device_service import device_service

    device = await device_service.get(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    result = await firmware_service.generate_child_firmware(device)
    if not result["ok"]:
        raise HTTPException(status_code=400, detail=result.get("message"))

    return result
