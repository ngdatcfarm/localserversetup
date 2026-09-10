"""Recording API routes - Điều khiển ghi hình và xem bản ghi."""

import os
from pathlib import Path
from fastapi import APIRouter, HTTPException, Query, Depends, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, List

from src.services.storage.recording_service import recording_service
from src.services.storage.config_service import ConfigService
from src.server.auth import require_auth

router = APIRouter(prefix="/api/recording", tags=["recording"], dependencies=[Depends(require_auth)])


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
async def play_recording(camera_id: str, date: str, filename: str, request: Request):
    """Serve a recorded video file for playback.

    - **Content-Disposition: inline** — so the browser plays the video in the
      <video> element instead of triggering a download dialog. (We pass
      `filename` to FileResponse so Starlette actually emits the header; the
      `content_disposition_type="inline"` parameter alone is a no-op without it.)
    - **Accept-Ranges: bytes** + manual Range handling — Starlette 0.35.1's
      FileResponse streams the whole file without honoring Range requests,
      which would force the browser to download the entire recording before it
      can seek. We parse `Range: bytes=START-END` and return 206 Partial Content
      with `Content-Range` + `Content-Length` so seeking works on multi-MB
      segments without buffering the whole file.
    - **Security**: path traversal check ensures the resolved path stays inside
      the recording directory.
    """
    filepath = Path(recording_service.recording_dir) / camera_id / date / filename

    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Recording not found")

    # Security: ensure path is within recording dir
    try:
        filepath.resolve().relative_to(Path(recording_service.recording_dir).resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="Access denied")

    file_size = filepath.stat().st_size

    # Parse Range header if present. Format: "bytes=START-END" (END optional).
    range_header = request.headers.get("range") or request.headers.get("Range")
    range_match = None
    if range_header:
        import re as _re
        m = _re.match(r"bytes=(\d*)-(\d*)$", range_header.strip())
        if m:
            start_s, end_s = m.group(1), m.group(2)
            if start_s == "" and end_s != "":
                # Suffix range: bytes=-N → last N bytes
                suffix_len = int(end_s)
                if suffix_len == 0:
                    range_match = (0, 0)  # unsatisfiable, handled below
                else:
                    start = max(0, file_size - suffix_len)
                    end = file_size - 1
                    range_match = (start, end)
            else:
                start = int(start_s) if start_s else 0
                end = int(end_s) if end_s else file_size - 1
                end = min(end, file_size - 1)
                range_match = (start, end)

    # Common headers — present on both full and partial responses so the browser
    # knows it can seek (Accept-Ranges: bytes).
    base_headers = {
        "Accept-Ranges": "bytes",
        "Content-Disposition": f'inline; filename="{filename}"',
    }

    if range_match is None:
        # No Range header → serve the whole file with 200 OK
        return FileResponse(
            str(filepath),
            media_type="video/mp4",
            headers=base_headers,
        )

    start, end = range_match

    # Validate range
    if start >= file_size or start > end:
        # 416 Range Not Satisfiable
        return Response(
            status_code=416,
            headers={
                **base_headers,
                "Content-Range": f"bytes */{file_size}",
            },
        )

    chunk_size = 64 * 1024  # 64 KB chunks — matches Starlette default

    async def _range_stream():
        """Stream bytes [start, end] from the file."""
        remaining = end - start + 1
        with open(filepath, "rb") as f:
            f.seek(start)
            while remaining > 0:
                data = f.read(min(chunk_size, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    return StreamingResponse(
        _range_stream(),
        status_code=206,
        media_type="video/mp4",
        headers={
            **base_headers,
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Content-Length": str(end - start + 1),
        },
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
