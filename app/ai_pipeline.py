import base64
import logging
import os
from dataclasses import dataclass
from io import BytesIO
from functools import lru_cache

import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor
from ultralytics import YOLO

logger = logging.getLogger(__name__)

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
DETECTOR_BACKEND = os.getenv("DETECTOR_BACKEND", "yolo26").strip().lower()
ULTRALYTICS_YOLO_BACKENDS = {"yolov8", "yolo11", "yolo26"}
ALLOWED_DETECTOR_BACKENDS = {*ULTRALYTICS_YOLO_BACKENDS, "yolo_world"}
FALLBACK_TO_YOLOV8 = os.getenv("FALLBACK_TO_YOLOV8", "true").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
YOLO_MODEL_PATH = os.getenv("YOLO_MODEL_PATH", "yolo26n.pt")
CLIP_MODEL_NAME = os.getenv("CLIP_MODEL_NAME", "openai/clip-vit-base-patch32")
YOLO_CONFIDENCE_THRESHOLD = float(os.getenv("YOLO_CONFIDENCE_THRESHOLD", "0.25"))
YOLO_IOU_THRESHOLD = float(os.getenv("YOLO_IOU_THRESHOLD", "0.45"))
YOLO_MAX_DETECTIONS = int(os.getenv("YOLO_MAX_DETECTIONS", "20"))
YOLO_WORLD_MODEL = os.getenv("YOLO_WORLD_MODEL", "yolov8s-world.pt")
YOLO_WORLD_CONFIDENCE = float(os.getenv("YOLO_WORLD_CONFIDENCE", "0.20"))
YOLO_WORLD_IOU = float(os.getenv("YOLO_WORLD_IOU", "0.50"))
YOLO_WORLD_MAX_DETECTIONS = int(os.getenv("YOLO_WORLD_MAX_DETECTIONS", "30"))
YOLO_WORLD_PROMPT_PRESETS = {
    "general_product": ["product", "package", "box", "small object"],
    "industrial_parts": [
        "industrial component",
        "electrical component",
        "button switch",
        "relay",
        "connector",
        "pneumatic fitting",
        "terminal block",
    ],
    "plastic_wrapped": [
        "plastic wrapped product",
        "bagged component",
        "small packaged item",
    ],
}
DEFAULT_YOLO_WORLD_PROMPTS = [
    "product",
    "industrial component",
    "electrical component",
    "small box",
    "package",
    "button switch",
    "relay",
    "connector",
    "pneumatic fitting",
    "plastic wrapped product",
]
YOLO_WORLD_PROMPT_PRESET = os.getenv("YOLO_WORLD_PROMPT_PRESET", "").strip()
MIN_CROP_DIMENSION_PX = int(os.getenv("MIN_CROP_DIMENSION_PX", "32"))
MIN_CROP_AREA_RATIO = float(os.getenv("MIN_CROP_AREA_RATIO", "0.001"))
MIN_DETECTION_AREA_RATIO = float(os.getenv("MIN_DETECTION_AREA_RATIO", "0.002"))
MAX_DETECTION_AREA_RATIO = float(os.getenv("MAX_DETECTION_AREA_RATIO", "0.80"))
MAX_DETECTIONS_PER_IMAGE = int(os.getenv("MAX_DETECTIONS_PER_IMAGE", "30"))
FULL_IMAGE_BOX_CONFIDENCE = float(os.getenv("FULL_IMAGE_BOX_CONFIDENCE", "0.95"))


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


def _parse_yolo_world_prompts() -> list[str]:
    raw_prompts = os.getenv("YOLO_WORLD_PROMPTS", "").strip()
    if raw_prompts:
        return [prompt.strip() for prompt in raw_prompts.split(",") if prompt.strip()]

    if YOLO_WORLD_PROMPT_PRESET:
        prompts = YOLO_WORLD_PROMPT_PRESETS.get(YOLO_WORLD_PROMPT_PRESET)
        if prompts:
            return prompts
        logger.warning("Unknown YOLO_WORLD_PROMPT_PRESET=%s", YOLO_WORLD_PROMPT_PRESET)

    return DEFAULT_YOLO_WORLD_PROMPTS


@dataclass(frozen=True)
class DetectionResult:
    box: list[float]
    confidence: float | None
    class_id: int | None
    class_name: str | None
    source: str
    model: str
    prompt: str | None = None


class DetectorLoadError(RuntimeError):
    pass


class BaseDetector:
    source = "base"
    model_name = ""

    def detect(self, img: Image.Image) -> list[DetectionResult]:
        raise NotImplementedError


def _result_names(result) -> dict:
    names = getattr(result, "names", None)
    if isinstance(names, dict):
        return names
    model = getattr(result, "model", None)
    names = getattr(model, "names", None)
    return names if isinstance(names, dict) else {}


def _detections_from_ultralytics_result(
    result,
    *,
    source: str,
    model_name: str,
    width: int,
    height: int,
    prompt_labels: list[str] | None = None,
) -> list[DetectionResult]:
    if result is None or len(result.boxes) == 0:
        return []

    result_boxes = result.boxes
    names = _result_names(result)
    boxes = result_boxes.xyxy.tolist()
    confidences = (
        result_boxes.conf.tolist()
        if getattr(result_boxes, "conf", None) is not None
        else [None] * len(boxes)
    )
    class_ids = (
        result_boxes.cls.tolist()
        if getattr(result_boxes, "cls", None) is not None
        else [None] * len(boxes)
    )
    detections = []

    for box, confidence, raw_class_id in zip(boxes, confidences, class_ids):
        left, top, right, bottom = box
        left = max(0.0, min(float(left), float(width)))
        top = max(0.0, min(float(top), float(height)))
        right = max(0.0, min(float(right), float(width)))
        bottom = max(0.0, min(float(bottom), float(height)))

        if right <= left or bottom <= top:
            continue

        class_id = int(raw_class_id) if raw_class_id is not None else None
        class_name = names.get(class_id) if class_id is not None else None
        prompt = None
        if prompt_labels and class_id is not None and 0 <= class_id < len(prompt_labels):
            prompt = prompt_labels[class_id]
            class_name = class_name or prompt

        detections.append(
            DetectionResult(
                box=[left, top, right, bottom],
                confidence=float(confidence) if confidence is not None else None,
                class_id=class_id,
                class_name=class_name,
                source=source,
                model=model_name,
                prompt=prompt or class_name,
            )
        )

    return detections


class YOLOv8Detector(BaseDetector):
    source = "yolov8"

    def __init__(self, model_path: str = YOLO_MODEL_PATH, source: str = "yolov8"):
        self.model_name = model_path
        self.source = source
        self.model = YOLO(model_path)

    def detect(self, img: Image.Image) -> list[DetectionResult]:
        results = self.model.predict(
            img,
            classes=_parse_yolo_classes(),
            conf=YOLO_CONFIDENCE_THRESHOLD,
            iou=YOLO_IOU_THRESHOLD,
            max_det=min(YOLO_MAX_DETECTIONS, MAX_DETECTIONS_PER_IMAGE),
            verbose=False,
        )
        if not results:
            return []
        width, height = img.size
        return _detections_from_ultralytics_result(
            results[0],
            source=self.source,
            model_name=self.model_name,
            width=width,
            height=height,
        )


class YOLOWorldDetector(BaseDetector):
    source = "yolo_world"

    def __init__(self, model_path: str = YOLO_WORLD_MODEL):
        self.model_name = model_path
        self.prompts = _parse_yolo_world_prompts()
        try:
            self.model = YOLO(model_path)
        except Exception as exc:
            raise DetectorLoadError(f"Could not load YOLO-World model {model_path}: {exc}") from exc

        if hasattr(self.model, "set_classes"):
            try:
                self.model.set_classes(self.prompts)
            except Exception as exc:
                logger.warning("Could not set YOLO-World prompts: %s", exc)
        else:
            logger.warning("YOLO-World model does not expose set_classes; using defaults")

    def detect(self, img: Image.Image) -> list[DetectionResult]:
        results = self.model.predict(
            img,
            conf=YOLO_WORLD_CONFIDENCE,
            iou=YOLO_WORLD_IOU,
            max_det=min(YOLO_WORLD_MAX_DETECTIONS, MAX_DETECTIONS_PER_IMAGE),
            verbose=False,
        )
        if not results:
            return []
        width, height = img.size
        return _detections_from_ultralytics_result(
            results[0],
            source=self.source,
            model_name=self.model_name,
            width=width,
            height=height,
            prompt_labels=self.prompts,
        )


@lru_cache(maxsize=1)
def get_detector() -> BaseDetector:
    if DETECTOR_BACKEND not in ALLOWED_DETECTOR_BACKENDS:
        raise DetectorLoadError(
            f"Invalid DETECTOR_BACKEND={DETECTOR_BACKEND}. "
            f"Allowed values: {sorted(ALLOWED_DETECTOR_BACKENDS)}"
        )

    if DETECTOR_BACKEND == "yolo_world":
        try:
            return YOLOWorldDetector()
        except Exception as exc:
            if FALLBACK_TO_YOLOV8:
                logger.error("YOLO-World failed; falling back to YOLO detector: %s", exc)
                return YOLOv8Detector(source="yolo26")
            raise

    return YOLOv8Detector(source=DETECTOR_BACKEND)


def get_detector_info() -> dict:
    return {
        "detector_backend": DETECTOR_BACKEND,
        "active_backend": DETECTOR_BACKEND,
        "note": "Fallback backend is resolved lazily during detection.",
        "fallback_to_yolov8": FALLBACK_TO_YOLOV8,
        "yolo_model": YOLO_MODEL_PATH,
        "yolo26_model": YOLO_MODEL_PATH if DETECTOR_BACKEND == "yolo26" else None,
        "yolov8_model": YOLO_MODEL_PATH,
        "yolov8_confidence": YOLO_CONFIDENCE_THRESHOLD,
        "yolov8_iou": YOLO_IOU_THRESHOLD,
        "yolov8_max_detections": YOLO_MAX_DETECTIONS,
        "yolo_world_model": YOLO_WORLD_MODEL,
        "yolo_world_prompts": _parse_yolo_world_prompts(),
        "yolo_world_confidence": YOLO_WORLD_CONFIDENCE,
        "yolo_world_iou": YOLO_WORLD_IOU,
        "yolo_world_max_detections": YOLO_WORLD_MAX_DETECTIONS,
        "min_detection_area_ratio": MIN_DETECTION_AREA_RATIO,
        "max_detection_area_ratio": MAX_DETECTION_AREA_RATIO,
        "max_detections_per_image": MAX_DETECTIONS_PER_IMAGE,
    }


@lru_cache(maxsize=1)
def _load_clip_model() -> CLIPModel:
    return CLIPModel.from_pretrained(CLIP_MODEL_NAME).to(DEVICE)


@lru_cache(maxsize=1)
def _load_clip_processor() -> CLIPProcessor:
    return CLIPProcessor.from_pretrained(CLIP_MODEL_NAME)


class RegistrationImageError(ValueError):
    pass


def _box_area_ratio(box: list[float], width: int, height: int) -> float:
    left, top, right, bottom = box
    box_width = max(0.0, right - left)
    box_height = max(0.0, bottom - top)
    full_area = max(1.0, float(width * height))
    return (box_width * box_height) / full_area


def _filter_detection_results(
    detections: list[DetectionResult],
    *,
    width: int,
    height: int,
) -> list[DetectionResult]:
    filtered = []
    for detection in detections:
        left, top, right, bottom = detection.box
        if right <= left or bottom <= top:
            continue

        area_ratio = _box_area_ratio(detection.box, width, height)
        confidence = detection.confidence if detection.confidence is not None else 0.0
        if area_ratio < MIN_DETECTION_AREA_RATIO:
            continue
        if area_ratio > MAX_DETECTION_AREA_RATIO and confidence < FULL_IMAGE_BOX_CONFIDENCE:
            continue

        filtered.append(detection)

    filtered.sort(key=lambda detection: detection.confidence or 0.0, reverse=True)
    return filtered[:MAX_DETECTIONS_PER_IMAGE]


def _detection_to_dict(detection: DetectionResult) -> dict:
    return {
        "box": detection.box,
        "detector_confidence": detection.confidence,
        "detector_backend": detection.source,
        "detector_model": detection.model,
        "detector_class_id": detection.class_id,
        "detector_class_name": detection.class_name,
        "detector_prompt": detection.prompt,
    }


def _detect_detections(img: Image.Image) -> list[dict]:
    width, height = img.size
    detections = get_detector().detect(img)
    return [
        _detection_to_dict(detection)
        for detection in _filter_detection_results(
            detections,
            width=width,
            height=height,
        )
    ]


def _detect_with_backend(img: Image.Image, detector: BaseDetector) -> list[dict]:
    width, height = img.size
    detections = detector.detect(img)
    return [
        _detection_to_dict(detection)
        for detection in _filter_detection_results(
            detections,
            width=width,
            height=height,
        )
    ]


def compare_detectors(image_path: str) -> dict:
    img = Image.open(image_path).convert("RGB")
    yolo_backend = DETECTOR_BACKEND if DETECTOR_BACKEND in ULTRALYTICS_YOLO_BACKENDS else "yolo26"
    yolo_detections = _detect_with_backend(img, YOLOv8Detector(source=yolo_backend))
    comparison = {
        yolo_backend: {
            "backend": yolo_backend,
            "model": YOLO_MODEL_PATH,
            "detection_count": len(yolo_detections),
            "detections": yolo_detections,
        },
        "yolo_world": {
            "backend": "yolo_world",
            "model": YOLO_WORLD_MODEL,
            "prompts": _parse_yolo_world_prompts(),
            "detection_count": 0,
            "detections": [],
            "error": None,
            "fallback_used": False,
        },
    }

    try:
        world_detections = _detect_with_backend(img, YOLOWorldDetector())
        comparison["yolo_world"]["detection_count"] = len(world_detections)
        comparison["yolo_world"]["detections"] = world_detections
    except Exception as exc:
        comparison["yolo_world"]["error"] = str(exc)
        if FALLBACK_TO_YOLOV8:
            comparison["yolo_world"]["fallback_used"] = True
            comparison["yolo_world"]["detections"] = yolo_detections
            comparison["yolo_world"]["detection_count"] = len(yolo_detections)

    return comparison


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

    if not _env_flag("REGISTRATION_USE_DETECTOR_CROP", False):
        images = [img]
    else:
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
                "detector_backend": get_detector().source,
                "detector_model": get_detector().model_name,
                "detector_class_id": None,
                "detector_class_name": None,
                "detector_prompt": "full_image_fallback",
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
            "detector_backend": detection.get("detector_backend"),
            "detector_model": detection.get("detector_model"),
            "detector_class_id": detection.get("detector_class_id"),
            "detector_class_name": detection.get("detector_class_name"),
            "detector_prompt": detection.get("detector_prompt"),
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
