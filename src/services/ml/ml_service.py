"""
ML Gas Anomaly Detection Service
================================

Loads trained models and provides real-time anomaly detection
for gas sensor readings.

Usage:
    from ml_service import ml_service
    result = await ml_service.detect_anomaly(device_id, sensor_type, value)
"""

import json
import os
import logging
from typing import Optional
from datetime import datetime

import joblib
from src.services.database.db import db

logger = logging.getLogger(__name__)

# Model paths - absolute path to ml_models in server root
import os
# ml_service.py is at C:\Local server\src\services\ml\ml_service.py
# ml_models is at C:\Local server\ml_models
MODEL_DIR = r"C:\Local server\ml_models"
MODEL_FILE = os.path.join(MODEL_DIR, "gas_anomaly_if_model.pkl")
SCALER_FILE = os.path.join(MODEL_DIR, "gas_scaler.pkl")
FEATURE_INFO_FILE = os.path.join(MODEL_DIR, "gas_feature_info.json")


class MLGasService:
    """
    Real-time gas anomaly detection service.
    Loads trained models and computes anomaly scores.
    """

    def __init__(self):
        self.model = None
        self.scaler = None
        self.feature_info = None
        self.baselines = {}  # Per device+sensor EWMA baselines
        self.ewma_alpha = 0.03
        self.loaded = False
        self._load_models()

    def _load_models(self):
        """Load trained models from files."""
        try:
            if not os.path.exists(MODEL_DIR):
                os.makedirs(MODEL_DIR, exist_ok=True)

            if os.path.exists(MODEL_FILE):
                self.model = joblib.load(MODEL_FILE)
                logger.info(f"Loaded model from {MODEL_FILE}")
            else:
                logger.warning(f"Model file not found: {MODEL_FILE}")
                return

            if os.path.exists(SCALER_FILE):
                self.scaler = joblib.load(SCALER_FILE)
                logger.info(f"Loaded scaler from {SCALER_FILE}")
            else:
                logger.warning(f"Scaler file not found: {SCALER_FILE}")
                return

            if os.path.exists(FEATURE_INFO_FILE):
                with open(FEATURE_INFO_FILE, 'r') as f:
                    self.feature_info = json.load(f)
                logger.info(f"Loaded feature info: {self.feature_info}")
            else:
                logger.warning(f"Feature info file not found: {FEATURE_INFO_FILE}")
                return

            self.loaded = True
            logger.info("MLGasService: All models loaded successfully")

        except Exception as e:
            logger.error(f"Error loading models: {e}")
            self.loaded = False

    def update_baseline(self, device_id: int, sensor_type: str, value: float) -> float:
        """Update EWMA baseline for a device+sensor."""
        key = f"{device_id}_{sensor_type}"
        if key not in self.baselines:
            self.baselines[key] = {"ewma": value, "count": 0}

        b = self.baselines[key]
        b["ewma"] = self.ewma_alpha * value + (1 - self.ewma_alpha) * b["ewma"]
        b["count"] += 1
        return b["ewma"]

    def compute_features(self, device_id: int, sensor_type: str, value: float) -> dict:
        """Compute ML features for a single reading."""
        baseline = self.update_baseline(device_id, sensor_type, value)
        deviation = ((value - baseline) / baseline * 100) if baseline > 0 else 0

        return {
            "device_id": device_id,
            "sensor_type": sensor_type,
            "value": value,
            "baseline": round(baseline, 2),
            "deviation": round(deviation, 2),
        }

    def predict(self, features: dict) -> dict:
        """
        Run inference on computed features.

        Returns:
            dict with anomaly prediction, confidence, and scores
        """
        if not self.loaded:
            return {"anomaly": None, "confidence": None, "error": "Models not loaded"}

        try:
            feature_cols = self.feature_info['feature_cols']
            device_id = features['device_id']
            sensor_type = features['sensor_type']
            value = features['value']
            deviation = features['deviation']

            # Initialize feature vector
            feature_vector = [0.0] * len(feature_cols)

            # Fill in the provided feature
            for i, col in enumerate(feature_cols):
                col_parts = col.split('_')
                if len(col_parts) >= 3:
                    col_sensor = col_parts[-1]
                    col_device = col_parts[-2]
                    col_metric = '_'.join(col_parts[:-2])

                    try:
                        col_device_int = int(col_device)
                    except ValueError:
                        continue

                    if col_device_int == device_id and col_sensor == sensor_type:
                        if col_metric == 'deviation':
                            feature_vector[i] = deviation
                        elif col_metric == 'value':
                            feature_vector[i] = value

            # Scale and predict
            X_scaled = self.scaler.transform([feature_vector])
            prediction = self.model.predict(X_scaled)[0]
            score = self.model.decision_function(X_scaled)[0]

            is_anomaly = prediction == -1
            confidence = max(0, min(1, (score + 0.5) / 1.0))

            return {
                "anomaly": bool(is_anomaly),
                "confidence": round(confidence, 3),
                "anomaly_score": round(float(score), 4),
                "prediction": "anomaly" if is_anomaly else "normal",
                "features": features,
            }

        except Exception as e:
            logger.error(f"Inference error: {e}")
            return {"anomaly": None, "confidence": None, "error": str(e)}

    async def detect_anomaly(self, device_id: int, sensor_type: str, value: float) -> dict:
        """
        Main entry point - compute features and run inference.

        Args:
            device_id: Device ID
            sensor_type: e.g., 'mq137_raw', 'mq135_raw'
            value: Sensor reading value

        Returns:
            dict with anomaly detection results
        """
        features = self.compute_features(device_id, sensor_type, value)
        result = self.predict(features)
        result["timestamp"] = datetime.now().isoformat()
        return result

    async def get_status(self) -> dict:
        """Get ML service status."""
        return {
            "loaded": self.loaded,
            "models_loaded": self.loaded,
            "baselines_active": len(self.baselines),
            "ewma_alpha": self.ewma_alpha,
            "feature_info": self.feature_info if self.loaded else None,
        }


# Singleton instance
_ml_service: Optional[MLGasService] = None


def get_ml_service() -> MLGasService:
    """Get or create singleton ML service instance."""
    global _ml_service
    if _ml_service is None:
        _ml_service = MLGasService()
    return _ml_service


async def detect_gas_anomaly(device_id: int, sensor_type: str, value: float) -> dict:
    """
    Convenience function for anomaly detection.
    Use this in MQTT listener or API endpoints.
    """
    service = get_ml_service()
    return await service.detect_anomaly(device_id, sensor_type, value)