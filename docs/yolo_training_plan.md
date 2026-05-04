# Chi tiết kế hoạch Train YOLO cho Chicken Detection

## MỤC TIÊU
1. Detect và đếm gà con trong khung hình
2. Detect vị trí máng ăn (feeder)
3. Đếm số gà quanh mỗi máng ăn
4. Tính mật độ gà theo vùng (grid 4x4 hoặc 6x6)
5. Xuất kết quả: tổng gà, gà/máng, heatmap mật độ

---

## GIAI ĐOẠN 1: Chuẩn bị Dataset

### 1.1 Cấu trúc thư mục
```
E:/AI/Dataset/
├── images/
│   ├── train/       # Ảnh train (80%)
│   └── val/         # Ảnh validation (20%)
├── labels/
│   ├── train/
│   └── val/
└── dataset.yaml
```

### 1.2 Classes
| ID | Tên     | Mô tả                    |
|----|---------|--------------------------|
| 0  | chicken | Con gà con              |
| 1  | feeder  | Máng ăn (màu vàng/nhựa) |

### 1.3 Quy tắc gán nhãn YOLO
```
class_id x_center y_center width height
(ví dụ) 0     0.543    0.234    0.12   0.08
```

- **Chicken**: Vẽ bounding box quanh toàn bộ con gà (kể cả đầu, thân, chân)
- **Feeder**: Vẽ bounding box quanh máng ăn
- **Chồng lên nhau**: Vẽ riêng từng con, không gộp
- **Bị che >50%**: Có thể đánh dấu "difficult" hoặc bỏ qua

### 1.4 Số lượng ảnh tối thiểu
- **Tối thiểu**: 100-200 ảnh train, 20-50 ảnh val
- **Tốt**: 500+ ảnh train với đa dạng góc độ, ánh sáng

### 1.5 Công cụ gán nhãn
**Roboflow** (recommended) - có thể collaborative, auto-generate YOLO format

**Thay thế local:**
- LabelImg: `pip install labelImg`
- YOLO annotation tool khác

### 1.6 Đa dạng dataset
- Nhiều góc camera khác nhau
- Nhiều điều kiện ánh sáng (sáng, tối, trung bình)
- Nhiều mật độ gà (thưa, đông, rất đông)
- Ảnh cả ngày và đêm

---

## GIAI ĐOẠN 2: Cài đặt môi trường

### 2.1 Python environment
```bash
conda create -n yolo python=3.10
conda activate yolo
pip install ultralytics opencv-python numpy matplotlib pillow pandas
```

### 2.2 Hoặc dùng venv
```bash
python -m venv yolo_env
yolo_env\Scripts\activate
pip install ultralytics opencv-python numpy matplotlib pillow pandas
```

### 2.3 Kiểm tra GPU (có thì dùng GPU)
```bash
nvidia-smi  # Kiểm tra NVIDIA GPU
python -c "import torch; print(torch.cuda.is_available())"
```

---

## GIAI ĐOẠN 3: Cấu hình dataset.yaml

```yaml
path: E:/AI/Dataset
train: images/train
val: images/val

names:
  0: chicken
  1: feeder

nc: 2
```

---

## GIAI ĐOẠN 4: Train Model

### 4.1 Lệnh train (GPU)
```bash
yolo task=detect mode=train \
  model=yolov8n.pt \
  data=E:/AI/Dataset/dataset.yaml \
  epochs=100 \
  imgsz=640 \
  batch=16 \
  patience=20 \
  save=True \
  plots=True \
  device=0
```

### 4.2 Lệnh train (CPU - chậm hơn)
```bash
yolo task=detect mode=train \
  model=yolov8n.pt \
  data=E:/AI/Dataset/dataset.yaml \
  epochs=100 \
  imgsz=640 \
  batch=8 \
  patience=20 \
  save=True \
  plots=True \
  device=cpu
```

### 4.3 Thông số khuyến nghị
| Thông số       | Giá trị       | Ghi chú                    |
|---------------|--------------|----------------------------|
| model         | yolov8n.pt   | Nano - nhanh, nhẹ          |
| epochs        | 100-150      | Early stopping nếu loss ổn định |
| imgsz         | 640          | Kích thư�ơng ảnh input     |
| batch         | 16 (GPU)/8   | Tùy GPU VRAM              |
| patience      | 20           | Dừng sớm nếu không cải thiện |

### 4.4 Theo dõi training
Sau khi train xong:
- Best model: `runs/detect/train/weights/best.pt`
- Last model: `runs/detect/train/weights/last.pt`
- Results: `runs/detect/train/results.png`

### 4.5 Đánh giá model
```bash
yolo val model=runs/detect/train/weights/best.pt data=E:/AI/Dataset/dataset.yaml
```

Mục tiêu:
- mAP50 > 0.6 (usable for production)
- mAP50 > 0.75 (good)
- Recall > 0.8

---

## GIAI ĐOẠN 5: Inference và phân tích

### 5.1 Copy model đã train vào vị trí chuẩn
```bash
cp runs/detect/train/weights/best.pt E:/AI/models/chick_detector/weights/best.pt
```

### 5.2 Code inference (Python thuần)
```python
from ultralytics import YOLO
import cv2
import numpy as np

model = YOLO('E:/AI/models/chick_detector/weights/best.pt')

# Đọc ảnh
img = cv2.imread('test.jpg')
results = model(img, conf=0.5)[0]

# Lấy bounding boxes
boxes = results.boxes
chickens = []
feeders = []

for box in boxes:
    cls = int(box.cls[0])
    xyxy = box.xyxy[0].cpu().numpy()
    if cls == 0:  # chicken
        chickens.append(xyxy)
    elif cls == 1:  # feeder
        feeders.append(xyxy)

print(f"Tổng gà: {len(chickens)}")
print(f"Tổng máng: {len(feeders)}")
```

### 5.3 Đếm gà quanh máng
```python
def count_chickens_near_feeder(chickens, feeders, radius=150):
    """Đếm gà trong bán kính radius pixel quanh mỗi máng"""
    counts = []
    for fx, fy in feeders:
        count = 0
        for cx, cy in chickens:
            dist = np.sqrt((cx-fx)**2 + (cy-fy)**2)
            if dist < radius:
                count += 1
        counts.append(count)
    return counts
```

### 5.4 Tính mật độ grid
```python
def density_grid(chickens, img_w, img_h, grid_size=4):
    """Chia ảnh thành grid và đếm gà mỗi ô"""
    cell_w = img_w / grid_size
    cell_h = img_h / grid_size
    grid = np.zeros((grid_size, grid_size), dtype=int)

    for cx, cy in chickens:
        col = min(int(cx / cell_w), grid_size-1)
        row = min(int(cy / cell_h), grid_size-1)
        grid[row, col] += 1

    return grid
```

---

## GIAI ĐOẠN 6: Tối ưu và Export

### 6.1 Data Augmentation (thêm vào dataset.yaml hoặc training args)
```yaml
augmentation:
  hsv_h: 0.015   # Thay đổi Hue
  hsv_s: 0.7     # Thay đổi Saturation
  hsv_v: 0.4     # Thay đổi Value/Brightness
  flip: 0.5      # Lật ngang 50%
  mosaic: 1.0    # Mosaic augmentation
  mixup: 0.1      # MixUp augmentation
```

### 6.2 Export model
```bash
# ONNX (dùng cho nhiều nền tảng)
yolo export model=E:/AI/models/chick_detector/weights/best.pt format=onnx

# TensorRT (GPU NVIDIA - nhanh hơn)
yolo export model=E:/AI/models/chick_detector/weights/best.pt format=engine

# OpenVINO (CPU Intel)
yolo export model=E:/AI/models/chick_detector/weights/best.pt format=openvino
```

---

## GIAI ĐOẠN 7: Realtime Inference

### 7.1 Từ camera RTSP
```python
import cv2
from ultralytics import YOLO

model = YOLO('E:/AI/models/chick_detector/weights/best.pt')

# RTSP camera
rtsp = 'rtsp://admin:password@192.168.1.72:554/unicast/c1/s0/live'
cap = cv2.VideoCapture(rtsp)

while True:
    ret, frame = cap.read()
    if not ret:
        break

    results = model(frame, conf=0.5)[0]

    # Vẽ boxes
    annotated = results.plot()

    # Đếm
    chickens = [b for b in results.boxes if int(b.cls[0]) == 0]
    cv2.putText(annotated, f" Chickens: {len(chickens)}",
               (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)

    cv2.imshow('Chicken Detection', annotated)

    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()
```

### 7.2 Từ video file
```python
from ultralytics import YOLO

model = YOLO('E:/AI/models/chick_detector/weights/best.pt')
results = model('video.mp4', conf=0.5, save=True)
```

---

## TÓM TẮT CÁC BƯỚC

| Bước | Mô tả                          | Thời gian  |
|------|--------------------------------|-----------|
| 1    | Chuẩn bị dataset (100+ ảnh)    | 2-5 ngày  |
| 2    | Label ảnh (Roboflow/LabelImg)   | 1-3 ngày  |
| 3    | Cài đặt môi trường              | 30 phút   |
| 4    | Train model (100 epochs)        | 2-6 giờ   |
| 5    | Đánh giá và tinh chỉnh          | 1-2 giờ   |
| 6    | Tích hợp vào hệ thống           | 2-4 giờ   |

---

## HARDWARE KHUYẾN NGHỊ

| GPU           | Batch Size | Imgsz | Thời gian train 100 epochs |
|--------------|-----------|-------|-----------------------------|
| RTX 1650 4GB | 8-16      | 640   | ~4-6 giờ                   |
| RTX 3060 12GB| 16-32     | 640   | ~2-3 giờ                   |
| RTX 4090 24GB| 32+       | 1280  | ~1-2 giờ                   |
| CPU (i7)     | 4-8       | 640   | ~12-24 giờ                 |

---

## DEBUG KHI MODEL NHẬN SAI

1. **Detect thiếu**: Giảm conf, tăng data train, giảm imgsz
2. **False positive**: Tăng conf, thêm negative samples
3. **Nhận sai loại**: Kiểm tra lại label, cân bằng dataset
4. **Chồng lên nhau**: Train thêm ảnh crowded, dùng augmentation phù hợp
5. **Ánh sáng kém**: Train thêm ảnh điều kiện ánh sáng yếu
