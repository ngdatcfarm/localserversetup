"""Training Routes - Manage YOLOv8 model training with progress tracking."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from src.ai.training_service import training_service

router = APIRouter(prefix="/api/ml/training", tags=["ml-training"])


class TrainRequest(BaseModel):
    epochs: int = 150
    imgsz: int = 640


class TrainResponse(BaseModel):
    success: bool
    message: str
    dataset_images: int = 0


@router.get("/status")
async def get_status():
    """Get training status and dataset stats."""
    stats = await training_service.get_dataset_stats()
    progress = await training_service.get_progress()
    return {
        "training": training_service.is_training,
        "last_trained": training_service.last_training_time.isoformat() if training_service.last_training_time else None,
        "last_model_path": training_service.last_model_path,
        "model_exists": training_service.model_exists(),
        "dataset": stats,
        "progress": progress,
    }


@router.get("/progress")
async def get_progress():
    """Get current training progress."""
    return await training_service.get_progress()


@router.post("/export")
async def export_dataset():
    """Export current dataset to YOLO format with train/val split."""
    result = await training_service.export_dataset(use_split=True)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.post("/train")
async def start_training(data: TrainRequest = TrainRequest()):
    """Start YOLOv8 training on current dataset with full augmentation."""
    if training_service.is_training:
        raise HTTPException(status_code=400, detail="Training already in progress")

    result = await training_service.start_training(
        epochs=data.epochs,
        imgsz=data.imgsz,
    )
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["message"])
    return result


@router.get("/model")
async def get_model_info():
    """Get information about available model."""
    model_path = training_service.get_model_path()
    if not model_path:
        return {"exists": False, "message": "No trained model available"}
    return {
        "exists": True,
        "path": model_path,
        "last_trained": training_service.last_training_time.isoformat() if training_service.last_training_time else None,
    }