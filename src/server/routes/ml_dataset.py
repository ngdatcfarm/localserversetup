"""ML Dataset Routes - Upload, label, and export training data."""

import asyncio
import zipfile
import io
import shutil
from pathlib import Path
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from src.services.database.db import db

router = APIRouter(prefix="/api/ml/dataset", tags=["ml-dataset"])

DATASET_DIR = Path("E:/AI/Dataset")
DATASET_DIR.mkdir(parents=True, exist_ok=True)


# ── List / Get ──────────────────────────────────────────

@router.get("/images")
async def list_images(status: Optional[str] = None, limit: int = 100):
    """List all dataset images."""
    query = "SELECT * FROM ml_dataset_images WHERE is_active = TRUE"
    params = []
    if status:
        query += " AND label_status = $1"
        params.append(status)
    query += " ORDER BY created_at DESC LIMIT $" + str(len(params) + 1)
    params.append(limit)

    rows = await db.fetch(query, *params)
    return {"images": [dict(r) for r in rows]}


@router.get("/images/{image_id}")
async def get_image(image_id: int):
    """Get image with its labels."""
    img = await db.fetchrow(
        "SELECT * FROM ml_dataset_images WHERE id = $1", image_id
    )
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    labels = await db.fetch(
        "SELECT * FROM ml_dataset_labels WHERE image_id = $1", image_id
    )
    return {**dict(img), "labels": [dict(l) for l in labels]}


# ── Upload ─────────────────────────────────────────────

@router.post("/upload")
async def upload_image(file: UploadFile = File(...)):
    """Upload a single image to the dataset."""
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Only image files allowed")

    # Save file
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_name = "".join(c for c in file.filename if c.isalnum() or c in "._-")
    filename = f"{timestamp}_{safe_name}"
    filepath = DATASET_DIR / filename

    content = await file.read()
    filepath.write_bytes(content)

    # Get image dimensions
    import cv2
    img = cv2.imread(str(filepath))
    if img is None:
        filepath.unlink()
        raise HTTPException(status_code=400, detail="Invalid image file")

    h, w = img.shape[:2]

    # Save to DB
    row = await db.fetchrow(
        """INSERT INTO ml_dataset_images (filename, filepath, original_width, original_height)
           VALUES ($1, $2, $3, $4) RETURNING *""",
        filename, str(filepath), w, h
    )

    return {"ok": True, "image": dict(row)}


@router.post("/upload-batch")
async def upload_batch(files: list[UploadFile] = File(...)):
    """Upload multiple images at once."""
    results = []
    errors = []

    for file in files:
        try:
            if not file.content_type or not file.content_type.startswith("image/"):
                errors.append({"file": file.filename, "error": "Not an image"})
                continue

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            safe_name = "".join(c for c in file.filename if c.isalnum() or c in "._-")
            filename = f"{timestamp}_{safe_name}"
            filepath = DATASET_DIR / filename

            content = await file.read()
            filepath.write_bytes(content)

            import cv2
            img = cv2.imread(str(filepath))
            if img is None:
                filepath.unlink()
                errors.append({"file": file.filename, "error": "Invalid image"})
                continue

            h, w = img.shape[:2]
            row = await db.fetchrow(
                """INSERT INTO ml_dataset_images (filename, filepath, original_width, original_height)
                   VALUES ($1, $2, $3, $4) RETURNING *""",
                filename, str(filepath), w, h
            )
            results.append(dict(row))
        except Exception as e:
            errors.append({"file": file.filename, "error": str(e)})

    return {"ok": True, "uploaded": results, "errors": errors}


# ── Label ──────────────────────────────────────────────

class LabelModel(BaseModel):
    class_name: str = "chick"
    x_center: float  # 0.0 to 1.0
    y_center: float
    width: float
    height: float


@router.post("/images/{image_id}/labels")
async def add_label(image_id: int, label: LabelModel):
    """Add a bounding box label to an image."""
    img = await db.fetchrow(
        "SELECT id FROM ml_dataset_images WHERE id = $1", image_id
    )
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    row = await db.fetchrow(
        """INSERT INTO ml_dataset_labels (image_id, class_name, x_center, y_center, width, height)
           VALUES ($1, $2, $3, $4, $5, $6) RETURNING *""",
        image_id, label.class_name, label.x_center, label.y_center, label.width, label.height
    )

    # Update image status
    await db.execute(
        "UPDATE ml_dataset_images SET label_status = 'labeled', updated_at = NOW() WHERE id = $1",
        image_id
    )

    return {"ok": True, "label": dict(row)}


@router.get("/images/{image_id}/labels")
async def get_labels(image_id: int):
    """Get all labels for an image."""
    rows = await db.fetch(
        "SELECT * FROM ml_dataset_labels WHERE image_id = $1 ORDER BY id",
        image_id
    )
    return {"labels": [dict(r) for r in rows]}


@router.post("/images/{image_id}/labels-bulk")
async def add_labels_bulk(image_id: int, labels: list[LabelModel]):
    """Add multiple labels at once."""
    img = await db.fetchrow(
        "SELECT id FROM ml_dataset_images WHERE id = $1", image_id
    )
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    for label in labels:
        await db.execute(
            """INSERT INTO ml_dataset_labels (image_id, class_name, x_center, y_center, width, height)
               VALUES ($1, $2, $3, $4, $5, $6)""",
            image_id, label.class_name, label.x_center, label.y_center, label.width, label.height
        )

    await db.execute(
        "UPDATE ml_dataset_images SET label_status = 'labeled', updated_at = NOW() WHERE id = $1",
        image_id
    )

    return {"ok": True, "count": len(labels)}


@router.delete("/images/{image_id}/labels/{label_id}")
async def delete_label(image_id: int, label_id: int):
    """Delete a label."""
    result = await db.execute(
        "DELETE FROM ml_dataset_labels WHERE id = $1 AND image_id = $2",
        label_id, image_id
    )
    if result != "DELETE 1":
        raise HTTPException(status_code=404, detail="Label not found")
    return {"ok": True}


# ── Status ─────────────────────────────────────────────

class StatusModel(BaseModel):
    status: str

@router.post("/images/{image_id}/status")
async def update_status(image_id: int, body: StatusModel):
    """Update image label status: unlabeled, labeled, verified."""
    status = body.status
    if status not in ("unlabeled", "labeled", "verified"):
        raise HTTPException(status_code=400, detail="Invalid status")
    await db.execute(
        "UPDATE ml_dataset_images SET label_status = $1, updated_at = NOW() WHERE id = $2",
        status, image_id
    )
    return {"ok": True}


# ── Delete ─────────────────────────────────────────────

@router.delete("/images/{image_id}")
async def delete_image(image_id: int):
    """Soft delete an image from dataset."""
    img = await db.fetchrow(
        "SELECT filepath FROM ml_dataset_images WHERE id = $1", image_id
    )
    if not img:
        raise HTTPException(status_code=404, detail="Image not found")

    # Delete file
    try:
        Path(img["filepath"]).unlink()
    except Exception:
        pass

    await db.execute(
        "UPDATE ml_dataset_images SET is_active = FALSE WHERE id = $1", image_id
    )
    return {"ok": True}


# ── Export ─────────────────────────────────────────────

@router.get("/export")
async def export_yolo():
    """Export dataset in YOLO format as a zip file."""
    import tempfile

    # Get all labeled images
    rows = await db.fetch(
        """SELECT i.*, l.class_name, l.x_center, l.y_center, l.width, l.height
           FROM ml_dataset_images i
           LEFT JOIN ml_dataset_labels l ON i.id = l.image_id
           WHERE i.is_active = TRUE AND i.label_status != 'unlabeled'
           ORDER BY i.id"""
    )

    if not rows:
        raise HTTPException(status_code=400, detail="No labeled images to export")

    # Create zip in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
        current_img_id = None
        label_lines = []

        for row in rows:
            img_id = row["id"]

            # New image - write previous image's labels
            if current_img_id is not None and current_img_id != img_id:
                if label_lines:
                    # Get original filename without extension for label file
                    img_name = Path(rows[list(range(len(rows)))[[r["id"] for r in rows].index(current_img_id)]]["filepath"]).stem
                    zf.writestr(f"labels/{img_name}.txt", "\n".join(label_lines))

            # Copy image file
            img_path = Path(row["filepath"])
            if img_path.exists():
                img_name = img_path.stem
                zf.write(str(img_path), f"images/{img_name}{img_path.suffix}")

                # Add label line
                if row["x_center"] is not None:
                    # YOLO format: class_id x_center y_center width height
                    # Using class_id 0 for chick
                    label_lines.append(f"0 {row['x_center']:.6f} {row['y_center']:.6f} {row['width']:.6f} {row['height']:.6f}")

            current_img_id = img_id

        # Don't forget last image
        if current_img_id is not None and label_lines:
            img_name = Path(rows[-1]["filepath"]).stem
            zf.writestr(f"labels/{img_name}.txt", "\n".join(label_lines))

        # Write dataset YAML
        yaml_content = """# Chick Detection Dataset
path: .
train: images
val: images

names:
  0: chick
"""
        zf.writestr("dataset.yaml", yaml_content)

    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=chick_dataset.zip"}
    )


# ── Stats ──────────────────────────────────────────────

@router.get("/stats")
async def get_stats():
    """Get dataset statistics."""
    total = await db.fetchval("SELECT COUNT(*) FROM ml_dataset_images WHERE is_active = TRUE") or 0
    unlabeled = await db.fetchval("SELECT COUNT(*) FROM ml_dataset_images WHERE is_active = TRUE AND label_status = 'unlabeled'") or 0
    labeled = await db.fetchval("SELECT COUNT(*) FROM ml_dataset_images WHERE is_active = TRUE AND label_status = 'labeled'") or 0
    verified = await db.fetchval("SELECT COUNT(*) FROM ml_dataset_images WHERE is_active = TRUE AND label_status = 'verified'") or 0

    total_labels = await db.fetchval("SELECT COUNT(*) FROM ml_dataset_labels") or 0

    return {
        "total_images": total,
        "unlabeled": unlabeled,
        "labeled": labeled,
        "verified": verified,
        "total_bboxes": total_labels,
    }
