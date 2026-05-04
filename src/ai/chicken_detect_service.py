"""Chicken Detection Service - YOLO-based detection with density analysis.

This service uses a trained YOLO model to:
- Detect chickens and feeders in camera frames
- Count total chickens
- Calculate chickens near each feeder
- Generate density grid heatmap
- Provide confidence distribution for debugging
"""

import cv2
import numpy as np
import logging
from pathlib import Path
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Any

logger = logging.getLogger(__name__)


@dataclass
class BoundingBox:
    """Represents a single bounding box detection."""
    cls: int
    conf: float
    x1: float
    y1: float
    x2: float
    y2: float
    cx: float
    cy: float


@dataclass
class DetectResult:
    success: bool
    total_chickens: int
    total_feeders: int
    feeder_counts: list
    density_grid: list
    density_max: int
    density_level: str
    debug_image: str = None
    message: str = ""
    # Enhanced debug fields
    confidence_distribution: Dict[str, int] = field(default_factory=dict)
    avg_confidence: float = 0.0
    all_boxes: List[Dict[str, Any]] = field(default_factory=list)
    class_names: Dict[int, str] = field(default_factory=lambda: {0: 'chick', 1: 'feeder'})


class ChickenDetectService:
    """YOLO-based chicken detection with density analysis."""

    def __init__(self):
        self._model = None
        self._model_path = None
        self._radius_px = 150  # Bán kính đếm gà quanh máng (pixel)

    def load_model(self, model_path: str = None) -> bool:
        """Load YOLO model."""
        if model_path is None:
            model_path = "E:/AI/models/chick_detector/weights/best.pt"

        if not Path(model_path).exists():
            logger.warning(f"Model not found: {model_path}")
            return False

        try:
            from ultralytics import YOLO
            self._model = YOLO(model_path)
            self._model_path = model_path
            logger.info(f"Loaded YOLO model: {model_path}")
            return True
        except Exception as e:
            logger.error(f"Failed to load YOLO model: {e}")
            return False

    def set_radius(self, radius_px: int):
        """Set bán kính đếm gà quanh máng."""
        self._radius_px = radius_px

    def detect_from_image(self, image_path: str, conf: float = 0.01, grid_size: int = 4) -> DetectResult:
        """Detect chickens in a single image with enhanced debug info."""
        if not Path(image_path).exists():
            return DetectResult(
                success=False, total_chickens=0, total_feeders=0,
                feeder_counts=[], density_grid=[], density_max=0,
                density_level="N/A", message=f"Image not found: {image_path}"
            )

        img = cv2.imread(image_path)
        if img is None:
            return DetectResult(
                success=False, total_chickens=0, total_feeders=0,
                feeder_counts=[], density_grid=[], density_max=0,
                density_level="N/A", message=f"Failed to read image: {image_path}"
            )

        h, w = img.shape[:2]

        # Load model if not loaded
        if self._model is None:
            if not self.load_model():
                return DetectResult(
                    success=False, total_chickens=0, total_feeders=0,
                    feeder_counts=[], density_grid=[], density_max=0,
                    density_level="N/A", message="No model available"
                )

        # Run inference
        try:
            results = self._model(image_path, conf=conf, verbose=False)[0]
        except Exception as e:
            return DetectResult(
                success=False, total_chickens=0, total_feeders=0,
                feeder_counts=[], density_grid=[], density_max=0,
                density_level="N/A", message=f"Inference error: {e}"
            )

        # Parse all detections for enhanced debug
        all_boxes: List[BoundingBox] = []
        chickens: List[tuple] = []
        feeders: List[tuple] = []

        for box in results.boxes:
            cls = int(box.cls[0])
            confidence = float(box.conf[0])
            xyxy = box.xyxy[0].cpu().numpy()

            bb = BoundingBox(
                cls=cls,
                conf=confidence,
                x1=float(xyxy[0]),
                y1=float(xyxy[1]),
                x2=float(xyxy[2]),
                y2=float(xyxy[3]),
                cx=float((xyxy[0] + xyxy[2]) / 2),
                cy=float((xyxy[1] + xyxy[3]) / 2),
            )
            all_boxes.append(bb)

            if cls == 0:  # chick
                chickens.append((bb.cx, bb.cy))
            elif cls == 1:  # feeder
                feeders.append((bb.cx, bb.cy))

        # Calculate confidence distribution
        conf_dist = {"0.5+": 0, "0.6+": 0, "0.7+": 0, "0.8+": 0, "0.9+": 0}
        for b in all_boxes:
            if b.conf >= 0.9:
                conf_dist["0.9+"] += 1
            elif b.conf >= 0.8:
                conf_dist["0.8+"] += 1
            elif b.conf >= 0.7:
                conf_dist["0.7+"] += 1
            elif b.conf >= 0.6:
                conf_dist["0.6+"] += 1
            elif b.conf >= 0.5:
                conf_dist["0.5+"] += 1

        avg_conf = float(np.mean([b.conf for b in all_boxes])) if all_boxes else 0.0

        # Count chickens near each feeder
        feeder_counts: List[int] = []
        for fx, fy in feeders:
            count = 0
            for cx, cy in chickens:
                dist = np.sqrt((cx - fx)**2 + (cy - fy)**2)
                if dist < self._radius_px:
                    count += 1
            feeder_counts.append(count)

        # Calculate density grid
        density_grid = self._calc_density_grid(chickens, w, h, grid_size)
        density_max = int(max(density_grid.flat)) if density_grid.size > 0 else 0

        # Determine density level
        total = len(chickens)
        if total == 0:
            density_level = "Thưa"
        elif total < 20:
            density_level = "Bình thường"
        elif total < 50:
            density_level = "Đông"
        else:
            density_level = "Rất đông"

        # Generate debug image with bounding boxes
        debug_path = self._draw_debug(img, all_boxes, feeder_counts, density_grid, conf_dist, avg_conf)

        # Serialize all boxes
        all_boxes_data = [
            {
                "class": b.cls,
                "class_name": self.class_names.get(b.cls, "unknown"),
                "conf": round(b.conf, 4),
                "xyxy": [round(b.x1, 1), round(b.y1, 1), round(b.x2, 1), round(b.y2, 1)],
                "center": [round(b.cx, 1), round(b.cy, 1)],
            }
            for b in all_boxes
        ]

        return DetectResult(
            success=True,
            total_chickens=len(chickens),
            total_feeders=len(feeders),
            feeder_counts=[int(x) for x in feeder_counts],
            density_grid=density_grid.tolist(),
            density_max=density_max,
            density_level=density_level,
            debug_image=debug_path,
            message=f"Detected {len(chickens)} chickens, {len(feeders)} feeders",
            confidence_distribution=conf_dist,
            avg_confidence=round(avg_conf, 4),
            all_boxes=all_boxes_data,
        )

    def _calc_density_grid(self, points: list, img_w: int, img_h: int, grid_size: int) -> np.ndarray:
        """Calculate density grid for given points."""
        density = np.zeros((grid_size, grid_size), dtype=int)
        cell_w = img_w / grid_size
        cell_h = img_h / grid_size

        for cx, cy in points:
            col = min(int(cx / cell_w), grid_size - 1)
            row = min(int(cy / cell_h), grid_size - 1)
            if 0 <= row < grid_size and 0 <= col < grid_size:
                density[row, col] += 1

        return density

    def _draw_debug(
        self,
        img,
        boxes: List[BoundingBox],
        feeder_counts: List[int],
        density_grid: np.ndarray,
        conf_dist: Dict[str, int],
        avg_conf: float
    ) -> Optional[str]:
        """Draw bounding boxes and debug info on image."""
        try:
            h, w = img.shape[:2]

            # Draw each box with class-specific colors
            for box in boxes:
                color = (0, 255, 0) if box.cls == 0 else (0, 255, 255)  # Green=chick, Yellow=feeder
                label = f"{self.class_names.get(box.cls, 'obj')}:{box.conf:.2f}"

                # Draw box
                cv2.rectangle(img, (int(box.x1), int(box.y1)), (int(box.x2), int(box.y2)), color, 2)
                # Draw label background
                (label_w, label_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
                cv2.rectangle(img, (int(box.x1), int(box.y1) - label_h - 4),
                            (int(box.x1) + label_w, int(box.y1)), color, -1)
                cv2.putText(img, label, (int(box.x1), int(box.y1) - 2),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1)

            # Add info panel at top-left
            y = 30
            info_lines = [
                f"Chickens: {sum(1 for b in boxes if b.cls == 0)}",
                f"Feeders: {sum(1 for b in boxes if b.cls == 1)}",
                f"Avg conf: {avg_conf:.3f}",
            ]
            for line in info_lines:
                cv2.putText(img, line, (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)
                y += 25

            # Feeder counts
            y += 10
            for i, cnt in enumerate(feeder_counts):
                cv2.putText(img, f"Feeder {i+1}: {cnt} chicks", (10, y),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                y += 25

            # Confidence distribution
            y += 10
            cv2.putText(img, "Conf dist:", (10, y), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
            y += 20
            for thresh, count in conf_dist.items():
                cv2.putText(img, f"  {thresh}: {count}", (10, y),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
                y += 18

            # Save debug image
            debug_path = str(Path("E:/AI/Snapshots") / f"yolo_debug_{cv2.imread.__name__ if hasattr(cv2, 'imread') else 'detect'}.jpg")
            cv2.imwrite(debug_path, img)

            return debug_path.replace("E:\\AI\\Snapshots\\", "").replace("\\", "/")
        except Exception as e:
            logger.error(f"Failed to draw debug: {e}")
            return None


# Global instance
chicken_detect_service = ChickenDetectService()