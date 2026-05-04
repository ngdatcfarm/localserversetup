# YOLO Chicken Detection Pipeline

## PHẦN 1 — Dataset Structure

```
E:/AI/Dataset/
├── images/
│   ├── train/
│   ├── val/
├── labels/
│   ├── train/
│   ├── val/
└── dataset.yaml
```

### Classes
- `0` = chicken
- `1` = feeder

### Labeling rules (YOLO format: class x_center y_center width height)
- Chicken: bounding box quanh toàn bộ con gà, kể cả khi chồng lên nhau
- Feeder: bounding box quanh máng ăn màu vàng
- Di chồng lên nhau: vẫn gán nhãn từng con riêng biệt
- Bị che khuất >50%: đánh dấu "difficult" hoặc bỏ qua

## PHẦN 2 — Training

```bash
pip install ultralytics opencv-python numpy matplotlib pillow pandas
```

### dataset.yaml
```yaml
path: E:/AI/Dataset
train: images/train
val: images/val

names:
  0: chicken
  1: feeder

nc: 2
```

### Train command
```bash
yolo task=detect mode=train \
  model=yolov8n.pt \
  data=E:/AI/Dataset/dataset.yaml \
  epochs=100 \
  imgsz=640 \
  batch=16 \
  patience=20 \
  save=True \
  plots=True
```

### Monitor
- Loss giảm < 1.0 là ok
- mAP50 > 0.5 là usable
- mAP50 > 0.7 là good
- recall > 0.8 là tốt cho detection

## PHẦN 3 — Đếm gà quanh máng

```python
import cv2
import numpy as np
from ultralytics import YOLO

def count_chickens_around_feeders(results, radius_px=150):
    """
    results: YOLO results object
    radius_px: bán kính tính từ tâm feeder (pixel)
    Returns: dict {feeder_idx: [chicken_indices]}
    """
    chickens = []
    feeders = []

    for box in results.boxes:
        cls = int(box.cls[0])
        xyxy = box.xyxy[0].cpu().numpy()
        cx = (xyxy[0] + xyxy[2]) / 2
        cy = (xyxy[1] + xyxy[3]) / 2

        if cls == 0:  # chicken
            chickens.append((cx, cy))
        elif cls == 1:  # feeder
            feeders.append((cx, cy))

    # Đếm gà quanh mỗi feeder
    feeder_counts = []
    for fx, fy in feeders:
        count = 0
        for cx, cy in chickens:
            dist = np.sqrt((cx - fx)**2 + (cy - fy)**2)
            if dist < radius_px:
                count += 1
        feeder_counts.append(count)

    return {
        'total_chickens': len(chickens),
        'feeder_counts': feeder_counts,
        'chickens': chickens,
        'feeders': feeders,
    }
```

## PHẦN 4 — Mật độ theo vùng (grid)

```python
def calculate_density_grid(results, grid_size=4):
    """
    Chia ảnh thành grid và đếm gà trong từng ô
    grid_size: số ô (grid_size x grid_size)
    """
    # Lấy kích thước ảnh
    for box in results.boxes:
        img_h, img_w = results.orig_shape
        break

    cell_w = img_w / grid_size
    cell_h = img_h / grid_size

    # Khởi tạo ma trận đếm
    density_matrix = np.zeros((grid_size, grid_size), dtype=int)

    for box in results.boxes:
        if int(box.cls[0]) == 0:  # chicken
            xyxy = box.xyxy[0].cpu().numpy()
            cx = (xyxy[0] + xyxy[2]) / 2
            cy = (xyxy[1] + xyxy[3]) / 2

            col = min(int(cx / cell_w), grid_size - 1)
            row = min(int(cy / cell_h), grid_size - 1)
            density_matrix[row, col] += 1

    return density_matrix
```

## PHẦN 5 — Heatmap

```python
import cv2
import numpy as np
import matplotlib.pyplot as plt

def create_density_heatmap(results, grid_size=6, orig_img=None):
    """
    Tạo heatmap mật độ từ kết quả YOLO
    """
    density = calculate_density_grid(results, grid_size)

    # Scale lên kích thước ảnh
    if orig_img is not None:
        h, w = orig_img.shape[:2]
    else:
        h, w = 720, 1280

    heatmap = np.zeros((h, w), dtype=np.float32)
    cell_h = h / grid_size
    cell_w = w / grid_size

    for i in range(grid_size):
        for j in range(grid_size):
            y1 = int(i * cell_h)
            y2 = int((i + 1) * cell_h)
            x1 = int(j * cell_w)
            x2 = int((j + 1) * cell_w)
            heatmap[y1:y2, x1:x2] = density[i, j]

    # Normalize
    heatmap = cv2.normalize(heatmap, None, 0, 255, cv2.NORM_MINMAX)
    heatmap = heatmap.astype(np.uint8)

    # Apply colormap
    heatmap_colored = cv2.applyColorMap(heatmap, cv2.COLORMAP_JET)

    return heatmap_colored, density

def overlay_heatmap(orig_img, heatmap_colored, alpha=0.5):
    """Overlay heatmap lên ảnh gốc"""
    return cv2.addWeighted(orig_img, 1-alpha, heatmap_colored, alpha, 0)
```

## PHẦN 6 — Realtime Inference

```python
import cv2
from ultralytics import YOLO

def run_realtime(model_path, source=0, radius_px=150):
    """
    source: 0 (webcam), 'rtsp://...', hoặc 'video.mp4'
    """
    model = YOLO(model_path)

    cap = cv2.VideoCapture(source)

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        results = model(frame, conf=0.5, verbose=False)[0]

        # Vẽ bounding boxes
        annotated = results.plot(line_width=2)

        # Đếm gà
        counts = count_chickens_around_feeders(results, radius_px)

        # Hiển thị
        cv2.putText(annotated, f"Total: {counts['total_chickens']}",
                    (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

        for i, cnt in enumerate(counts['feeder_counts']):
            cv2.putText(annotated, f"Feeder {i+1}: {cnt}",
                        (10, 60 + i*30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

        cv2.imshow('Chicken Detection', annotated)

        if cv2.waitKey(1) & 0xFF == ord('q'):
            break

    cap.release()
    cv2.destroyAllWindows()
```

## PHẦN 7 — Data Augmentation (thêm vào dataset.yaml)

```yaml
# Bổ sung vào dataset.yaml hoặc tạo file args riêng
augmentation:
  hsv_h: 0.015  # Hue
  hsv_s: 0.7    # Saturation
  hsv_v: 0.4     # Value
  flip: 0.5      # Horizontal flip
  mosaic: 1.0    # Mosaic augmentation
  mixup: 0.1     # MixUp augmentation
```

## PHẦN 8 — Export

```bash
# ONNX
yolo export model=best.pt format=onnx

# TensorRT (GPU NVIDIA)
yolo export model=best.pt format=engine

# OpenVINO (CPU Intel)
yolo export model=best.pt format=openvino
```

## Hardware gợi ý

| GPU | Batch size | Imgsz |
|-----|-----------|-------|
| RTX 1650 4GB | 8-16 | 640 |
| RTX 3060 12GB | 16-32 | 640-1280 |
| RTX 4090 24GB | 32+ | 1280 |

## Debug tips

1. **Model detect sai**: Tăng `conf` threshold, kiểm tra dataset có imbalance không
2. **Detect thiếu**: Giảm `conf`, tăng `imgsz`, thêm ảnh train
3. **False positive**: Thêm negative samples, tăng `conf`
4. **Chickens đè nhau**: Train thêm ảnh crowded, dùng augmentation phù hợp
