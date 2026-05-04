"""Density Counting Service - Count objects using pixel density analysis.

For chicks: uses color segmentation (yellow/white) + pixel counting.
No ML model required - fast and works well for dense populations.
"""

import cv2
import numpy as np
import logging
from pathlib import Path
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class DensityResult:
    success: bool
    total_pixels: int
    contour_count: int
    estimated_count: int
    avg_pixels_per_object: float
    pixel_percentage: float
    image_width: int
    image_height: int
    debug_image_path: str = None
    config: dict = None
    message: str = ""


class DensityCountingService:
    """Count objects using pixel density from color segmentation."""

    def __init__(self):
        # Default chick color range (HSV)
        self._lower_hsv = np.array([10, 30, 60])
        self._upper_hsv = np.array([40, 255, 255])
        self._min_area = 100  # min contour area in pixels
        self._max_area = 100000  # max contour area

    def update_color_range(self, lower_hsv: list, upper_hsv: list):
        """Update HSV color range for segmentation."""
        self._lower_hsv = np.array(lower_hsv)
        self._upper_hsv = np.array(upper_hsv)

    def update_area_range(self, min_area: int, max_area: int):
        """Update min/max contour area filters."""
        self._min_area = min_area
        self._max_area = max_area

    def set_calibration(self, avg_pixels_per_object: float):
        """Set calibration: avg pixels per single object."""
        self._avg_pixels_per_object = avg_pixels_per_object

    def create_mask_preview(self, image_path: str, config: dict = None) -> dict:
        """
        Create a mask preview image for calibration.
        Returns dict with mask image path and stats.
        """
        config = config or {}

        if not Path(image_path).exists():
            return {"success": False, "error": "Image not found"}

        img = cv2.imread(image_path)
        if img is None:
            return {"success": False, "error": "Failed to read image"}

        h, w = img.shape[:2]
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

        # Support multiple HSV ranges
        ranges = config.get("hsv_ranges", [{
            "lower": config.get("lower_hsv", [10, 30, 60]),
            "upper": config.get("upper_hsv", [40, 255, 255]),
        }])

        # Combine all masks
        combined_mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
        for r in ranges:
            lower = np.array(r.get("lower", [10, 30, 60]))
            upper = np.array(r.get("upper", [40, 255, 255]))
            mask = cv2.inRange(hsv, lower, upper)
            combined_mask = cv2.bitwise_or(combined_mask, mask)

        # Morphology cleanup
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, kernel)
        combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_OPEN, kernel)

        # Create colored mask overlay
        mask_colored = cv2.cvtColor(combined_mask, cv2.COLOR_GRAY2BGR)
        # Blend with original
        overlay = cv2.addWeighted(img, 0.7, mask_colored, 0.3, 0)

        # Save preview
        p = Path(image_path)
        preview_path = p.parent / f"{p.stem}_mask_preview.jpg"
        cv2.imwrite(str(preview_path), overlay)

        total_pixels = cv2.countNonZero(combined_mask)
        pixel_pct = (total_pixels / (w * h)) * 100 if w * h > 0 else 0

        return {
            "success": True,
            "preview_image": str(preview_path).replace("E:\\AI\\Snapshots\\", "").replace("\\", "/"),
            "total_pixels": total_pixels,
            "pixel_percentage": round(pixel_pct, 2),
            "image_width": w,
            "image_height": h,
        }

    def count_from_image_multirange(self, image_path: str, config: dict = None) -> DensityResult:
        """
        Count using multiple HSV ranges for better coverage.
        """
        config = config or {}

        if not Path(image_path).exists():
            return DensityResult(
                success=False, total_pixels=0, contour_count=0,
                estimated_count=0, avg_pixels_per_object=0,
                pixel_percentage=0, image_width=0, image_height=0,
                debug_image_path=None,
                config=config, message=f"Image not found: {image_path}"
            )

        img = cv2.imread(image_path)
        if img is None:
            return DensityResult(
                success=False, total_pixels=0, contour_count=0,
                estimated_count=0, avg_pixels_per_object=0,
                pixel_percentage=0, image_width=0, image_height=0,
                debug_image_path=None,
                config=config, message=f"Failed to read image: {image_path}"
            )

        h, w = img.shape[:2]
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

        # Multiple HSV ranges for different chick colors
        ranges = config.get("hsv_ranges", [
            {"lower": [10, 30, 60], "upper": [40, 255, 255]},   # Yellow chicks
            {"lower": [0, 0, 180], "upper": [180, 30, 255]},   # White chicks
            {"lower": [10, 50, 30], "upper": [30, 255, 150]},  # Brown chicks
        ])

        # Combine all masks
        combined_mask = np.zeros(hsv.shape[:2], dtype=np.uint8)
        for r in ranges:
            lower = np.array(r.get("lower", [10, 30, 60]))
            upper = np.array(r.get("upper", [40, 255, 255]))
            mask = cv2.inRange(hsv, lower, upper)
            combined_mask = cv2.bitwise_or(combined_mask, mask)

        # Morphology cleanup
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_CLOSE, kernel)
        combined_mask = cv2.morphologyEx(combined_mask, cv2.MORPH_OPEN, kernel)

        # Find contours
        contours, _ = cv2.findContours(combined_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        min_area = config.get("min_area", self._min_area)
        max_area = config.get("max_area", self._max_area)
        valid_contours = [c for c in contours if min_area < cv2.contourArea(c) < max_area]

        total_pixels = cv2.countNonZero(combined_mask)
        avg_pixels = config.get("avg_pixels_per_object", 3000)
        estimated_count = int(round(total_pixels / avg_pixels)) if avg_pixels > 0 else 0
        pixel_pct = (total_pixels / (w * h)) * 100 if w * h > 0 else 0

        # Generate debug image
        debug_path = None
        if valid_contours:
            debug_img = img.copy()
            cv2.drawContours(debug_img, valid_contours, -1, (0, 255, 0), 2)
            label = f"Est: {estimated_count} | Pixels: {total_pixels} | Regions: {len(valid_contours)}"
            cv2.putText(debug_img, label, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            debug_path = str(Path(image_path).with_suffix('.debug.jpg'))
            cv2.imwrite(debug_path, debug_img)

        return DensityResult(
            success=True,
            total_pixels=total_pixels,
            contour_count=len(valid_contours),
            estimated_count=estimated_count,
            avg_pixels_per_object=avg_pixels,
            pixel_percentage=round(pixel_pct, 2),
            image_width=w,
            image_height=h,
            debug_image_path=debug_path,
            config=config,
            message=f"Multi-range: {estimated_count} from {total_pixels} pixels"
        )

    def count_from_image(self, image_path: str, config: dict = None) -> DensityResult:
        """
        Count objects using density analysis.

        Args:
            image_path: Path to image file
            config: Optional overrides:
                - avg_pixels_per_object: calibration value
                - lower_hsv, upper_hsv: color range
                - min_area, max_area: contour filtering
        """
        config = config or {}

        if not Path(image_path).exists():
            return DensityResult(
                success=False, total_pixels=0, contour_count=0,
                estimated_count=0, avg_pixels_per_object=0,
                pixel_percentage=0, image_width=0, image_height=0,
                debug_image_path=None,
                config=config, message=f"Image not found: {image_path}"
            )

        img = cv2.imread(image_path)
        if img is None:
            return DensityResult(
                success=False, total_pixels=0, contour_count=0,
                estimated_count=0, avg_pixels_per_object=0,
                pixel_percentage=0, image_width=0, image_height=0,
                debug_image_path=None,
                config=config, message=f"Failed to read image: {image_path}"
            )

        h, w = img.shape[:2]

        # Color segmentation in HSV
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

        lower = np.array(config.get("lower_hsv", [10, 30, 60]))
        upper = np.array(config.get("upper_hsv", [40, 255, 255]))
        min_area = config.get("min_area", self._min_area)
        max_area = config.get("max_area", self._max_area)

        # Create mask
        mask = cv2.inRange(hsv, lower, upper)

        # Clean up with morphology
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

        # Find contours
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Filter by area
        valid_contours = [c for c in contours if min_area < cv2.contourArea(c) < max_area]

        # Total chick pixels
        total_pixels = cv2.countNonZero(mask)
        contour_count = len(valid_contours)

        # Estimate count using pixel density
        avg_pixels = config.get("avg_pixels_per_object", 3000)  # default calibration
        estimated_count = int(round(total_pixels / avg_pixels)) if avg_pixels > 0 else 0

        pixel_pct = (total_pixels / (w * h)) * 100 if w * h > 0 else 0

        # Generate debug image with contours
        debug_path = None
        if valid_contours:
            debug_img = img.copy()
            # Draw all valid contours
            cv2.drawContours(debug_img, valid_contours, -1, (0, 255, 0), 2)
            # Add text overlay with count
            label = f"Est: {estimated_count} | Pixels: {total_pixels} | Regions: {contour_count}"
            cv2.putText(debug_img, label, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)
            # Add mask preview (grayscale)
            mask_preview = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGR)
            debug_path = str(Path(image_path).with_suffix('.debug.jpg'))
            cv2.imwrite(debug_path, debug_img)
            logger.info(f"Debug image saved: {debug_path}")

        return DensityResult(
            success=True,
            total_pixels=total_pixels,
            contour_count=contour_count,
            estimated_count=estimated_count,
            avg_pixels_per_object=avg_pixels,
            pixel_percentage=round(pixel_pct, 2),
            image_width=w,
            image_height=h,
            debug_image_path=debug_path,
            config=config,
            message=f"Estimated {estimated_count} objects from {total_pixels} pixels (avg {avg_pixels} px/object)"
        )

    def count_from_paths(self, image_paths: list[str], config: dict = None, method: str = "max") -> DensityResult:
        """
        Count from multiple images using density analysis.

        Args:
            image_paths: List of image paths
            config: Configuration dict
            method: "max", "avg", or "single"

        Returns:
            DensityResult with aggregated counts
        """
        config = config or {}
        results = []

        for path in image_paths:
            result = self.count_from_image(path, config)
            if result.success:
                results.append(result)

        if not results:
            return DensityResult(
                success=False, total_pixels=0, contour_count=0,
                estimated_count=0, avg_pixels_per_object=0,
                pixel_percentage=0, image_width=0, image_height=0,
                debug_image_path=None,
                config=config, message="No images processed"
            )

        if method == "max":
            est_count = max(r.estimated_count for r in results)
        elif method == "avg":
            est_count = int(round(sum(r.estimated_count for r in results) / len(results)))
        else:  # single
            est_count = results[0].estimated_count

        return DensityResult(
            success=True,
            total_pixels=sum(r.total_pixels for r in results),
            contour_count=sum(r.contour_count for r in results),
            estimated_count=est_count,
            avg_pixels_per_object=results[0].avg_pixels_per_object,
            pixel_percentage=sum(r.pixel_percentage for r in results) / len(results),
            image_width=results[0].image_width,
            image_height=results[0].image_height,
            debug_image_path=results[0].debug_image_path,  # Use first frame debug image
            config=config,
            message=f"Density count: {est_count} (method={method}, {len(results)} frames)"
        )


# Global instance
density_counting_service = DensityCountingService()