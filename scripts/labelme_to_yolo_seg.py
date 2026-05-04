"""
Labelme to YOLO Segmentation Converter
Converts polygon annotations to YOLO segmentation format (.txt)
"""

import json
import os
from pathlib import Path
from PIL import Image


def polygon_to_yolo_segment(points, img_width, img_height):
    """
    Convert polygon points to YOLO segmentation format (normalized coordinates)

    Args:
        points: [[x1,y1], [x2,y2], ...] in absolute pixel coordinates
        img_width: image width
        img_height: image height

    Returns:
        string in format: "x1,y1 x2,y2 x3,y3 ..."
    """
    yolo_points = []
    for x, y in points:
        # Normalize to 0-1
        nx = x / img_width
        ny = y / img_height
        yolo_points.append(f"{nx:.6f} {ny:.6f}")

    return " ".join(yolo_points)


def convert_labelme_to_yolo_seg(json_file, output_dir, class_names):
    """
    Convert a single labelme JSON file to YOLO segmentation format

    Args:
        json_file: path to labelme JSON file
        output_dir: directory to save .txt label files
        class_names: list of class names in order (e.g., ['low_density', 'medium_density', 'high_density'])
    """
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)

    # Get image size
    img_path = os.path.join(os.path.dirname(json_file), data['imagePath'])
    if not os.path.exists(img_path):
        # Try relative to json file
        img_path = json_file.replace('.json', '.jpg')
        if not os.path.exists(img_path):
            img_path = json_file.replace('.json', '.png')

    if os.path.exists(img_path):
        img = Image.open(img_path)
        img_width, img_height = img.size
    else:
        print(f"Warning: Image not found for {json_file}")
        return False

    # Process each shape
    for shape in data['shapes']:
        label = shape['label']
        points = shape['points']

        if label not in class_names:
            print(f"Warning: Unknown label '{label}' in {json_file}")
            continue

        class_id = class_names.index(label)

        # Convert to YOLO format
        yolo_segment = polygon_to_yolo_segment(points, img_width, img_height)

        # Write to output file
        label_file = os.path.join(output_dir, Path(json_file).stem + '.txt')

        # Append or create
        with open(label_file, 'a', encoding='utf-8') as f:
            f.write(f"{class_id} {yolo_segment}\n")

    return True


def batch_convert(json_dir, output_dir, class_names):
    """
    Batch convert all labelme JSON files in a directory

    Args:
        json_dir: directory containing labelme JSON files
        output_dir: directory to save YOLO label files
        class_names: list of class names in order
    """
    os.makedirs(output_dir, exist_ok=True)

    json_files = [f for f in os.listdir(json_dir) if f.endswith('.json')]
    converted = 0

    for json_file in json_files:
        json_path = os.path.join(json_dir, json_file)
        if convert_labelme_to_yolo_seg(json_path, output_dir, class_names):
            converted += 1

    print(f"Converted {converted}/{len(json_files)} files")
    return converted


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description='Convert labelme annotations to YOLO segmentation format')
    parser.add_argument('--json_dir', required=True, help='Directory containing labelme JSON files')
    parser.add_argument('--output_dir', required=True, help='Directory to save YOLO label files')
    parser.add_argument('--classes', default='low_density,medium_density,high_density',
                       help='Comma-separated class names in order')

    args = parser.parse_args()

    class_names = args.classes.split(',')

    print(f"Converting labelme annotations to YOLO segmentation format")
    print(f"Classes: {class_names}")
    print(f"JSON dir: {args.json_dir}")
    print(f"Output dir: {args.output_dir}")

    batch_convert(args.json_dir, args.output_dir, class_names)