"""ML Gas Anomaly Detection API routes."""

import logging
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional

from src.services.ml.ml_service import get_ml_service, detect_gas_anomaly
from src.server.auth import require_auth

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/ml", tags=["ml"], dependencies=[Depends(require_auth)])


class AnomalyDetectRequest(BaseModel):
    """Request body for anomaly detection."""
    device_id: int
    sensor_type: str
    value: float


class AnomalyDetectResponse(BaseModel):
    """Response for anomaly detection."""
    anomaly: Optional[bool]
    confidence: Optional[float]
    anomaly_score: Optional[float]
    prediction: Optional[str]
    features: Optional[dict]
    timestamp: Optional[str]
    error: Optional[str] = None


@router.get("/status")
async def get_ml_status():
    """Get ML service status."""
    service = get_ml_service()
    status = await service.get_status()
    return status


@router.post("/detect-anomaly", response_model=AnomalyDetectResponse)
async def detect_anomaly(request: AnomalyDetectRequest):
    """
    Detect gas anomaly for a sensor reading.

    This endpoint is used by the frontend to get real-time anomaly detection
    results for gas sensor readings.

    Request body:
        - device_id: Device ID
        - sensor_type: e.g., 'mq137_raw', 'mq135_raw'
        - value: Sensor reading value

    Returns:
        - anomaly: True if anomaly detected, False otherwise
        - confidence: Confidence score (0-1)
        - anomaly_score: Raw anomaly score from Isolation Forest
        - prediction: 'anomaly' or 'normal'
        - features: Computed features (baseline, deviation)
        - timestamp: Detection timestamp
    """
    try:
        result = await detect_gas_anomaly(
            request.device_id,
            request.sensor_type,
            request.value
        )
        return result
    except Exception as e:
        logger.error(f"Anomaly detection error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/detect-batch")
async def detect_batch(requests: list[AnomalyDetectRequest]):
    """
    Detect anomalies for multiple sensor readings at once.

    Used for processing historical data or bulk inference.
    """
    results = []
    for req in requests:
        try:
            result = await detect_gas_anomaly(req.device_id, req.sensor_type, req.value)
            results.append(result)
        except Exception as e:
            results.append({"error": str(e), "device_id": req.device_id, "sensor_type": req.sensor_type})

    return {"results": results, "count": len(results)}


@router.get("/baselines")
async def get_baselines():
    """Get current EWMA baselines for all device+sensor combinations."""
    service = get_ml_service()
    baselines = {}

    for key, data in service.baselines.items():
        device_id, sensor_type = key.rsplit('_', 1)
        if sensor_type in ['mq137_raw', 'mq135_raw']:
            baselines[key] = {
                "baseline": round(data['ewma'], 2),
                "count": data['count']
            }

    return {
        "baselines": baselines,
        "active_count": len(baselines)
    }


@router.post("/baselines/reset")
async def reset_baselines():
    """Reset all EWMA baselines (start fresh)."""
    service = get_ml_service()
    service.baselines = {}
    return {"message": "Baselines reset", "active_count": 0}