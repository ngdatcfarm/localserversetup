"""Luxpower inverter REST API (Phase 1 — read-only monitoring).

Endpoints:
    GET /api/inverter/current   → latest in-memory sample (or 503 if no data yet)
    GET /api/inverter/status    → service health (connected, last_poll_at, ...)
    GET /api/inverter/history   → time-series samples for the last N hours

All endpoints require a valid session cookie (`require_auth`).
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query

from src.iot.inverter_service import inverter_service
from src.server.auth import require_auth
from src.services.database.db import db

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/inverter",
    tags=["inverter"],
    dependencies=[Depends(require_auth)],
)


# ── Service status / current sample ────────────────────────────────────
@router.get("/status")
async def get_status(_user: dict = Depends(require_auth)) -> dict:
    """Poller health: connected, last_poll_at, last_error, counters."""
    return inverter_service.status()


@router.get("/current")
async def get_current(_user: dict = Depends(require_auth)) -> dict:
    """Latest in-memory sample. Returns 503 if no sample has been polled yet."""
    rt = inverter_service.current
    if rt is None:
        raise HTTPException(
            status_code=503,
            detail="Chưa có dữ liệu — inverter chưa được poll lần nào. "
            "Kiểm tra kết nối dongle và cấu hình.",
        )
    return rt.to_dict()


# ── History ─────────────────────────────────────────────────────────────
@router.get("/history")
async def get_history(
    hours: int = Query(24, ge=1, le=24 * 14),
    bucket: str = Query("auto", pattern="^(auto|raw|hourly)$"),
    _user: dict = Depends(require_auth),
) -> dict:
    """Return time-series samples for the last `hours` hours.

    bucket:
      - "auto"   → if hours ≤ 48 return raw samples; otherwise use the
                   `inverter_runtime_hourly` continuous aggregate.
      - "raw"    → always raw 5s samples (heavy for large windows).
      - "hourly" → always use the hourly aggregate.
    """
    if not db.pool:
        raise HTTPException(status_code=503, detail="Database chưa sẵn sàng")

    use_hourly = bucket == "hourly" or (bucket == "auto" and hours > 48)

    try:
        if use_hourly:
            rows = await db.fetch(
                """SELECT
                       bucket                  AS ts,
                       ppv1_avg, ppv2_avg, ppv_min, ppv_max,
                       p_grid_avg, p_eps_avg, p_bat_avg,
                       soc_avg, soc_min, soc_max,
                       v_bat_avg, sample_count
                  FROM inverter_runtime_hourly
                 WHERE bucket > NOW() - ($1 || ' hours')::interval
                 ORDER BY bucket ASC""",
                str(hours),
            )
        else:
            rows = await db.fetch(
                """SELECT ts, ppv1, ppv2, p_grid, p_eps, p_bat,
                          soc, v_bat
                     FROM inverter_runtime
                    WHERE ts > NOW() - ($1 || ' hours')::interval
                    ORDER BY ts ASC""",
                str(hours),
            )
    except Exception as e:
        logger.error("inverter history query failed: %s", e)
        raise HTTPException(status_code=500, detail=f"Lỗi truy vấn: {e}")

    # Convert datetime → ISO string so JSON is consumable by the SPA
    out = []
    for r in rows:
        d = dict(r)
        if isinstance(d.get("ts"), object) and hasattr(d["ts"], "isoformat"):
            d["ts"] = d["ts"].isoformat()
        out.append(d)

    return {
        "hours": hours,
        "bucket": "hourly" if use_hourly else "raw",
        "count": len(out),
        "samples": out,
    }
