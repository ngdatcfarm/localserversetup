"""AI Counting Service - YOLOv8 on CUDA for object counting."""

import cv2
import logging
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

import torch
from ultralytics import YOLO

logger = logging.getLogger(__name__)

# COCO class IDs relevant to chickens/birds
# Class 0 = person, 14 = bird, 15 = cat, 16 = dog
# For chickens specifically, we may need to filter bird detections
COCO_BIRD_CLASS = 14

@dataclass
class CountResult:
    success: bool
    count: int
    method: str  # "max", "avg", "single"
    images_processed: int
    frame_counts: list[int]
    confidence_threshold: float
    message: str
    objects: list[dict] = None


class AICountingService:
    """YOLOv8-based object counting with GPU acceleration."""

    def __init__(self, model_name: str = "yolov8n.pt", confidence: float = 0.1):
        self.model_name = model_name
        self.confidence = confidence
        self._model: Optional[YOLO] = None
        self._device = "cuda" if torch.cuda.is_available() else "cpu"
        logger.info(f"AICountingService: device={self._device}, model={model_name}")

    def _load_model(self):
        """Lazy load YOLO model."""
        if self._model is None:
            logger.info(f"Loading YOLOv8 model: {self.model_name}")
            self._model = YOLO(self.model_name)
            self._model.to(self._device)

    def count_from_image(self, image_path: str, class_filter: list[int] = None) -> dict:
        """
        Count objects in a single image.

        Args:
            image_path: Path to image file
            class_filter: List of COCO class IDs to count (None = all)

        Returns:
            dict with count, boxes, etc.
        """
        self._load_model()

        results = self._model(image_path, verbose=False, conf=self.confidence)[0]

        boxes = results.boxes
        if class_filter is not None:
            # Filter by class
            filtered = [b for b in boxes if int(b.cls[0]) in class_filter]
            count = len(filtered)
            return {
                "count": count,
                "boxes": [b.xyxy.tolist() for b in filtered],
                "confidences": [float(b.conf[0]) for b in filtered],
            }
        else:
            return {
                "count": len(boxes),
                "boxes": [b.xyxy.tolist() for b in boxes],
                "confidences": [float(b.conf[0]) for b in boxes],
                "classes": [int(b.cls[0]) for b in boxes],
            }

    def generate_debug_image(self, image_path: str, class_filter: list[int] = None) -> str:
        """
        Generate debug image with bounding boxes drawn.
        Returns path to debug image.
        """
        self._load_model()
        results = self._model(image_path, verbose=False, conf=self.confidence)[0]
        boxes = results.boxes

        if class_filter is not None:
            filtered = [b for b in boxes if int(b.cls[0]) in class_filter]
        else:
            filtered = boxes

        # Read image and draw boxes
        img = cv2.imread(image_path)
        if img is None:
            logger.error(f"Failed to read image: {image_path}")
            return None

        for i, box in enumerate(filtered):
            xyxy = box.xyxy[0].tolist()
            conf = float(box.conf[0])
            x1, y1, x2, y2 = map(int, xyxy)

            # Draw rectangle
            cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
            # Draw label
            label = f"{conf:.2f}"
            cv2.putText(img, label, (x1, y1 - 5), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 1)

        # Save debug image
        p = Path(image_path)
        debug_path = p.parent / f"{p.stem}_yolo_debug.jpg"
        cv2.imwrite(str(debug_path), img)
        logger.info(f"Debug image saved: {debug_path}")
        return str(debug_path)

    def count_from_paths(self, image_paths: list[str], class_filter: list[int] = None, count_method: str = "max") -> CountResult:
        """
        Count objects from multiple images (burst).

        Args:
            image_paths: List of image file paths
            class_filter: List of COCO class IDs to count
            count_method: "max" (take max across frames), "avg" (average), "single" (first frame)

        Returns:
            CountResult dataclass
        """
        self._load_model()

        frame_counts = []
        all_objects = []

        for path in image_paths:
            if not Path(path).exists():
                logger.warning(f"Image not found: {path}")
                continue

            try:
                result = self.count_from_image(path, class_filter)
                frame_counts.append(result["count"])
                all_objects.extend([
                    {"path": path, "count": result["count"], "boxes": result.get("boxes", [])}
                ])
            except Exception as e:
                logger.error(f"Count error for {path}: {e}")

        if not frame_counts:
            return CountResult(
                success=False, count=0, method=count_method,
                images_processed=0, frame_counts=[], confidence_threshold=self.confidence,
                message="No images processed"
            )

        # Apply count method
        if count_method == "max":
            final_count = max(frame_counts)
        elif count_method == "avg":
            final_count = int(sum(frame_counts) / len(frame_counts))
        elif count_method == "single":
            final_count = frame_counts[0]
        else:
            final_count = max(frame_counts)

        return CountResult(
            success=True,
            count=final_count,
            method=count_method,
            images_processed=len(frame_counts),
            frame_counts=frame_counts,
            confidence_threshold=self.confidence,
            message=f"Counted {final_count} objects from {len(frame_counts)} frames",
            objects=all_objects,
        )

    def count_chickens_from_paths(self, image_paths: list[str], count_method: str = "max") -> CountResult:
        """
        Count chickens (birds in COCO) from multiple images.

        COCO class 14 = bird
        For chicken-specific detection, you'd need a custom trained model.
        """
        # COCO bird class
        return self.count_from_paths(image_paths, class_filter=[14], count_method=count_method)


# Global instance - low confidence for better detection
ai_counting_service = AICountingService(model_name="yolov8n.pt", confidence=0.05)