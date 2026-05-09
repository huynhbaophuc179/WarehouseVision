import os
from functools import lru_cache

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor
from ultralytics import YOLO

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")
CLIP_MODEL_NAME = os.getenv("CLIP_MODEL_NAME", "openai/clip-vit-base-patch32")


def _env_flag(name: str, default: bool) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def _parse_yolo_classes() -> list[int] | None:
    raw_classes = os.getenv("YOLO_CLASSES", "").strip()
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


class RegistrationImageError(ValueError):
    pass


def _detect_boxes(img: Image.Image) -> list[list[float]]:
    yolo_model = _load_yolo_model()
    results = yolo_model.predict(img, classes=_parse_yolo_classes(), verbose=False)

    if not results or len(results[0].boxes) == 0:
        return []

    width, height = img.size
    boxes = []

    for box in results[0].boxes.xyxy.tolist():
        left, top, right, bottom = box
        left = max(0.0, min(float(left), float(width)))
        top = max(0.0, min(float(top), float(height)))
        right = max(0.0, min(float(right), float(width)))
        bottom = max(0.0, min(float(bottom), float(height)))

        if right > left and bottom > top:
            boxes.append([left, top, right, bottom])

    return boxes


def _crop_images(img: Image.Image, boxes: list[list[float]]) -> list[Image.Image]:
    return [img.crop(tuple(box)) for box in boxes]


def _embed_images(images: list[Image.Image]) -> list[list[float]]:
    if not images:
        return []

    clip_processor = _load_clip_processor()
    clip_model = _load_clip_model()
    inputs = clip_processor(images=images, return_tensors="pt").to(DEVICE)

    with torch.no_grad():
        vision_outputs = clip_model.vision_model(pixel_values=inputs["pixel_values"])
        image_features = clip_model.visual_projection(vision_outputs.pooler_output)

    image_features = image_features / image_features.norm(p=2, dim=-1, keepdim=True)

    if image_features.ndim != 2 or image_features.shape[1] != 512:
        raise ValueError(f"Expected N x 512 embeddings, got {tuple(image_features.shape)}")

    return image_features.tolist()


def process_image(image_path: str) -> list[float]:
    img = Image.open(image_path).convert("RGB")
    embeddings = _embed_images([img])

    if len(embeddings) != 1:
        raise ValueError(f"Expected one embedding, got {len(embeddings)}")

    return embeddings[0]


def process_registration_image(image_path: str) -> list[float]:
    img = Image.open(image_path).convert("RGB")
    boxes = _detect_boxes(img)

    if len(boxes) > 1:
        raise RegistrationImageError(
            "Vui lòng chụp ảnh chỉ chứa 1 sản phẩm duy nhất để làm mẫu"
        )

    if len(boxes) == 1:
        images = _crop_images(img, boxes)
    elif _env_flag("REGISTRATION_FALLBACK_TO_FULL_IMAGE", True):
        images = [img]
    else:
        raise RegistrationImageError("Không phát hiện sản phẩm trong ảnh mẫu")

    embeddings = _embed_images(images)

    if len(embeddings) != 1:
        raise ValueError(f"Expected one registration embedding, got {len(embeddings)}")

    return embeddings[0]


def process_multiple_images(image_path: str) -> list[dict]:
    img = Image.open(image_path).convert("RGB")
    width, height = img.size
    boxes = _detect_boxes(img)

    if not boxes:
        boxes = [[0.0, 0.0, float(width), float(height)]]

    embeddings = _embed_images(_crop_images(img, boxes))

    if len(embeddings) != len(boxes):
        raise ValueError(f"Expected {len(boxes)} embeddings, got {len(embeddings)}")

    return [
        {"box": box, "embedding": embedding}
        for box, embedding in zip(boxes, embeddings)
    ]
