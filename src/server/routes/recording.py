"""Recording API routes - Điều khiển ghi hình và xem bản ghi."""

import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List

from src.services.storage.recording_service import recording_service
from src.services.storage.config_service import ConfigService

router = APIRouter(prefix="/api/recording", tags=["recording"])


class RecordingSettingsUpdate(BaseModel):
    recording_dir: Optional[str] = None
    segment_duration: Optional[int] = None


# ── Recording Control ─────────────────────────────────────

@router.post("/start/{camera_id}")
async def start_recording(camera_id: str):
    """Start recording for a camera."""
    recording_service.start_recording(camera_id)
    return {"status": "recording", "camera_id": camera_id}


@router.post("/stop/{camera_id}")
async def stop_recording(camera_id: str):
    """Stop recording for a camera."""
    recording_service.stop_recording(camera_id)
    return {"status": "stopped", "camera_id": camera_id}


@router.post("/start-all")
async def start_all_recording():
    """Start recording for all active cameras."""
    from src.cameras.capture.camera_manager import camera_manager
    started = []
    for camera_id in camera_manager.get_all_cameras():
        recording_service.start_recording(camera_id)
        started.append(camera_id)
    return {"status": "recording", "cameras": started}


@router.post("/stop-all")
async def stop_all_recording():
    """Stop all recordings."""
    recording_service.stop_all()
    return {"status": "stopped"}


# ── Recording Status ──────────────────────────────────────

@router.get("/status/{camera_id}")
async def get_recording_status(camera_id: str):
    """Get recording status for a camera."""
    return recording_service.get_stats(camera_id)


@router.get("/status")
async def get_all_recording_status():
    """Get recording status for all cameras."""
    return recording_service.get_all_stats()


# ── Settings ──────────────────────────────────────────────

@router.get("/settings")
async def get_recording_settings():
    """Get recording settings."""
    config_service = ConfigService()
    config = config_service.get_recording_config()
    runtime = recording_service.get_settings()
    return {**config, **runtime}


@router.put("/settings")
async def update_recording_settings(settings: RecordingSettingsUpdate):
    """Update recording settings."""
    config_service = ConfigService()
    update = {}
    if settings.recording_dir is not None:
        update["recording_dir"] = settings.recording_dir
    if settings.segment_duration is not None:
        update["segment_duration"] = settings.segment_duration

    if update:
        config = config_service.update_recording_config(update)
        # Apply to running service
        recording_service.update_settings(
            recording_dir=settings.recording_dir,
            segment_duration=settings.segment_duration,
        )
        return config
    return config_service.get_recording_config()


# ── Recordings Browser ────────────────────────────────────

@router.get("/files")
async def list_recordings(
    camera_id: Optional[str] = Query(None),
    date: Optional[str] = Query(None),
):
    """List recorded files. Filter by camera_id and/or date."""
    return recording_service.get_recordings(camera_id=camera_id, date=date)


@router.get("/dates")
async def list_recording_dates(camera_id: Optional[str] = Query(None)):
    """List available recording dates."""
    base = Path(recording_service.recording_dir)
    if not base.exists():
        return []

    dates = set()
    if camera_id:
        cam_dir = base / camera_id
        if cam_dir.exists():
            for d in cam_dir.iterdir():
                if d.is_dir():
                    dates.add(d.name)
    else:
        for cam_dir in base.iterdir():
            if cam_dir.is_dir():
                for d in cam_dir.iterdir():
                    if d.is_dir():
                        dates.add(d.name)

    return sorted(dates, reverse=True)


@router.get("/play/{camera_id}/{date}/{filename}")
async def play_recording(camera_id: str, date: str, filename: str):
    """Serve a recorded video file for playback."""
    filepath = Path(recording_service.recording_dir) / camera_id / date / filename

    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Recording not found")

    # Security: ensure path is within recording dir
    try:
        filepath.resolve().relative_to(Path(recording_service.recording_dir).resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    return FileResponse(
        str(filepath),
        media_type="video/mp4",
        filename=f"{camera_id}_{date}_{filename}",
    )


@router.delete("/files/{camera_id}/{date}/{filename}")
async def delete_recording(camera_id: str, date: str, filename: str):
    """Delete a recording file."""
    filepath = Path(recording_service.recording_dir) / camera_id / date / filename

    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Recording not found")

    try:
        filepath.resolve().relative_to(Path(recording_service.recording_dir).resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    filepath.unlink()

    # Clean up empty directories
    date_dir = filepath.parent
    if date_dir.exists() and not any(date_dir.iterdir()):
        date_dir.rmdir()

    return {"status": "deleted"}


@router.delete("/files/{camera_id}/{date}")
async def delete_recording_date(camera_id: str, date: str):
    """Delete all recordings for a camera on a specific date."""
    date_dir = Path(recording_service.recording_dir) / camera_id / date

    if not date_dir.exists():
        raise HTTPException(status_code=404, detail="Date folder not found")

    import shutil
    shutil.rmtree(str(date_dir))
    return {"status": "deleted"}
