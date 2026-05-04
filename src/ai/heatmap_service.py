"""Heatmap Generation Service - Create density heatmaps from chicken detections."""

import cv2
import numpy as np
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


class HeatmapService:
    """Generate heatmaps from chicken centroid points."""

    def __init__(self):
        self.last_heatmap_path: Optional[str] = None

    def generate_heatmap(
        self,
        image_path: str,
        points: list,
        grid_size: int = 6,
        radius_factor: float = 0.15
    ) -> Optional[str]:
        """
        Generate a heatmap overlay from chicken centroids.

        Args:
            image_path: Path to the source image
            points: List of (cx, cy) tuples (pixel coordinates)
            grid_size: Number of cells in the grid (for visualization)
            radius_factor: Gaussian sigma as fraction of image dimension

        Returns:
            Path to the saved heatmap image, or None on error
        """
        try:
            img = cv2.imread(image_path)
            if img is None:
                logger.error(f"Failed to read image: {image_path}")
                return None

            h, w = img.shape[:2]

            # Create empty heatmap
            heatmap = np.zeros((h, w), dtype=np.float32)

            if not points:
                # No points - return grayscale version
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                output_path = image_path.replace('.jpg', '_heatmap.jpg').replace('.png', '_heatmap.png')
                cv2.imwrite(output_path, gray)
                self.last_heatmap_path = output_path
                return output_path

            # Calculate sigma based on image size
            sigma = max(w, h) * radius_factor

            # Draw gaussian influence for each point
            for cx, cy in points:
                # Clamp to image bounds
                cx = int(max(0, min(w - 1, cx)))
                cy = int(max(0, min(h - 1, cy)))

                # Create gaussian blob centered at this point
                kernel_size = int(sigma * 3)
                if kernel_size % 2 == 0:
                    kernel_size += 1
                kernel_size = max(3, kernel_size)

                # Create single-point gaussian
                blob = np.zeros((kernel_size, kernel_size), dtype=np.float32)
                ky, kx = kernel_size // 2, kernel_size // 2
                for i in range(kernel_size):
                    for j in range(kernel_size):
                        dist = np.sqrt((i - ky)**2 + (j - kx)**2)
                        blob[i, j] = np.exp(-dist**2 / (2 * (sigma/kernel_size)**2))

                # Calculate bounding box in image
                y1 = max(0, cy - kernel_size // 2)
                y2 = min(h, cy + kernel_size // 2 + 1)
                x1 = max(0, cx - kernel_size // 2)
                x2 = min(w, cx + kernel_size // 2 + 1)

                # Map kernel to region
                ky1 = y1 - (cy - kernel_size // 2)
                ky2 = ky1 + (y2 - y1)
                kx1 = x1 - (cx - kernel_size // 2)
                kx2 = kx1 + (x2 - x1)

                # Add blob to heatmap
                heatmap[y1:y2, x1:x2] += blob[ky1:ky2, kx1:kx2]

            # Normalize heatmap to 0-255
            max_val = heatmap.max()
            if max_val > 0:
                heatmap = (heatmap / max_val * 255).astype(np.uint8)
            else:
                heatmap = heatmap.astype(np.uint8)

            # Apply colormap (JET: blue=cold, red=hot)
            heatmap_color = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)

            # Create overlay with original image
            overlay = cv2.addWeighted(img, 0.6, heatmap_color, 0.4, 0)

            # Draw grid lines for better visualization
            cell_h = h // grid_size
            cell_w = w // grid_size
            for i in range(1, grid_size):
                cv2.line(overlay, (0, i * cell_h), (w, i * cell_h), (255, 255, 255), 1)
                cv2.line(overlay, (i * cell_w, 0), (i * cell_w, h), (255, 255, 255), 1)

            # Draw point markers
            for cx, cy in points:
                cx = int(max(0, min(w - 1, cx)))
                cy = int(max(0, min(h - 1, cy)))
                cv2.circle(overlay, (cx, cy), 3, (255, 255, 255), -1)

            # Save output
            output_path = image_path.replace('.jpg', '_heatmap.jpg').replace('.png', '_heatmap.png')
            cv2.imwrite(output_path, overlay)
            self.last_heatmap_path = output_path

            logger.info(f"Heatmap generated: {output_path} ({len(points)} points)")
            return output_path

        except Exception as e:
            logger.error(f"Heatmap generation failed: {e}")
            return None

    def generate_from_density_grid(
        self,
        image_path: str,
        density_grid: list,
        grid_size: int = 4
    ) -> Optional[str]:
        """
        Generate heatmap from pre-calculated density grid.

        Args:
            image_path: Path to the source image
            density_grid: 2D list of density values (grid_size x grid_size)
            grid_size: Number of cells

        Returns:
            Path to the saved heatmap image, or None on error
        """
        try:
            img = cv2.imread(image_path)
            if img is None:
                return None

            h, w = img.shape[:2]
            cell_h = h / grid_size
            cell_w = w / grid_size

            # Create heatmap from grid
            heatmap = np.zeros((h, w), dtype=np.float32)
            density = np.array(density_grid, dtype=np.float32)

            for i in range(grid_size):
                for j in range(grid_size):
                    y1 = int(i * cell_h)
                    y2 = int((i + 1) * cell_h)
                    x1 = int(j * cell_w)
                    x2 = int((j + 1) * cell_w)
                    heatmap[y1:y2, x1:x2] = density[i, j]

            # Normalize and colorize
            max_val = heatmap.max()
            if max_val > 0:
                heatmap = (heatmap / max_val * 255).astype(np.uint8)
            else:
                heatmap = heatmap.astype(np.uint8)

            heatmap_color = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)
            overlay = cv2.addWeighted(img, 0.6, heatmap_color, 0.4, 0)

            # Add density text on each cell
            font_scale = min(w, h) / 1000
            for i in range(grid_size):
                for j in range(grid_size):
                    cx = int((j + 0.5) * cell_w)
                    cy = int((i + 0.5) * cell_h)
                    val = int(density_grid[i][j])
                    text_size = cv2.getTextSize(str(val), cv2.FONT_HERSHEY_SIMPLEX, font_scale * 1.5, 2)[0]
                    text_x = cx - text_size[0] // 2
                    text_y = cy + text_size[1] // 2
                    cv2.putText(overlay, str(val), (text_x, text_y),
                               cv2.FONT_HERSHEY_SIMPLEX, font_scale * 1.5, (255, 255, 255), 2)

            output_path = image_path.replace('.jpg', '_heatmap.jpg').replace('.png', '_heatmap.png')
            cv2.imwrite(output_path, overlay)
            self.last_heatmap_path = output_path

            return output_path

        except Exception as e:
            logger.error(f"Density grid heatmap failed: {e}")
            return None


heatmap_service = HeatmapService()