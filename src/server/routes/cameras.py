"""Camera management API routes."""

from typing import List
from fastapi import APIRouter, HTTPException, status
from src.models.camera import CameraConfig, CameraStatus
from src.services.storage.config_service import ConfigService
from src.cameras.capture import camera_manager


router = APIRouter(prefix="/api/cameras", tags=["cameras"])
config_service = ConfigService()


@router.get("", response_model=List[CameraConfig])
async def get_cameras():
    """Get all cameras."""
    return config_service.get_cameras()


@router.get("/{camera_id}", response_model=CameraConfig)
async def get_camera(camera_id: str):
    """Get single camera by ID."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )
    return camera


@router.post("", response_model=CameraConfig, status_code=status.HTTP_201_CREATED)
async def add_camera(camera: CameraConfig):
    """Add new camera."""
    try:
        # Add to config
        config_service.add_camera(camera)

        # Add to camera manager if enabled
        if camera.enabled:
            camera_manager.add_camera(camera)

        return camera
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put("/{camera_id}", response_model=CameraConfig)
async def update_camera(camera_id: str, camera: CameraConfig):
    """Update camera configuration."""
    if camera.id != camera_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Camera ID mismatch"
        )

    try:
        # Update in config
        config_service.update_camera(camera)

        # Update in camera manager
        if camera.id in [c.id for c in camera_manager.get_all_cameras().values()]:
            camera_manager.remove_camera(camera.id)

        if camera.enabled:
            camera_manager.add_camera(camera)

        return camera
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )


@router.delete("/{camera_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_camera(camera_id: str):
    """Delete camera."""
    # Remove from camera manager
    if camera_id in [c.id for c in camera_manager.get_all_cameras().values()]:
        camera_manager.remove_camera(camera_id)

    # Delete from config
    if not config_service.delete_camera(camera_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )


@router.get("/{camera_id}/status")
async def get_camera_status(camera_id: str):
    """Get camera status."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )

    status_info = camera_manager.get_status(camera_id)
    if status_info is None:
        return {
            "id": camera_id,
            "online": False,
            "enabled": camera.enabled,
            "fps": 0,
            "message": "Not initialized"
        }

    return status_info


@router.post("/{camera_id}/start")
async def start_camera(camera_id: str):
    """Start camera stream."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )

    success = camera_manager.start_camera(camera_id)
    if success:
        return {"message": f"Camera {camera_id} started"}
    return {"message": f"Failed to start camera {camera_id}"}, 500


@router.post("/{camera_id}/stop")
async def stop_camera(camera_id: str):
    """Stop camera stream."""
    success = camera_manager.stop_camera(camera_id)
    if success:
        return {"message": f"Camera {camera_id} stopped"}
    return {"message": f"Camera {camera_id} not running"}


@router.get("/{camera_id}/test")
async def test_camera_connection(camera_id: str):
    """Test camera connection."""
    camera = config_service.get_camera(camera_id)
    if not camera:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Camera {camera_id} not found"
        )

    # Test connection
    result = camera_manager.test_connection(camera_id)

    return {
        "camera_id": camera_id,
        "rtsp_url": camera.rtsp_url,
        **result
    }


@router.get("/status/all")
async def get_all_cameras_status():
    """Get status of all cameras."""
    return camera_manager.get_all_status()
