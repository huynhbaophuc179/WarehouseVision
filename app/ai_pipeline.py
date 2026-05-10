import base64
import os
from io import BytesIO
from functools import lru_cache

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor
from ultralytics import YOLO

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "yolov8n.pt")
CLIP_MODEL_NAME = os.getenv("CLIP_MODEL_NAME", "openai/clip-vit-base-patch32")
MIN_CROP_DIMENSION_PX = int(os.getenv("MIN_CROP_DIMENSION_PX", "32"))
MIN_CROP_AREA_RATIO = float(os.getenv("MIN_CROP_AREA_RATIO", "0.001"))


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


def _detect_detections(img: Image.Image) -> list[dict]:
    yolo_model = _load_yolo_model()
    results = yolo_model.predict(img, classes=_parse_yolo_classes(), verbose=False)

    if not results or len(results[0].boxes) == 0:
        return []

    width, height = img.size
    detections = []
    result_boxes = results[0].boxes
    confidences = (
        result_boxes.conf.tolist()
        if getattr(result_boxes, "conf", None) is not None
        else [None] * len(result_boxes.xyxy)
    )

    for box, confidence in zip(result_boxes.xyxy.tolist(), confidences):
        left, top, right, bottom = box
        left = max(0.0, min(float(left), float(width)))
        top = max(0.0, min(float(top), float(height)))
        right = max(0.0, min(float(right), float(width)))
        bottom = max(0.0, min(float(bottom), float(height)))

        if right > left and bottom > top:
            detections.append(
                {
                    "box": [left, top, right, bottom],
                    "detector_confidence": float(confidence)
                    if confidence is not None
                    else None,
                }
            )

    return detections


def _detect_boxes(img: Image.Image) -> list[list[float]]:
    return [detection["box"] for detection in _detect_detections(img)]


def _crop_images(img: Image.Image, boxes: list[list[float]]) -> list[Image.Image]:
    return [img.crop(tuple(box)) for box in boxes]


def _crop_preview_base64(crop: Image.Image) -> str:
    preview = crop.copy()
    preview.thumbnail((256, 256))
    buffer = BytesIO()
    preview.save(buffer, format="JPEG", quality=85)
    return base64.b64encode(buffer.getvalue()).decode("ascii")


def _crop_metadata(box: list[float], full_width: int, full_height: int) -> dict:
    left, top, right, bottom = box
    crop_width = max(0.0, right - left)
    crop_height = max(0.0, bottom - top)
    crop_area = crop_width * crop_height
    full_area = max(1.0, float(full_width * full_height))
    crop_area_ratio = crop_area / full_area
    is_valid_crop = (
        crop_width >= MIN_CROP_DIMENSION_PX
        and crop_height >= MIN_CROP_DIMENSION_PX
        and crop_area_ratio >= MIN_CROP_AREA_RATIO
    )

    return {
        "crop_width": float(crop_width),
        "crop_height": float(crop_height),
        "crop_area_ratio": float(crop_area_ratio),
        "is_valid_crop": is_valid_crop,
    }


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
    detections = _detect_detections(img)

    if not detections:
        detections = [
            {
                "box": [0.0, 0.0, float(width), float(height)],
                "detector_confidence": None,
            }
        ]

    boxes = [detection["box"] for detection in detections]
    crops = _crop_images(img, boxes)
    response_items = []
    valid_crop_indices = []

    for index, (detection, crop) in enumerate(zip(detections, crops)):
        crop_info = _crop_metadata(detection["box"], width, height)
        response_item = {
            "box": detection["box"],
            "detector_confidence": detection["detector_confidence"],
            "crop_preview_base64": _crop_preview_base64(crop),
            "embedding": None,
            **crop_info,
        }
        response_items.append(response_item)

        if crop_info["is_valid_crop"]:
            valid_crop_indices.append(index)

    embeddings = _embed_images([crops[index] for index in valid_crop_indices])

    if len(embeddings) != len(valid_crop_indices):
        raise ValueError(
            f"Expected {len(valid_crop_indices)} embeddings, got {len(embeddings)}"
        )

    for item_index, embedding in zip(valid_crop_indices, embeddings):
        response_items[item_index]["embedding"] = embedding

    return response_items
