"""
ML Temperature Prediction Service
Uses trained model to predict temperature for a barn.
"""

import joblib
import numpy as np
from pathlib import Path
from typing import Optional

logger = None


def _init_logger():
    global logger
    if logger is None:
        import logging
        logger = logging.getLogger(__name__)


class TempPredictionService:
    """Load and run temperature prediction model."""

    def __init__(self, model_path: str = None, scaler_path: str = None):
        _init_logger()
        self.model = None
        self.scaler = None
        self.feature_cols = [
            'hour', 'day_of_week', 'day_of_month', 'day_age',
            'humidity', 'mq135', 'mq137',
            'hour_sin', 'hour_cos', 'dow_sin', 'dow_cos',
            'heat_index', 'gas_ratio'
        ]

        if model_path:
            self.load_model(model_path, scaler_path)

    def load_model(self, model_path: str, scaler_path: str = None):
        """Load trained model and scaler from files."""
        try:
            self.model = joblib.load(model_path)
            logger.info(f"Loaded model: {type(self.model).__name__}")

            if scaler_path:
                self.scaler = joblib.load(scaler_path)
                logger.info("Loaded scaler")
            else:
                logger.warning("No scaler provided - predictions may be less accurate")
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            raise

    def predict(self, hour: int, day_of_week: int, day_of_month: int,
                day_age: int, humidity: float, mq135: float, mq137: float) -> float:
        """
        Predict temperature given environmental factors.

        Args:
            hour: Hour of day (0-23)
            day_of_week: Day of week (0=Mon, 6=Sun)
            day_of_month: Day of month (1-31)
            day_age: Age of cycle in days
            humidity: Humidity percentage (0-100)
            mq135: MQ135 sensor reading (raw)
            mq137: MQ137 sensor reading (raw)

        Returns:
            Predicted temperature in Celsius
        """
        if self.model is None:
            raise RuntimeError("Model not loaded")

        # Build features
        hour_sin = np.sin(2 * np.pi * hour / 24)
        hour_cos = np.cos(2 * np.pi * hour / 24)
        dow_sin = np.sin(2 * np.pi * day_of_week / 7)
        dow_cos = np.cos(2 * np.pi * day_of_week / 7)

        # Estimate average temperature for heat_index (will be updated with real data)
        avg_temp = 30.0  # Assumed average
        heat_index = avg_temp * humidity / 100
        gas_ratio = mq135 / (mq137 + 1)

        features = np.array([[
            hour, day_of_week, day_of_month, day_age,
            humidity, mq135, mq137,
            hour_sin, hour_cos, dow_sin, dow_cos,
            heat_index, gas_ratio
        ]])

        # Scale if scaler available
        if self.scaler is not None:
            features = self.scaler.transform(features)

        # Predict
        prediction = self.model.predict(features)[0]
        return round(float(prediction), 2)

    def predict_from_sensor_data(self, barn_id: str, day_age: int,
                                  humidity: float, mq135: float, mq137: float) -> dict:
        """
        Predict temperature for current time based on sensor data.
        Automatically uses current hour, day_of_week, day_of_month.
        """
        from datetime import datetime
        now = datetime.now()

        temp = self.predict(
            hour=now.hour,
            day_of_week=now.weekday(),
            day_of_month=now.day,
            day_age=day_age,
            humidity=humidity,
            mq135=mq135,
            mq137=mq137
        )

        return {
            "predicted_temperature": temp,
            "timestamp": now.isoformat(),
            "barn_id": barn_id,
            "day_age": day_age,
            "input_humidity": humidity,
            "input_mq135": mq135,
            "input_mq137": mq137
        }


# Singleton instance
_model_path = Path(__file__).parent.parent.parent / "models" / "cfarm_temp_model.joblib"
_scaler_path = Path(__file__).parent.parent.parent / "models" / "cfarm_scaler.joblib"

# Try to load model if files exist
_temp_service = None


def get_prediction_service() -> TempPredictionService:
    global _temp_service
    if _temp_service is None:
        if _model_path.exists():
            _temp_service = TempPredictionService(
                str(_model_path),
                str(_scaler_path) if _scaler_path.exists() else None
            )
        else:
            raise RuntimeError(f"Model not found at {_model_path}")
    return _temp_service