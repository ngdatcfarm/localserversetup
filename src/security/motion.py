"""Motion Detector — OpenCV MOG2 background subtraction.

Used as a cheap pre-filter before the more expensive YOLO inference. Only
frames that pass the motion gate are sent to the inference worker.

Performance:
    MOG2 is purely numpy/OpenCV, no model load, runs at <3ms/frame for
    a 640x480 stream on a modern CPU. We resize to 320x240 first so
    the per-frame cost stays bounded even on full-HD RTSP feeds.
"""
import logging
from typing import Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)


class MotionDetector:
    """Wraps cv2.createBackgroundSubtractorMOG2 for one camera.

    One instance per camera. Lazy-init the background subtractor so
    cameras that are not yet enabled don't burn memory.
    """

    def __init__(
        self,
        history: int = 500,
        var_threshold: int = 32,
        detect_shadows: bool = True,
        resize_width: int = 320,
    ):
        self.history = history
        self.var_threshold = var_threshold
        self.detect_shadows = detect_shadows
        self.resize_width = resize_width
        self._subtractor: Optional[cv2.BackgroundSubtractor] = None

    def _ensure_subtractor(self):
        if self._subtractor is None:
            self._subtractor = cv2.createBackgroundSubtractorMOG2(
                history=self.history,
                varThreshold=self.var_threshold,
                detectShadows=self.detect_shadows,
            )

    def score(self, frame: np.ndarray, threshold: float = 0.05) -> float:
        """Return motion_score in [0.0, 1.0] = fraction of foreground pixels.

        Args:
            frame: BGR numpy array (full-res from RTSP).
            threshold: not used here; callers compare score > threshold.

        Returns:
            float in [0.0, 1.0]. Frames below 0.05 (5%) are usually noise /
            camera gain fluctuation / shadows.
        """
        if frame is None or frame.size == 0:
            return 0.0

        # Resize down — keep aspect ratio — for fast scoring.
        h, w = frame.shape[:2]
        if w > self.resize_width:
            scale = self.resize_width / float(w)
            small = cv2.resize(
                frame,
                (self.resize_width, max(1, int(h * scale))),
                interpolation=cv2.INTER_AREA,
            )
        else:
            small = frame

        self._ensure_subtractor()
        mask = self._subtractor.apply(small)

        # Shadow mask = pixel value 127; treat as motion too (cheap cameras
        # often re-classify real movement as shadow).
        non_zero = int(cv2.countNonZero(mask))
        total = mask.shape[0] * mask.shape[1]
        if total == 0:
            return 0.0

        return non_zero / float(total)

    def reset(self):
        """Drop background model — next call rebuilds it."""
        self._subtractor = None