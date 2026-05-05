import os
from functools import lru_cache

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor
from ultralytics import YOLO

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")
CLIP_MODEL_NAME = os.getenv("CLIP_MODEL_NAME", "openai/clip-vit-base-patch32")


def _parse_yolo_classes() -> list[int] | None:
    raw_classes = os.getenv("YOLO_CLASSES", "41,44,46").strip()
    if not raw_classes:
        return None
    return [int(class_id.strip()) for class_id in raw_classes.split(",") if class_id.strip()]


@lru_cache(maxsize=1)
def _load_yolo_model() -> YOLO:
    return YOLO(YOLO_MODEL_PATH)


@lru_cache(maxsize=1)
def _load_clip_model() -> CLIPModel:
    return CLIPModel.from_pretrained(CLIP_MODEL_NAME).to(DEVICE)


@lru_cache(maxsize=1)
def _load_clip_processor() -> CLIPProcessor:
    return CLIPProcessor.from_pretrained(CLIP_MODEL_NAME)


def _crop_largest_detection(img: Image.Image) -> Image.Image:
    yolo_model = _load_yolo_model()
    results = yolo_model.predict(img, classes=_parse_yolo_classes(), verbose=False)

    if not results or len(results[0].boxes) == 0:
        return img

    boxes = results[0].boxes.xyxy.tolist()
    largest_box = max(boxes, key=lambda box: (box[2] - box[0]) * (box[3] - box[1]))
    left, top, right, bottom = largest_box
    return img.crop((left, top, right, bottom))


def process_image(image_path: str) -> list[float]:
    img = Image.open(image_path).convert("RGB")
    img = _crop_largest_detection(img)

    clip_processor = _load_clip_processor()
    clip_model = _load_clip_model()
    inputs = clip_processor(images=img, return_tensors="pt").to(DEVICE)

    with torch.no_grad():
        vision_outputs = clip_model.vision_model(pixel_values=inputs["pixel_values"])
        image_features = clip_model.visual_projection(vision_outputs.pooler_output)

    image_features = image_features / image_features.norm(p=2, dim=-1, keepdim=True)
    image_features = image_features.squeeze(0)

    if image_features.ndim != 1 or image_features.shape[0] != 512:
        raise ValueError(f"Expected a 512-dimensional embedding, got {tuple(image_features.shape)}")

    return image_features.tolist()
