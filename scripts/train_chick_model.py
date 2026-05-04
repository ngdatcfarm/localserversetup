"""
Train YOLOv8 on chick dataset for enhanced counting.
Run this script to fine-tune YOLOv8n on your labeled data.
"""

import zipfile
import os
import sys
from pathlib import Path

# Check if ultralytics is available
try:
    from ultralytics import YOLO
except ImportError:
    print("Installing ultralytics...")
    os.system("pip install ultralytics")
    from ultralytics import YOLO

def prepare_dataset():
    """Prepare dataset in YOLO format."""
    dataset_dir = Path("E:/AI/Dataset")
    output_dir = Path("E:/AI/Dataset/exported")
    output_dir.mkdir(exist_ok=True)

    images_dir = output_dir / "images"
    labels_dir = output_dir / "labels"
    images_dir.mkdir(exist_ok=True)
    labels_dir.mkdir(exist_ok=True)

    # Get all images from DB or export zip
    # For now, copy existing dataset images
    for img_path in dataset_dir.glob("*.png"):
        import shutil
        shutil.copy(img_path, images_dir / img_path.name)

    return output_dir

def train_model(data_yaml_path, epochs=50, imgsz=640):
    """Fine-tune YOLOv8n on chick dataset."""
    print(f"Training YOLOv8n on chick dataset...")
    print(f"Dataset: {data_yaml_path}")
    print(f"Epochs: {epochs}, Image size: {imgsz}")

    # Load pretrained YOLOv8n
    model = YOLO('yolov8n.pt')

    # Fine-tune
    results = model.train(
        data=data_yaml_path,
        epochs=epochs,
        imgsz=imgsz,
        batch=8,
        patience=10,
        save=True,
        project='E:/AI/models',
        name='chick_detector',
        exist_ok=True,
        verbose=True,
    )

    # Export to ONNX for inference
    best_model_path = f"E:/AI/models/chick_detector/weights/best.pt"
    if Path(best_model_path).exists():
        export_path = best_model_path.replace('.pt', '.onnx')
        model.export(format='onnx', model=best_model_path)
        print(f"Model exported to: {export_path}")
    else:
        print("Training completed. Model at:", results.save_dir)

    return results

def create_dataset_yaml():
    """Create dataset.yaml for training."""
    yaml_content = """# Chick Detection Dataset
path: E:/AI/Dataset/exported
train: images
val: images

names:
  0: chick

# Number of classes
nc: 1
"""
    yaml_path = Path("E:/AI/Dataset/dataset.yaml")
    yaml_path.write_text(yaml_content)
    print(f"Dataset YAML created at: {yaml_path}")
    return str(yaml_path)

if __name__ == "__main__":
    print("=== Chick Detection Model Training ===")
    print("This script fine-tunes YOLOv8n on your labeled chick dataset.")
    print()

    # Create dataset YAML
    yaml_path = create_dataset_yaml()

    # Train (default: 50 epochs)
    epochs = int(sys.argv[1]) if len(sys.argv) > 1 else 50

    print(f"Starting training with {epochs} epochs...")
    train_model(yaml_path, epochs=epochs)

    print("\nTraining complete!")
    print("Model will be saved to: E:/AI/models/chick_detector/")
    print("\nTo use the model for counting, update the count.js to load from:")
    print("  E:/AI/models/chick_detector/weights/best.pt")