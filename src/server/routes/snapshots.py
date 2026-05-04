"""Snapshot Routes - Configure snapshot storage and cleanup."""

from fastapi import APIRouter
from pydantic import BaseModel
from src.services.storage.snapshot_service import snapshot_service
from src.services.storage.config_service import ConfigService

router = APIRouter(prefix="/api/snapshots", tags=["snapshots"])

config_service = ConfigService()


class UpdateConfigModel(BaseModel):
    snapshot_dir: str | None = None
    retention_days: int | None = None


@router.get("/config")
async def get_config():
    """Get snapshot configuration."""
    snap_cfg = config_service.get_snapshot_config()
    storage_info = snapshot_service.get_storage_info()
    return {
        **snap_cfg,
        "total_files": storage_info["total_files"],
        "total_size_mb": storage_info["total_size_mb"],
        "total_size_gb": storage_info["total_size_gb"],
    }


@router.put("/config")
async def update_config(data: UpdateConfigModel):
    """Update snapshot configuration."""
    cfg = config_service.update_snapshot_config(
        snapshot_dir=data.snapshot_dir,
        retention_days=data.retention_days,
    )
    snapshot_service.update_settings(
        snapshot_dir=cfg["snapshot_dir"],
        retention_days=cfg["retention_days"],
    )
    return cfg


@router.post("/cleanup")
async def run_cleanup():
    """Run snapshot cleanup manually."""
    result = snapshot_service.cleanup_old()
    return {"ok": True, **result}


@router.get("/storage")
async def get_storage():
    """Get snapshot storage stats."""
    return snapshot_service.get_storage_info()