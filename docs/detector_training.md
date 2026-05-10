# Training A One-Class Product Detector

WarehouseVision uses YOLO only to find product regions for cropping. YOLO does not identify the SKU. SKU recognition still comes from CLIP embeddings and pgvector nearest-neighbor search.

## Detector Goal

Train one YOLO detection class:

```yaml
names:
  0: product
```

The detector should find valid inventory products in warehouse scenes and ignore background clutter.

## Dataset Layout

Use standard YOLO image and label folders:

```text
datasets/product_detector/
├── images/
│   ├── train/
│   └── val/
├── labels/
│   ├── train/
│   └── val/
└── data.yaml
```

Example `data.yaml`:

```yaml
path: datasets/product_detector
train: images/train
val: images/val
names:
  0: product
```

## Annotation Rules

- Annotate valid inventory products only.
- Do not annotate loose wires, connectors, background, labels by themselves, hands, tools, shelves, bags, oil stains, or clutter.
- Do not annotate heavily cut-off objects that would not be useful for recognition.
- Include realistic hard negative scenes with wires, background clutter, torn packaging, and partial objects, but leave those objects unlabeled.
- Prefer boxes that tightly cover the visible product body, not the surrounding bag or empty background.

## Training Commands

YOLO11n:

```bash
yolo detect train model=yolo11n.pt data=datasets/product_detector/data.yaml epochs=80 imgsz=960 batch=8
```

YOLOv8n:

```bash
yolo detect train model=yolov8n.pt data=datasets/product_detector/data.yaml epochs=80 imgsz=960 batch=8
```

## Use The Trained Model

Copy the trained weights into the mounted model folder:

```bash
mkdir -p models
cp runs/detect/train/weights/best.pt models/best.pt
```

Set the API model path:

```yaml
YOLO_MODEL_PATH: /models/best.pt
```

Then rebuild and start:

```bash
docker compose up --build
```

Keep `YOLO_CLASSES` empty for a one-class custom detector unless you intentionally need to restrict class IDs. Tune `YOLO_CONFIDENCE_THRESHOLD`, `YOLO_IOU_THRESHOLD`, and `YOLO_MAX_DETECTIONS` with real warehouse images before trusting detection quality.
