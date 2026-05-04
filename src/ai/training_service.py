"""Training Service - Manage YOLOv8 model training with augmentation."""

import asyncio
import logging
import shutil
import zipfile
from pathlib import Path
from datetime import datetime
from typing import Optional

from src.services.database.db import db

logger = logging.getLogger(__name__)

DATASET_DIR = Path("E:/AI/Dataset")
EXPORT_DIR = Path("E:/AI/Dataset/exported")
MODEL_DIR = Path("E:/AI/models/chick_detector")

EXPORT_DIR.mkdir(parents=True, exist_ok=True)

# RTX 1650 4GB optimized training config
TRAINING_CONFIG = {
    'model': 'yolov8n.pt',
    'epochs': 150,
    'imgsz': 640,
    'batch': 8,  # RTX 1650 4GB: safe batch size
    'patience': 50,  # Quality: wait longer before early stop
    'save': True,
    'save_period': 10,  # Save checkpoint every 10 epochs
    'device': 0,  # GPU 0

    # Augmentation - Quality focused
    'hsv_h': 0.015,   # Hue shift ±1.5%
    'hsv_s': 0.7,     # Saturation ±70%
    'hsv_v': 0.4,     # Value ±40%
    'flip': 0.5,      # Horizontal flip 50%
    'mosaic': 1.0,    # Mosaic 100%
    'mixup': 0.15,    # MixUp 15%
    'degrees': 10,    # Rotate ±10°
    'translate': 0.1,  # Translate ±10%
    'scale': 0.5,     # Scale ±50%
    'shear': 2,       # Shear ±2°
    'copy_paste': 0.1,  # Copy-paste augmentation
}


class TrainingService:
    """Manage dataset export and YOLOv8 training."""

    def __init__(self):
        self._training = False
        self._last_training_time: Optional[datetime] = None
        self._last_model_path: Optional[str] = None
        # Progress tracking
        self._current_epoch = 0
        self._total_epochs = 0
        self._current_loss = 0.0
        self._current_map50 = 0.0

    @property
    def is_training(self) -> bool:
        return self._training

    @property
    def last_training_time(self) -> Optional[datetime]:
        return self._last_training_time

    @property
    def last_model_path(self) -> Optional[str]:
        return self._last_model_path

    async def get_dataset_stats(self) -> dict:
        """Get current dataset statistics."""
        total = await db.fetchval(
            "SELECT COUNT(*) FROM ml_dataset_images WHERE is_active = TRUE"
        ) or 0
        verified = await db.fetchval(
            "SELECT COUNT(*) FROM ml_dataset_images WHERE is_active = TRUE AND label_status = 'verified'"
        ) or 0
        labeled = await db.fetchval(
            "SELECT COUNT(*) FROM ml_dataset_images WHERE is_active = TRUE AND label_status = 'labeled'"
        ) or 0
        total_bboxes = await db.fetchval(
            "SELECT COUNT(*) FROM ml_dataset_labels"
        ) or 0

        # Count train/val split
        train_count = await db.fetchval(
            "SELECT COUNT(*) FROM ml_dataset_images WHERE is_active = TRUE AND split = 'train' AND label_status != 'unlabeled'"
        ) or 0
        val_count = await db.fetchval(
            "SELECT COUNT(*) FROM ml_dataset_images WHERE is_active = TRUE AND split = 'val' AND label_status != 'unlabeled'"
        ) or 0

        model_exists = (MODEL_DIR / "weights" / "best.pt").exists()
        last_trained = None
        if model_exists and self._last_training_time:
            last_trained = self._last_training_time.isoformat()

        return {
            "total_images": total,
            "verified_images": verified,
            "labeled_images": labeled,
            "total_bboxes": total_bboxes,
            "train_images": train_count,
            "val_images": val_count,
            "model_exists": model_exists,
            "last_trained": last_trained,
            "model_path": str(MODEL_DIR / "weights" / "best.pt") if model_exists else None,
        }

    async def get_progress(self) -> dict:
        """Get current training progress."""
        return {
            "training": self._training,
            "current_epoch": self._current_epoch,
            "total_epochs": self._total_epochs,
            "loss": self._current_loss,
            "mAP50": self._current_map50,
            "progress_pct": (self._current_epoch / self._total_epochs * 100) if self._total_epochs > 0 else 0,
        }

    async def export_dataset(self, use_split: bool = True) -> dict:
        """
        Export labeled images to YOLO format with optional train/val split.

        Args:
            use_split: If True, use 'split' column to separate train/val sets
        """
        # Clear old export
        if EXPORT_DIR.exists():
            shutil.rmtree(EXPORT_DIR)
        EXPORT_DIR.mkdir(parents=True, exist_ok=True)
        (EXPORT_DIR / "images" / "train").mkdir(parents=True, exist_ok=True)
        (EXPORT_DIR / "images" / "val").mkdir(parents=True, exist_ok=True)
        (EXPORT_DIR / "labels" / "train").mkdir(parents=True, exist_ok=True)
        (EXPORT_DIR / "labels" / "val").mkdir(parents=True, exist_ok=True)

        # Get all images with labels (verified or labeled)
        query = """
            SELECT i.*, l.class_name, l.x_center, l.y_center, l.width, l.height
            FROM ml_dataset_images i
            LEFT JOIN ml_dataset_labels l ON i.id = l.image_id
            WHERE i.is_active = TRUE AND i.label_status IN ('verified', 'labeled')
            ORDER BY i.id
        """
        rows = await db.fetch(query)

        if not rows:
            return {"success": False, "message": "No labeled images to export"}

        # Group by image
        images_data = {}
        for row in rows:
            img_id = row["id"]
            if img_id not in images_data:
                images_data[img_id] = {
                    "filepath": row["filepath"],
                    "split": row.get("split", "train") if use_split else "train",
                    "labels": []
                }
            if row["x_center"] is not None:
                images_data[img_id]["labels"].append(row)

        # Export images and labels
        exported_train = 0
        exported_val = 0

        for img_id, img_data in images_data.items():
            img_path = Path(img_data["filepath"])
            if not img_path.exists():
                continue

            split = img_data["split"] if use_split else "train"
            img_name = img_path.stem
            ext = img_path.suffix

            # Copy image to split folder
            new_img_path = EXPORT_DIR / "images" / split / f"{img_name}{ext}"
            shutil.copy(str(img_path), str(new_img_path))

            # Write label file
            if img_data["labels"]:
                label_lines = []
                for label in img_data["labels"]:
                    # Determine class ID
                    class_name = label.get("class_name", "chick").lower()
                    class_id = 0 if "chick" in class_name else (1 if "feeder" in class_name else 0)
                    label_lines.append(
                        f"{class_id} {label['x_center']:.6f} {label['y_center']:.6f} "
                        f"{label['width']:.6f} {label['height']:.6f}"
                    )
                label_file = EXPORT_DIR / "labels" / split / f"{img_name}.txt"
                label_file.write_text("\n".join(label_lines))

            if split == "train":
                exported_train += 1
            else:
                exported_val += 1

        # Determine correct paths based on split usage
        if use_split:
            train_path = "images/train"
            val_path = "images/val"
        else:
            train_path = "images/train"
            val_path = "images/val"

        # Write dataset YAML
        yaml_content = f"""# Chick Detection Dataset - exported {datetime.now().isoformat()}
path: {str(EXPORT_DIR)}
train: {train_path}
val: {val_path}

names:
  0: chick
  1: feeder

nc: 2
"""
        (EXPORT_DIR / "dataset.yaml").write_text(yaml_content)

        return {
            "success": True,
            "exported_train": exported_train,
            "exported_val": exported_val,
            "export_dir": str(EXPORT_DIR),
        }

    async def start_training(self, epochs: int = 150, imgsz: int = 640) -> dict:
        """Start YOLOv8 training in background with full augmentation."""
        if self._training:
            return {"success": False, "message": "Training already in progress"}

        # Check dataset
        stats = await self.get_dataset_stats()
        if stats["total_bboxes"] < 5:
            return {"success": False, "message": f"Not enough labeled data ({stats['total_bboxes']} bboxes). Need at least 5."}

        # Export dataset with split
        export_result = await self.export_dataset(use_split=True)
        if not export_result["success"]:
            return export_result

        # Start training in background
        self._training = True
        self._total_epochs = epochs
        self._current_epoch = 0
        self._current_loss = 0.0
        self._current_map50 = 0.0
        asyncio.create_task(self._run_training(epochs, imgsz))

        return {
            "success": True,
            "message": f"Training started with {epochs} epochs (patience={TRAINING_CONFIG['patience']})",
            "dataset_images": export_result["exported_train"] + export_result["exported_val"],
            "train_images": export_result["exported_train"],
            "val_images": export_result["exported_val"],
        }

    async def _run_training(self, epochs: int, imgsz: int):
        """Run YOLOv8 training (runs in background with progress tracking)."""
        try:
            from ultralytics import YOLO
            import torch

            logger.info(f"Starting YOLOv8 training: epochs={epochs}, imgsz={imgsz}")
            logger.info(f"Using GPU: {torch.cuda.is_available()}, CUDA: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'N/A'}")

            # Load pretrained model
            model = YOLO('yolov8n.pt')

            # Train with full augmentation config
            results = model.train(
                data=str(EXPORT_DIR / "dataset.yaml"),
                epochs=epochs,
                imgsz=imgsz,
                batch=TRAINING_CONFIG['batch'],
                patience=TRAINING_CONFIG['patience'],
                save=True,
                save_period=TRAINING_CONFIG['save_period'],
                project=str(MODEL_DIR.parent),
                name="chick_detector",
                exist_ok=True,
                verbose=True,
                # Augmentation parameters
                hsv_h=TRAINING_CONFIG['hsv_h'],
                hsv_s=TRAINING_CONFIG['hsv_s'],
                hsv_v=TRAINING_CONFIG['hsv_v'],
                flipud=TRAINING_CONFIG['flip'],
                fliplr=TRAINING_CONFIG['flip'],
                mosaic=TRAINING_CONFIG['mosaic'],
                mixup=TRAINING_CONFIG['mixup'],
                degrees=TRAINING_CONFIG['degrees'],
                translate=TRAINING_CONFIG['translate'],
                scale=TRAINING_CONFIG['scale'],
                shear=TRAINING_CONFIG['shear'],
                copy_paste=TRAINING_CONFIG['copy_paste'],
            )

            self._last_training_time = datetime.now()
            best_path = MODEL_DIR / "weights" / "best.pt"
            if best_path.exists():
                self._last_model_path = str(best_path)
                logger.info(f"Training complete! Model saved to: {self._last_model_path}")
            else:
                logger.warning("Training completed but best.pt not found")

            # Try to get final metrics
            try:
                if hasattr(results, 'results_dict'):
                    self._current_map50 = results.results_dict.get('metrics/mAP50(B)', 0.0)
                    self._current_loss = results.results_dict.get('train/box_loss', 0.0)
            except:
                pass

        except Exception as e:
            logger.error(f"Training failed: {e}")
        finally:
            self._training = False
            self._current_epoch = epochs  # Mark as complete

    def get_model_path(self) -> Optional[str]:
        """Get path to best trained model."""
        best_path = MODEL_DIR / "weights" / "best.pt"
        if best_path.exists():
            return str(best_path)
        return None

    def model_exists(self) -> bool:
        """Check if trained model exists."""
        return (MODEL_DIR / "weights" / "best.pt").exists()


training_service = TrainingService()