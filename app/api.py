import base64
import json
import logging
import mimetypes
import os
import re
import shutil
import subprocess
import tempfile
import unicodedata
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from difflib import SequenceMatcher
from functools import lru_cache
from io import BytesIO
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from PIL import Image

from .ai_pipeline import (
    RegistrationImageError,
    compare_detectors,
    get_detector_info,
    process_image,
    process_multiple_images,
    process_registration_image,
)
from .database import SessionLocal, init_db
from .models import (
    DetectionReview,
    InventoryTransaction,
    Product,
    ProductEmbedding,
    RecognitionSession,
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

DETECTOR_RECOGNIZED_CONFIDENCE_THRESHOLD = float(
    os.getenv("DETECTOR_RECOGNIZED_CONFIDENCE_THRESHOLD", "0.60")
)
DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD = float(
    os.getenv("DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD", "0.45")
)
SIMILARITY_RECOGNIZED_THRESHOLD = float(
    os.getenv("SIMILARITY_RECOGNIZED_THRESHOLD", "0.15")
)
SIMILARITY_UNKNOWN_THRESHOLD = float(os.getenv("SIMILARITY_UNKNOWN_THRESHOLD", "0.22"))
SIMILARITY_MARGIN_THRESHOLD = float(os.getenv("SIMILARITY_MARGIN_THRESHOLD", "0.03"))
TOP_K_CANDIDATES = int(
    os.getenv("TOP_K_CANDIDATES", os.getenv("RECOGNITION_CANDIDATE_LIMIT", "5"))
)
RECOGNITION_CANDIDATE_LIMIT = TOP_K_CANDIDATES
ENABLE_OCR = os.getenv("ENABLE_OCR", "false").strip().lower() in {
    "1",
    "true",
    "yes",
    "on",
}
OCR_ENGINE = os.getenv("OCR_ENGINE", "easyocr").strip().lower()
IMAGE_SIMILARITY_WEIGHT = float(os.getenv("IMAGE_SIMILARITY_WEIGHT", "0.70"))
TEXT_MATCH_WEIGHT = float(os.getenv("TEXT_MATCH_WEIGHT", "0.25"))
CATEGORY_MATCH_WEIGHT = float(os.getenv("CATEGORY_MATCH_WEIGHT", "0.05"))
OCR_MIN_MEANINGFUL_CHARS = int(os.getenv("OCR_MIN_MEANINGFUL_CHARS", "3"))
TEXT_MATCH_RERANK_THRESHOLD = float(os.getenv("TEXT_MATCH_RERANK_THRESHOLD", "0.60"))
TEXT_MATCH_BONUS_MAX = float(os.getenv("TEXT_MATCH_BONUS_MAX", "0.15"))
TEXT_CONFLICT_THRESHOLD = float(os.getenv("TEXT_CONFLICT_THRESHOLD", "0.15"))
CATEGORY_MATCH_BONUS_MAX = float(os.getenv("CATEGORY_MATCH_BONUS_MAX", "0.03"))
HIGH_CONFIDENCE_THRESHOLD = float(os.getenv("HIGH_CONFIDENCE_THRESHOLD", "0.85"))
MEDIUM_CONFIDENCE_THRESHOLD = float(os.getenv("MEDIUM_CONFIDENCE_THRESHOLD", "0.70"))
MODEL_VERSION = os.getenv("MODEL_VERSION", os.getenv("YOLO_MODEL_PATH", "yolo26m.pt"))
REVIEW_STORAGE_DIR = Path(os.getenv("REVIEW_STORAGE_DIR", "review_data"))
YOLO_DATASET_DIR = Path(os.getenv("YOLO_DATASET_DIR", "data/yolo_dataset"))
PRODUCT_REFERENCE_DIR = Path(os.getenv("PRODUCT_REFERENCE_DIR", "data/product_references"))
APPROVED_EMBEDDING_STATUSES = {"approved", "auto_approved"}
REFERENCE_QUALITY_STATUSES = {"pending", "approved", "auto_approved", "rejected"}
REVIEW_DECISIONS = {
    "accepted",
    "wrong_sku",
    "corrected_product",
    "needs_review",
    "not_product",
    "unknown",
    "rejected_detection",
    "box_adjusted",
    "manually_added",
    "ignored",
}
YOLO_POSITIVE_DECISIONS = {
    "accepted",
    "corrected_product",
    "box_adjusted",
    "manually_added",
}
YOLO_DATA_YAML = """path: {dataset_root}
train: images/train
val: images/val
names:
  0: product
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Visual Search & Inventory PoC",
    version="0.1.0",
    lifespan=lifespan,
)

CORS_ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8501,http://127.0.0.1:8501",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ProductResponse(BaseModel):
    product_id: str
    name: str
    inventory_count: int


class ProductManagementResponse(ProductResponse):
    embedding_count: int = 0
    approved_embedding_count: int = 0
    pending_embedding_count: int = 0
    reference_image_count: int = 0
    thumbnail_base64: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class ProductDeleteResponse(BaseModel):
    product_id: str
    deleted_embeddings: int
    deleted_inventory_transactions: int
    cleared_review_product_links: int
    cleared_review_embedding_links: int


class RecognizeResponse(ProductResponse):
    distance: float


class CandidateResponse(RecognizeResponse):
    matched_embedding_id: int
    matched_view_label: str | None
    product_code: str | None = None
    product_name: str | None = None
    image_similarity_score: float | None = None
    text_match_score: float | None = None
    category_match_score: float | None = None
    ocr_text_found: bool = False
    text_match_used_in_rerank: bool = False
    final_score: float | None = None
    reference_image_path: str | None = None
    confidence_level: str | None = None
    confidence_explanation: list[str] = Field(default_factory=list)
    explanation: list[str] = Field(default_factory=list)


class ProductEmbeddingResponse(BaseModel):
    id: int
    product_id: str
    view_label: str | None
    image_path: str | None
    source: str
    quality_status: str


class ProductEmbeddingDetailResponse(ProductEmbeddingResponse):
    created_at: datetime | None = None
    image_preview_base64: str | None = None


class ProductDetailResponse(ProductManagementResponse):
    embeddings: list[ProductEmbeddingDetailResponse] = Field(default_factory=list)


class MultiRecognizeResponse(BaseModel):
    session_id: int | None
    review_id: int | None
    detection_id: str
    box: list[float]
    crop_preview_base64: str | None
    detector_confidence: float | None
    detector_backend: str | None = None
    detector_model: str | None = None
    detector_prompt: str | None = None
    detector_class_id: int | None = None
    detector_class_name: str | None = None
    product_id: str | None
    name: str | None
    inventory_count: int | None
    distance: float | None
    status: str
    matched_embedding_id: int | None
    matched_view_label: str | None
    top1_distance: float | None
    top2_distance: float | None
    distance_margin: float | None
    raw_ocr_text: str | None = None
    normalized_ocr_text: str | None = None
    image_similarity_score: float | None = None
    text_match_score: float | None = None
    category_match_score: float | None = None
    ocr_text_found: bool = False
    text_match_used_in_rerank: bool = False
    final_score: float | None = None
    confidence_level: str = "UNKNOWN"
    confidence_explanation: list[str] = Field(default_factory=list)
    explanation: list[str] = Field(default_factory=list)
    candidates: list[CandidateResponse] = Field(default_factory=list)


class RecognizeCandidatesResponse(BaseModel):
    candidates: list[CandidateResponse]


class DetectorCompareResponse(BaseModel):
    detector_settings: dict
    comparison: dict


class ConfirmedInventoryItem(BaseModel):
    detection_id: str
    product_id: str
    quantity: int
    action: str


class RejectedInventoryItem(BaseModel):
    detection_id: str
    reason: str


class InventoryConfirmRequest(BaseModel):
    confirmed_items: list[ConfirmedInventoryItem] = Field(default_factory=list)
    rejected_items: list[RejectedInventoryItem] = Field(default_factory=list)


class InventoryConfirmResponse(BaseModel):
    confirmed_items: list[dict]
    rejected_items: list[dict]


class DetectionReviewUpdateRequest(BaseModel):
    user_decision: str
    confirmed_product_id: str | None = None
    corrected_box: list[float] | None = None
    add_as_reference: bool = False
    reference_quality_status: str = "pending"
    use_for_yolo_training: bool = False


class ManualDetectionRequest(BaseModel):
    corrected_box: list[float]
    confirmed_product_id: str | None = None
    external_product_id: str | None = None
    user_decision: str = "manually_added"
    displayed_box: list[float] | None = None
    display_size: list[int] | None = None
    source: str = "human_missing_box"


class DetectionReviewResponse(BaseModel):
    id: int
    session_id: int
    detection_index: int
    original_box: list[float]
    corrected_box: list[float] | None
    crop_path: str | None
    crop_preview_base64: str | None
    predicted_product_id: str | None
    confirmed_product_id: str | None
    user_decision: str
    detector_confidence: float | None
    top1_distance: float | None
    top2_distance: float | None
    distance_margin: float | None
    matched_embedding_id: int | None
    matched_view_label: str | None
    candidates: list[CandidateResponse] = Field(default_factory=list)
    yolo_annotation: dict | None = None
    created_at: datetime


class RecognitionSessionSummary(BaseModel):
    id: int
    original_image_path: str
    status: str
    mode: str
    model_version: str | None
    created_at: datetime
    detection_count: int = 0
    reviewed_count: int = 0
    pending_count: int = 0


class RecognitionSessionDetail(RecognitionSessionSummary):
    original_image_base64: str | None
    original_image_width: int | None
    original_image_height: int | None
    original_image_mime_type: str | None
    preview_image_width: int | None
    preview_image_height: int | None
    preview_image_mime_type: str | None
    detections: list[DetectionReviewResponse]


class RecognitionSessionDeleteResponse(BaseModel):
    deleted: bool
    session_id: int
    detections_removed: int
    artifacts_removed: dict


class ProductEmbeddingQualityStatusRequest(BaseModel):
    quality_status: str


class ProductEmbeddingReviewResponse(ProductEmbeddingResponse):
    product_name: str | None
    image_preview_base64: str | None


class YoloDatasetSummaryResponse(BaseModel):
    dataset_dir: str
    image_count: int
    label_file_count: int
    box_count: int
    pending_review_count: int
    data_yaml_path: str | None


class YoloDatasetExportResponse(BaseModel):
    data_yaml_path: str
    summary: YoloDatasetSummaryResponse


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _save_upload_to_temp(file: UploadFile) -> str:
    suffix = Path(file.filename or "upload.jpg").suffix or ".jpg"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
        shutil.copyfileobj(file.file, temp_file)
        return temp_file.name


def _ensure_image(file: UploadFile) -> None:
    if file.content_type and not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Uploaded file must be an image")


def _ensure_review_storage_dir() -> Path:
    REVIEW_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    return REVIEW_STORAGE_DIR


def _ensure_yolo_dataset_dirs() -> Path:
    for relative_path in (
        "images/train",
        "images/val",
        "labels/train",
        "labels/val",
        "metadata",
        "pending_review",
    ):
        (YOLO_DATASET_DIR / relative_path).mkdir(parents=True, exist_ok=True)
    return YOLO_DATASET_DIR


def _clamp_box_to_image(
    box: list[float],
    width: int,
    height: int,
) -> list[int]:
    x1, y1, x2, y2 = [float(value) for value in box]
    left = int(round(max(0.0, min(min(x1, x2), float(width)))))
    top = int(round(max(0.0, min(min(y1, y2), float(height)))))
    right = int(round(max(0.0, min(max(x1, x2), float(width)))))
    bottom = int(round(max(0.0, min(max(y1, y2), float(height)))))
    return [left, top, right, bottom]


def convert_box_to_yolo(
    box: list[float],
    width: int,
    height: int,
) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = _clamp_box_to_image(box, width, height)
    box_width = max(0, x2 - x1)
    box_height = max(0, y2 - y1)
    x_center = x1 + box_width / 2
    y_center = y1 + box_height / 2
    return (
        x_center / width,
        y_center / height,
        box_width / width,
        box_height / height,
    )


def convert_display_box_to_original(
    display_box: list[float],
    display_width: int,
    display_height: int,
    original_width: int,
    original_height: int,
) -> list[float]:
    scale_x = original_width / display_width
    scale_y = original_height / display_height
    x1, y1, x2, y2 = [float(value) for value in display_box]
    return [
        min(x1, x2) * scale_x,
        min(y1, y2) * scale_y,
        max(x1, x2) * scale_x,
        max(y1, y2) * scale_y,
    ]


def save_annotation_metadata(
    metadata: dict,
    *,
    pending: bool = False,
) -> str:
    dataset_dir = _ensure_yolo_dataset_dirs()
    target_dir = dataset_dir / ("pending_review" if pending else "metadata")
    target_dir.mkdir(parents=True, exist_ok=True)
    metadata_path = target_dir / f"{metadata['annotation_id']}.json"
    metadata_path.write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2, default=str),
        encoding="utf-8",
    )
    return str(metadata_path)


def save_yolo_annotation(
    *,
    session: RecognitionSession,
    review: DetectionReview,
    box: list[float],
    product: Product | None = None,
    external_product_id: str | None = None,
    displayed_box: list[float] | None = None,
    display_size: list[int] | None = None,
    source: str = "human_missing_box",
    split: str = "train",
) -> dict:
    if split not in {"train", "val"}:
        split = "train"
    if not os.path.exists(session.original_image_path):
        raise HTTPException(status_code=400, detail="Original session image is unavailable")

    dataset_dir = _ensure_yolo_dataset_dirs()
    image = Image.open(session.original_image_path).convert("RGB")
    width, height = image.size
    if width <= 0 or height <= 0:
        raise HTTPException(status_code=400, detail="Original session image is invalid")

    clamped_box = _clamp_box_to_image(box, width, height)
    if clamped_box[2] - clamped_box[0] < 10 or clamped_box[3] - clamped_box[1] < 10:
        raise HTTPException(status_code=400, detail="Selected box is too small")

    yolo_box = convert_box_to_yolo(clamped_box, width, height)
    label_line = "0 " + " ".join(f"{value:.6f}" for value in yolo_box)
    stem = f"session_{session.id}"
    annotation_id = f"{stem}_review_{review.id}"
    image_path = dataset_dir / "images" / split / f"{stem}.jpg"
    label_path = dataset_dir / "labels" / split / f"{stem}.txt"

    if not image_path.exists():
        image.save(image_path, format="JPEG", quality=92)

    existing_lines = []
    if label_path.exists():
        existing_lines = [
            line.strip()
            for line in label_path.read_text(encoding="utf-8").splitlines()
            if line.strip()
        ]
    if label_line not in existing_lines:
        existing_lines.append(label_line)
        label_path.write_text("\n".join(existing_lines) + "\n", encoding="utf-8")

    metadata = {
        "annotation_id": annotation_id,
        "original_filename": Path(session.original_image_path).name,
        "original_image_path": session.original_image_path,
        "saved_image_path": str(image_path),
        "saved_dataset_image_path": str(image_path),
        "saved_label_path": str(label_path),
        "saved_yolo_label_path": str(label_path),
        "product_id": product.product_id if product is not None else None,
        "external_product_id": external_product_id,
        "product_name": product.name if product is not None else None,
        "corrected_box": clamped_box,
        "box_original_pixels": {
            "x1": clamped_box[0],
            "y1": clamped_box[1],
            "x2": clamped_box[2],
            "y2": clamped_box[3],
        },
        "displayed_box": displayed_box,
        "box_display_pixels": displayed_box,
        "display_size": display_size,
        "original_image_width": width,
        "original_image_height": height,
        "normalized_yolo_box": {
            "class_id": 0,
            "x_center": yolo_box[0],
            "y_center": yolo_box[1],
            "width": yolo_box[2],
            "height": yolo_box[3],
        },
        "yolo_box": {
            "class_id": 0,
            "x_center": yolo_box[0],
            "y_center": yolo_box[1],
            "width": yolo_box[2],
            "height": yolo_box[3],
        },
        "label": "product",
        "source": source,
        "model_version": session.model_version,
        "session_id": session.id,
        "review_id": review.id,
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    metadata_path = save_annotation_metadata(metadata)
    return {
        "x1": clamped_box[0],
        "y1": clamped_box[1],
        "x2": clamped_box[2],
        "y2": clamped_box[3],
        "label": "product",
        "product_id": product.product_id if product is not None else None,
        "external_product_id": external_product_id,
        "source": source,
        "image_path": str(image_path),
        "label_path": str(label_path),
        "metadata_path": metadata_path,
        "displayed_box": displayed_box,
        "display_size": display_size,
        "corrected_box": clamped_box,
        "original_image_width": width,
        "original_image_height": height,
        "normalized_yolo_box": metadata["normalized_yolo_box"],
    }


def _label_line_from_annotation(annotation: dict) -> str | None:
    yolo_box = annotation.get("normalized_yolo_box") or annotation.get("yolo_box")
    if not yolo_box:
        return None
    try:
        return "0 " + " ".join(
            f"{float(yolo_box[field]):.6f}"
            for field in ("x_center", "y_center", "width", "height")
        )
    except (KeyError, TypeError, ValueError):
        return None


def _metadata_references_label(
    metadata_path: Path,
    label_path: Path,
    label_line: str,
) -> bool:
    try:
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    metadata_label_path = metadata.get("saved_label_path") or metadata.get(
        "saved_yolo_label_path"
    )
    if not metadata_label_path or Path(metadata_label_path) != label_path:
        return False
    return _label_line_from_annotation(metadata) == label_line


def remove_manual_yolo_annotation(review: DetectionReview) -> dict:
    removed = {
        "crop_path": None,
        "metadata_path": None,
        "label_path": None,
        "image_path": None,
    }
    metadata_path = YOLO_DATASET_DIR / "metadata" / (
        f"session_{review.session_id}_review_{review.id}.json"
    )
    metadata = None
    if metadata_path.exists():
        try:
            metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            metadata = None

    if metadata:
        label_path_value = metadata.get("saved_label_path") or metadata.get(
            "saved_yolo_label_path"
        )
        label_path = Path(label_path_value) if label_path_value else None
        label_line = _label_line_from_annotation(metadata)
        if label_path and label_path.exists() and label_line:
            sibling_metadata_paths = [
                path
                for path in metadata_path.parent.glob(
                    f"session_{review.session_id}_review_*.json"
                )
                if path != metadata_path
            ]
            keep_label_line = any(
                _metadata_references_label(path, label_path, label_line)
                for path in sibling_metadata_paths
            )
            if not keep_label_line:
                remaining_lines = [
                    line
                    for line in label_path.read_text(encoding="utf-8").splitlines()
                    if line.strip() and line.strip() != label_line
                ]
                if remaining_lines:
                    label_path.write_text(
                        "\n".join(remaining_lines) + "\n",
                        encoding="utf-8",
                    )
                else:
                    label_path.unlink()
                removed["label_path"] = str(label_path)

        image_path_value = metadata.get("saved_image_path") or metadata.get(
            "saved_dataset_image_path"
        )
        image_path = Path(image_path_value) if image_path_value else None
        if image_path and image_path.exists() and label_path and not label_path.exists():
            has_other_session_metadata = any(
                path != metadata_path
                for path in metadata_path.parent.glob(
                    f"session_{review.session_id}_review_*.json"
                )
            )
            if not has_other_session_metadata:
                image_path.unlink()
                removed["image_path"] = str(image_path)

        metadata_path.unlink(missing_ok=True)
        removed["metadata_path"] = str(metadata_path)

    if review.crop_path and os.path.exists(review.crop_path):
        os.remove(review.crop_path)
        removed["crop_path"] = review.crop_path

    return removed


def _unlink_path(path: Path) -> bool:
    try:
        if path.exists():
            path.unlink()
            return True
    except OSError:
        logger.warning("Could not delete artifact: %s", path)
    return False


def _remove_yolo_session_artifacts(session_id: int) -> dict:
    dataset_dir = _ensure_yolo_dataset_dirs()
    removed = {
        "metadata_paths": [],
        "label_paths": [],
        "image_paths": [],
        "pending_review_paths": [],
    }
    label_lines_by_path: dict[Path, set[str]] = {}
    image_paths_by_label_path: dict[Path, set[Path]] = {}

    metadata_dirs = [
        (dataset_dir / "metadata", "metadata_paths"),
        (dataset_dir / "pending_review", "pending_review_paths"),
    ]
    for metadata_dir, removed_key in metadata_dirs:
        for metadata_path in metadata_dir.glob(f"session_{session_id}_review_*.json"):
            try:
                metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                metadata = {}

            label_path_value = metadata.get("saved_label_path") or metadata.get(
                "saved_yolo_label_path"
            )
            label_line = _label_line_from_annotation(metadata)
            if label_path_value and label_line:
                label_path = Path(label_path_value)
                label_lines_by_path.setdefault(label_path, set()).add(label_line)
                image_path_value = metadata.get("saved_image_path") or metadata.get(
                    "saved_dataset_image_path"
                )
                if image_path_value:
                    image_paths_by_label_path.setdefault(label_path, set()).add(
                        Path(image_path_value)
                    )

            if _unlink_path(metadata_path):
                removed[removed_key].append(str(metadata_path))

    for label_path, label_lines in label_lines_by_path.items():
        if not label_path.exists():
            continue
        remaining_lines = [
            line
            for line in label_path.read_text(encoding="utf-8").splitlines()
            if line.strip() and line.strip() not in label_lines
        ]
        if remaining_lines:
            label_path.write_text("\n".join(remaining_lines) + "\n", encoding="utf-8")
        elif _unlink_path(label_path):
            removed["label_paths"].append(str(label_path))
            for image_path in image_paths_by_label_path.get(label_path, set()):
                if _unlink_path(image_path):
                    removed["image_paths"].append(str(image_path))

    for split in ("train", "val"):
        label_path = dataset_dir / "labels" / split / f"session_{session_id}.txt"
        if _unlink_path(label_path):
            removed["label_paths"].append(str(label_path))
        for image_path in (dataset_dir / "images" / split).glob(f"session_{session_id}.*"):
            if _unlink_path(image_path):
                removed["image_paths"].append(str(image_path))

    return removed


def remove_recognition_session_artifacts(
    db: Session,
    session: RecognitionSession,
) -> dict:
    removed = {
        "original_image_path": None,
        "crop_paths": [],
        "preserved_reference_crop_paths": [],
        "training_data": _remove_yolo_session_artifacts(session.id),
    }

    for review in list(session.detections):
        if not review.crop_path:
            continue
        is_reference_image = (
            db.query(ProductEmbedding.id)
            .filter(ProductEmbedding.image_path == review.crop_path)
            .first()
            is not None
        )
        if is_reference_image:
            removed["preserved_reference_crop_paths"].append(review.crop_path)
            continue
        crop_path = Path(review.crop_path)
        if _unlink_path(crop_path):
            removed["crop_paths"].append(str(crop_path))

    if session.original_image_path:
        original_path = Path(session.original_image_path)
        if _unlink_path(original_path):
            removed["original_image_path"] = str(original_path)

    return removed


def save_correction_event_metadata(
    *,
    session: RecognitionSession,
    review: DetectionReview,
    source: str,
) -> str | None:
    if not os.path.exists(session.original_image_path):
        return None

    metadata = {
        "annotation_id": f"session_{session.id}_review_{review.id}_{source}",
        "original_filename": Path(session.original_image_path).name,
        "saved_image_path": session.original_image_path,
        "saved_label_path": None,
        "product_id": review.confirmed_product_id,
        "product_name": review.confirmed_product.name
        if review.confirmed_product is not None
        else None,
        "box_original_pixels": {
            "x1": review.original_box_x1,
            "y1": review.original_box_y1,
            "x2": review.original_box_x2,
            "y2": review.original_box_y2,
        },
        "created_at": datetime.utcnow().isoformat() + "Z",
        "source": source,
        "model_version": session.model_version,
        "session_id": session.id,
        "review_id": review.id,
        "user_decision": review.user_decision,
        "yolo_positive": False,
    }
    return save_annotation_metadata(metadata, pending=True)


def save_feedback_event_metadata(
    *,
    session: RecognitionSession,
    review: DetectionReview,
    source: str = "human_feedback",
) -> str | None:
    if not os.path.exists(session.original_image_path):
        return None

    raw_ocr_text, normalized_ocr_text = _extract_ocr_text(review.crop_path)
    try:
        top_k_candidates = json.loads(review.candidates_json or "[]")
    except json.JSONDecodeError:
        top_k_candidates = []

    metadata = {
        "annotation_id": f"feedback_{session.id}_{review.id}_{uuid.uuid4().hex[:8]}",
        "source": source,
        "session_id": session.id,
        "review_id": review.id,
        "detection_id": f"det_{review.detection_index}",
        "crop_image_path": review.crop_path,
        "original_image_path": session.original_image_path,
        "predicted_product_id": review.predicted_product_id,
        "selected_product_id": review.confirmed_product_id,
        "user_decision": review.user_decision,
        "top_k_candidates": top_k_candidates,
        "image_similarity_scores": [
            {
                "product_id": candidate.get("product_id"),
                "score": candidate.get("image_similarity_score"),
                "distance": candidate.get("distance"),
            }
            for candidate in top_k_candidates
        ],
        "raw_ocr_text": raw_ocr_text,
        "normalized_ocr_text": normalized_ocr_text,
        "ocr_text_found": _ocr_text_is_meaningful(normalized_ocr_text),
        "text_match_scores": [
            {
                "product_id": candidate.get("product_id"),
                "score": candidate.get("text_match_score"),
                "used_in_rerank": candidate.get("text_match_used_in_rerank"),
            }
            for candidate in top_k_candidates
        ],
        "final_scores": [
            {
                "product_id": candidate.get("product_id"),
                "score": candidate.get("final_score"),
                "confidence_level": candidate.get("confidence_level"),
            }
            for candidate in top_k_candidates
        ],
        "created_at": datetime.utcnow().isoformat() + "Z",
    }
    return save_annotation_metadata(metadata)


def export_yolo_data_yaml() -> str:
    dataset_dir = _ensure_yolo_dataset_dirs()
    data_yaml_path = dataset_dir / "data.yaml"
    data_yaml_path.write_text(
        YOLO_DATA_YAML.format(dataset_root=dataset_dir.as_posix()),
        encoding="utf-8",
    )
    return str(data_yaml_path)


def _yolo_dataset_summary() -> YoloDatasetSummaryResponse:
    dataset_dir = _ensure_yolo_dataset_dirs()
    image_count = len(list((dataset_dir / "images").glob("*/*")))
    label_files = list((dataset_dir / "labels").glob("*/*.txt"))
    box_count = 0
    for label_file in label_files:
        box_count += sum(
            1
            for line in label_file.read_text(encoding="utf-8").splitlines()
            if line.strip()
        )

    pending_review_count = len(list((dataset_dir / "pending_review").glob("*.json")))
    data_yaml_path = dataset_dir / "data.yaml"
    return YoloDatasetSummaryResponse(
        dataset_dir=str(dataset_dir),
        image_count=image_count,
        label_file_count=len(label_files),
        box_count=box_count,
        pending_review_count=pending_review_count,
        data_yaml_path=str(data_yaml_path) if data_yaml_path.exists() else None,
    )


def _image_dimensions(path: str | None) -> tuple[int | None, int | None]:
    if not path or not os.path.exists(path):
        return None, None

    with Image.open(path) as image:
        return image.size


def _image_mime_type(path: str | None) -> str | None:
    if not path or not os.path.exists(path):
        return None

    try:
        with Image.open(path) as image:
            return image.get_format_mimetype()
    except Exception:
        guessed_mime_type, _ = mimetypes.guess_type(path)
        return guessed_mime_type


def _image_to_base64_with_size(
    path: str | None,
    max_size: tuple[int, int] | None = None,
) -> tuple[str | None, int | None, int | None]:
    if not path or not os.path.exists(path):
        return None, None, None

    image = Image.open(path).convert("RGB")
    if max_size is not None:
        image.thumbnail(max_size)

    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("ascii"), image.width, image.height


def _image_to_base64(path: str | None, max_size: tuple[int, int] | None = None) -> str | None:
    image_base64, _, _ = _image_to_base64_with_size(path, max_size=max_size)
    return image_base64


def _create_recognition_session(
    db: Session,
    image_path: str,
    mode: str,
    model_version: str | None,
) -> RecognitionSession:
    storage_dir = _ensure_review_storage_dir()
    session_token = uuid.uuid4().hex
    original_path = storage_dir / f"{session_token}_original.jpg"
    Image.open(image_path).convert("RGB").save(original_path, format="JPEG", quality=92)

    session = RecognitionSession(
        original_image_path=str(original_path),
        status="open",
        mode=mode,
        model_version=model_version or MODEL_VERSION,
    )
    db.add(session)
    db.flush()
    return session


def _save_detection_crop(
    session: RecognitionSession,
    image_path: str,
    box: list[float],
    detection_index: int,
) -> str | None:
    if len(box) != 4:
        return None

    image = Image.open(image_path).convert("RGB")
    width, height = image.size
    left, top, right, bottom = box
    crop_box = (
        max(0, min(int(round(left)), width)),
        max(0, min(int(round(top)), height)),
        max(0, min(int(round(right)), width)),
        max(0, min(int(round(bottom)), height)),
    )

    if crop_box[2] <= crop_box[0] or crop_box[3] <= crop_box[1]:
        return None

    crop_path = REVIEW_STORAGE_DIR / f"session_{session.id}_det_{detection_index}.jpg"
    image.crop(crop_box).save(crop_path, format="JPEG", quality=92)
    return str(crop_path)


def _box_from_review(review: DetectionReview, prefix: str) -> list[float] | None:
    values = [
        getattr(review, f"{prefix}_box_x1"),
        getattr(review, f"{prefix}_box_y1"),
        getattr(review, f"{prefix}_box_x2"),
        getattr(review, f"{prefix}_box_y2"),
    ]
    if any(value is None for value in values):
        return None
    return [float(value) for value in values]


def _review_candidates(review: DetectionReview) -> list[CandidateResponse]:
    if not review.candidates_json:
        return []

    try:
        raw_candidates = json.loads(review.candidates_json)
    except json.JSONDecodeError:
        return []

    return [CandidateResponse(**candidate) for candidate in raw_candidates]


def _review_response(
    review: DetectionReview,
    yolo_annotation: dict | None = None,
) -> DetectionReviewResponse:
    return DetectionReviewResponse(
        id=review.id,
        session_id=review.session_id,
        detection_index=review.detection_index,
        original_box=_box_from_review(review, "original") or [],
        corrected_box=_box_from_review(review, "corrected"),
        crop_path=review.crop_path,
        crop_preview_base64=_image_to_base64(review.crop_path, max_size=(256, 256)),
        predicted_product_id=review.predicted_product_id,
        confirmed_product_id=review.confirmed_product_id,
        user_decision=review.user_decision,
        detector_confidence=review.detector_confidence,
        top1_distance=review.top1_distance,
        top2_distance=review.top2_distance,
        distance_margin=review.distance_margin,
        matched_embedding_id=review.matched_embedding_id,
        matched_view_label=review.matched_view_label,
        candidates=_review_candidates(review),
        yolo_annotation=yolo_annotation,
        created_at=review.created_at,
    )


def _candidate_dicts(candidates: list[CandidateResponse]) -> list[dict]:
    return [
        candidate.model_dump() if hasattr(candidate, "model_dump") else candidate.dict()
        for candidate in candidates
    ]


def _recognize_review_crop(db: Session, review: DetectionReview) -> None:
    if not review.crop_path or not os.path.exists(review.crop_path):
        review.predicted_product_id = None
        review.detector_confidence = None
        review.top1_distance = None
        review.top2_distance = None
        review.distance_margin = None
        review.matched_embedding_id = None
        review.matched_view_label = None
        review.candidates_json = None
        return

    embedding = process_image(review.crop_path)
    results = _nearest_product_candidates(
        db,
        embedding,
        limit=RECOGNITION_CANDIDATE_LIMIT,
    )

    if not results:
        review.predicted_product_id = None
        review.top1_distance = None
        review.top2_distance = None
        review.distance_margin = None
        review.matched_embedding_id = None
        review.matched_view_label = None
        review.candidates_json = None
        return

    raw_ocr_text, normalized_ocr_text = _extract_ocr_text(review.crop_path)
    candidates = _ranked_candidate_responses(
        results,
        raw_ocr_text=raw_ocr_text,
        normalized_ocr_text=normalized_ocr_text,
    )
    top_candidate = candidates[0]
    top2_distance = candidates[1].distance if len(candidates) > 1 else None

    review.predicted_product_id = top_candidate.product_id
    review.top1_distance = top_candidate.distance
    review.top2_distance = top2_distance
    review.distance_margin = (
        top2_distance - top_candidate.distance if top2_distance is not None else None
    )
    review.matched_embedding_id = top_candidate.matched_embedding_id
    review.matched_view_label = top_candidate.matched_view_label
    review.candidates_json = json.dumps(_candidate_dicts(candidates))


def _update_session_status(db: Session, session: RecognitionSession | None) -> None:
    if session is None:
        return

    decisions = [
        decision
        for (decision,) in db.query(DetectionReview.user_decision)
        .filter(DetectionReview.session_id == session.id)
        .all()
    ]

    if any(decision == "needs_review" for decision in decisions):
        session.status = "needs_review"
    elif decisions and all(decision != "ignored" for decision in decisions):
        session.status = "reviewed"
    else:
        session.status = "open"


def _validate_box(box: list[float], field_name: str = "box") -> list[float]:
    if len(box) != 4:
        raise HTTPException(status_code=400, detail=f"{field_name} must have 4 values")

    x1, y1, x2, y2 = [float(value) for value in box]
    if x2 <= x1 or y2 <= y1:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} must satisfy x2 > x1 and y2 > y1",
        )

    return [x1, y1, x2, y2]


def _embedding_review_response(
    product_embedding: ProductEmbedding,
    product: Product | None,
) -> ProductEmbeddingReviewResponse:
    return ProductEmbeddingReviewResponse(
        id=product_embedding.id,
        product_id=product_embedding.product_id,
        product_name=product.name if product is not None else None,
        view_label=product_embedding.view_label,
        image_path=product_embedding.image_path,
        source=product_embedding.source,
        quality_status=product_embedding.quality_status,
        image_preview_base64=_image_to_base64(
            product_embedding.image_path,
            max_size=(256, 256),
        ),
    )


def _safe_path_segment(value: str) -> str:
    safe_value = re.sub(r"[^A-Za-z0-9_.-]+", "_", value.strip())
    return safe_value or "product"


def _save_product_reference_image(product_id: str, source_path: str) -> str:
    product_dir = PRODUCT_REFERENCE_DIR / _safe_path_segment(product_id)
    product_dir.mkdir(parents=True, exist_ok=True)
    image_path = product_dir / f"{uuid.uuid4().hex}.jpg"
    Image.open(source_path).convert("RGB").save(image_path, format="JPEG", quality=92)
    return str(image_path)


def _product_embedding_response(
    product_embedding: ProductEmbedding,
    preview_size: tuple[int, int] = (192, 192),
) -> ProductEmbeddingDetailResponse:
    return ProductEmbeddingDetailResponse(
        id=product_embedding.id,
        product_id=product_embedding.product_id,
        view_label=product_embedding.view_label,
        image_path=product_embedding.image_path,
        source=product_embedding.source,
        quality_status=product_embedding.quality_status,
        created_at=product_embedding.created_at,
        image_preview_base64=_image_to_base64(
            product_embedding.image_path,
            max_size=preview_size,
        ),
    )


def _latest_review_crop_for_product(
    product_id: str,
    db: Session,
    *,
    confirmed_only: bool,
) -> str | None:
    product_column = (
        DetectionReview.confirmed_product_id
        if confirmed_only
        else DetectionReview.predicted_product_id
    )
    query = (
        db.query(DetectionReview.crop_path)
        .filter(product_column == product_id)
        .filter(DetectionReview.crop_path.isnot(None))
        .order_by(DetectionReview.created_at.desc(), DetectionReview.id.desc())
    )
    for (crop_path,) in query.all():
        if crop_path and os.path.exists(crop_path):
            return crop_path
    return None


def _product_summary_response(product: Product, db: Session) -> ProductManagementResponse:
    embeddings = (
        db.query(ProductEmbedding)
        .filter(ProductEmbedding.product_id == product.product_id)
        .order_by(ProductEmbedding.created_at.desc(), ProductEmbedding.id.desc())
        .all()
    )
    thumbnail_embedding = next(
        (embedding for embedding in embeddings if embedding.image_path),
        None,
    )
    thumbnail_path = (
        thumbnail_embedding.image_path
        if thumbnail_embedding is not None
        else _latest_review_crop_for_product(product.product_id, db, confirmed_only=True)
    )
    if thumbnail_path is None:
        thumbnail_path = _latest_review_crop_for_product(
            product.product_id,
            db,
            confirmed_only=False,
        )

    return ProductManagementResponse(
        product_id=product.product_id,
        name=product.name,
        inventory_count=product.inventory_count or 0,
        embedding_count=len(embeddings),
        approved_embedding_count=sum(
            1 for embedding in embeddings if embedding.quality_status in APPROVED_EMBEDDING_STATUSES
        ),
        pending_embedding_count=sum(
            1 for embedding in embeddings if embedding.quality_status == "pending"
        ),
        reference_image_count=sum(1 for embedding in embeddings if embedding.image_path),
        thumbnail_base64=_image_to_base64(
            thumbnail_path,
            max_size=(96, 96),
        ),
        created_at=product.created_at,
        updated_at=product.updated_at,
    )


@lru_cache(maxsize=1)
def _easyocr_reader():
    import easyocr

    return easyocr.Reader(["en"], gpu=False)


@lru_cache(maxsize=1)
def _paddleocr_reader():
    from paddleocr import PaddleOCR

    return PaddleOCR(use_angle_cls=True, lang="en")


def _normalize_text(value: str | None) -> str:
    if not value:
        return ""

    ascii_text = unicodedata.normalize("NFKD", value)
    ascii_text = "".join(
        character for character in ascii_text if not unicodedata.combining(character)
    )
    return re.sub(r"[^a-z0-9]+", " ", ascii_text.lower()).strip()


def _compact_text(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", "", _normalize_text(value))


def _ocr_text_is_meaningful(normalized_ocr_text: str | None) -> bool:
    return len(_compact_text(normalized_ocr_text)) >= OCR_MIN_MEANINGFUL_CHARS


def _extract_ocr_text(image_path: str | None) -> tuple[str | None, str | None]:
    if not ENABLE_OCR or not image_path or not os.path.exists(image_path):
        return None, None

    try:
        if OCR_ENGINE == "easyocr":
            result = _easyocr_reader().readtext(image_path, detail=0, paragraph=True)
            raw_text = " ".join(str(part) for part in result if str(part).strip())
        elif OCR_ENGINE == "paddleocr":
            result = _paddleocr_reader().ocr(image_path, cls=True)
            text_parts = []
            for page in result or []:
                for row in page or []:
                    if len(row) >= 2 and row[1]:
                        text_parts.append(str(row[1][0]))
            raw_text = " ".join(text_parts)
        elif OCR_ENGINE == "tesseract":
            completed = subprocess.run(
                ["tesseract", image_path, "stdout"],
                check=False,
                capture_output=True,
                text=True,
                timeout=15,
            )
            raw_text = completed.stdout if completed.returncode == 0 else ""
            if completed.returncode != 0:
                logger.warning("tesseract OCR failed: %s", completed.stderr.strip())
        else:
            logger.warning("Unsupported OCR_ENGINE=%s", OCR_ENGINE)
            return None, None
    except Exception as exc:
        logger.warning("OCR failed with engine=%s: %s", OCR_ENGINE, exc)
        return None, None

    raw_text = raw_text.strip()
    if not raw_text:
        return None, None
    return raw_text, _normalize_text(raw_text)


def _product_metadata_values(
    product: Product,
    product_embedding: ProductEmbedding,
) -> list[str]:
    values = []
    for attribute in (
        "product_id",
        "product_code",
        "sku",
        "name",
        "brand",
        "model",
        "description",
        "barcode",
    ):
        value = getattr(product, attribute, None)
        if value:
            values.append(str(value))

    if product_embedding.view_label:
        values.append(product_embedding.view_label)

    return values


def _category_metadata_values(product: Product) -> list[str]:
    values = []
    for attribute in ("category", "category_name", "product_type"):
        value = getattr(product, attribute, None)
        if value:
            values.append(str(value))
    return values


def _text_match_score(
    normalized_ocr_text: str | None,
    product: Product,
    product_embedding: ProductEmbedding,
) -> float | None:
    if not normalized_ocr_text:
        return None

    ocr_compact = _compact_text(normalized_ocr_text)
    ocr_tokens = set(normalized_ocr_text.split())
    best_score = 0.0

    for metadata_value in _product_metadata_values(product, product_embedding):
        metadata_normalized = _normalize_text(metadata_value)
        metadata_compact = _compact_text(metadata_value)
        metadata_tokens = set(metadata_normalized.split())
        if not metadata_compact:
            continue

        if metadata_compact in ocr_compact or ocr_compact in metadata_compact:
            best_score = max(best_score, 1.0)

        if metadata_tokens:
            overlap = len(ocr_tokens & metadata_tokens) / max(len(metadata_tokens), 1)
            best_score = max(best_score, overlap)

        fuzzy = SequenceMatcher(None, ocr_compact, metadata_compact).ratio()
        best_score = max(best_score, fuzzy)

    return round(min(best_score, 1.0), 4)


def _category_match_score(
    normalized_ocr_text: str | None,
    product: Product,
) -> float | None:
    if not normalized_ocr_text:
        return None

    categories = _category_metadata_values(product)
    if not categories:
        return None

    ocr_compact = _compact_text(normalized_ocr_text)
    best_score = 0.0
    for category in categories:
        category_compact = _compact_text(category)
        if not category_compact:
            continue
        if category_compact in ocr_compact:
            best_score = max(best_score, 1.0)
        else:
            best_score = max(
                best_score,
                SequenceMatcher(None, ocr_compact, category_compact).ratio(),
            )
    return round(min(best_score, 1.0), 4)


def _image_similarity_score(distance: float) -> float:
    return round(max(0.0, min(1.0, 1.0 - float(distance))), 4)


def _final_score(
    image_similarity_score: float,
    text_match_score: float | None,
    category_match_score: float | None,
    *,
    ocr_text_found: bool,
) -> tuple[float, bool]:
    final_score = image_similarity_score
    text_match_used = False

    if ocr_text_found and text_match_score is not None:
        if text_match_score >= TEXT_MATCH_RERANK_THRESHOLD:
            final_score += TEXT_MATCH_BONUS_MAX * text_match_score
            text_match_used = True

    if category_match_score is not None and category_match_score >= TEXT_MATCH_RERANK_THRESHOLD:
        final_score += CATEGORY_MATCH_BONUS_MAX * category_match_score

    return round(min(1.0, final_score), 4), text_match_used


def _has_text_conflict(
    *,
    ocr_text_found: bool,
    text_match_score: float | None,
) -> bool:
    return (
        ocr_text_found
        and text_match_score is not None
        and text_match_score <= TEXT_CONFLICT_THRESHOLD
    )


def _confidence_level(final_score: float | None, *, suspicious: bool = False) -> str:
    if final_score is None:
        return "UNKNOWN"
    if final_score >= HIGH_CONFIDENCE_THRESHOLD:
        return "MEDIUM" if suspicious else "HIGH"
    if final_score >= MEDIUM_CONFIDENCE_THRESHOLD:
        return "LOW" if suspicious else "MEDIUM"
    if final_score > 0:
        return "LOW"
    return "UNKNOWN"


def _candidate_explanation(
    *,
    distance: float,
    image_score: float,
    text_score: float | None,
    category_score: float | None,
    final_score: float,
    raw_ocr_text: str | None,
    ocr_text_found: bool,
    text_match_used: bool,
    suspicious: bool,
) -> list[str]:
    explanation = []
    if distance <= SIMILARITY_RECOGNIZED_THRESHOLD:
        explanation.append("Image similarity is high")
    elif distance <= SIMILARITY_UNKNOWN_THRESHOLD:
        explanation.append("Image similarity is plausible but needs confirmation")
    else:
        explanation.append("Image similarity is weak")

    if ocr_text_found:
        if text_score is not None and text_score >= 0.8:
            explanation.append("OCR text strongly matches product metadata")
        elif text_score is not None and text_score >= 0.4:
            explanation.append("OCR text partially matches product metadata")
        elif suspicious:
            explanation.append(
                "OCR text conflicts with this candidate; user confirmation recommended"
            )
        else:
            explanation.append("OCR text was found but not used for reranking")
    elif ENABLE_OCR:
        explanation.append("OCR did not find meaningful text; image similarity was used")
    else:
        explanation.append("OCR is disabled; final score uses image similarity")

    if text_match_used:
        explanation.append("OCR text match added a positive reranking bonus")

    if category_score is not None:
        explanation.append(f"Category match score is {category_score:.2f}")

    explanation.append(f"Final score is {final_score:.2f}")
    return explanation


def _ranked_candidate_responses(
    results: list[tuple[Product, ProductEmbedding, float]],
    *,
    raw_ocr_text: str | None = None,
    normalized_ocr_text: str | None = None,
) -> list[CandidateResponse]:
    candidates = []
    ocr_text_found = _ocr_text_is_meaningful(normalized_ocr_text)
    for product, product_embedding, distance in results:
        image_score = _image_similarity_score(distance)
        text_score = (
            _text_match_score(normalized_ocr_text, product, product_embedding)
            if ocr_text_found
            else None
        )
        category_score = (
            _category_match_score(normalized_ocr_text, product)
            if ocr_text_found
            else None
        )
        final_score, text_match_used = _final_score(
            image_score,
            text_score,
            category_score,
            ocr_text_found=ocr_text_found,
        )
        suspicious = _has_text_conflict(
            ocr_text_found=ocr_text_found,
            text_match_score=text_score,
        )
        confidence_level = _confidence_level(final_score, suspicious=suspicious)
        confidence_explanation = _candidate_explanation(
            distance=distance,
            image_score=image_score,
            text_score=text_score,
            category_score=category_score,
            final_score=final_score,
            raw_ocr_text=raw_ocr_text,
            ocr_text_found=ocr_text_found,
            text_match_used=text_match_used,
            suspicious=suspicious,
        )

        candidates.append(
            CandidateResponse(
                product_id=product.product_id,
                product_code=product.product_id,
                product_name=product.name,
                name=product.name,
                inventory_count=product.inventory_count or 0,
                distance=distance,
                matched_embedding_id=product_embedding.id,
                matched_view_label=product_embedding.view_label,
                image_similarity_score=image_score,
                text_match_score=text_score,
                category_match_score=category_score,
                ocr_text_found=ocr_text_found,
                text_match_used_in_rerank=text_match_used,
                final_score=final_score,
                reference_image_path=product_embedding.image_path,
                confidence_level=confidence_level,
                confidence_explanation=confidence_explanation,
                explanation=confidence_explanation,
            )
        )

    if any(candidate.text_match_used_in_rerank for candidate in candidates):
        candidates.sort(
            key=lambda candidate: candidate.final_score
            if candidate.final_score is not None
            else -1.0,
            reverse=True,
        )

    if len(candidates) >= 2:
        score_gap = (candidates[0].final_score or 0.0) - (
            candidates[1].final_score or 0.0
        )
        if score_gap < SIMILARITY_MARGIN_THRESHOLD:
            candidates[0].confidence_explanation.append(
                "Top 2 candidates are close; user confirmation recommended"
            )
            candidates[0].explanation = candidates[0].confidence_explanation

    return candidates


def _nearest_product_candidates(
    db: Session,
    query_vector: list[float],
    limit: int = 1,
) -> list[tuple[Product, ProductEmbedding, float]]:
    raw_limit = max(limit * 10, 50)
    distance_expr = ProductEmbedding.embedding.cosine_distance(query_vector)
    rows = (
        db.query(Product, ProductEmbedding, distance_expr.label("distance"))
        .join(Product, ProductEmbedding.product_id == Product.product_id)
        .filter(ProductEmbedding.embedding.isnot(None))
        .filter(ProductEmbedding.quality_status.in_(tuple(APPROVED_EMBEDDING_STATUSES)))
        .order_by(distance_expr)
        .limit(raw_limit)
        .all()
    )

    candidates = []
    seen_product_ids = set()

    for product, product_embedding, distance in rows:
        if distance is None or product.product_id in seen_product_ids:
            continue

        candidates.append((product, product_embedding, float(distance)))
        seen_product_ids.add(product.product_id)

        if len(candidates) >= limit:
            break

    return candidates


def _candidate_response(
    product: Product,
    product_embedding: ProductEmbedding,
    distance: float,
) -> CandidateResponse:
    image_score = _image_similarity_score(distance)
    confidence_explanation = _candidate_explanation(
        distance=distance,
        image_score=image_score,
        text_score=None,
        category_score=None,
        final_score=image_score,
        raw_ocr_text=None,
        ocr_text_found=False,
        text_match_used=False,
        suspicious=False,
    )
    return CandidateResponse(
        product_id=product.product_id,
        product_code=product.product_id,
        product_name=product.name,
        name=product.name,
        inventory_count=product.inventory_count or 0,
        distance=distance,
        matched_embedding_id=product_embedding.id,
        matched_view_label=product_embedding.view_label,
        image_similarity_score=image_score,
        ocr_text_found=False,
        text_match_used_in_rerank=False,
        final_score=image_score,
        reference_image_path=product_embedding.image_path,
        confidence_level=_confidence_level(image_score),
        confidence_explanation=confidence_explanation,
        explanation=confidence_explanation,
    )


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/api/v1/products", response_model=list[ProductManagementResponse])
def list_products(
    search: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
):
    query = db.query(Product)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            (Product.product_id.ilike(pattern)) | (Product.name.ilike(pattern))
        )

    products = query.order_by(Product.product_id).limit(limit).all()
    return [_product_summary_response(product, db) for product in products]


@app.get("/api/v1/products/{product_id}", response_model=ProductDetailResponse)
def get_product_detail(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    embeddings = (
        db.query(ProductEmbedding)
        .filter(ProductEmbedding.product_id == product.product_id)
        .order_by(ProductEmbedding.created_at.desc(), ProductEmbedding.id.desc())
        .all()
    )
    summary = _product_summary_response(product, db)
    return ProductDetailResponse(
        product_id=summary.product_id,
        name=summary.name,
        inventory_count=summary.inventory_count,
        embedding_count=summary.embedding_count,
        approved_embedding_count=summary.approved_embedding_count,
        pending_embedding_count=summary.pending_embedding_count,
        reference_image_count=summary.reference_image_count,
        thumbnail_base64=summary.thumbnail_base64,
        created_at=summary.created_at,
        updated_at=summary.updated_at,
        embeddings=[
            _product_embedding_response(product_embedding)
            for product_embedding in embeddings
        ],
    )


@app.post("/api/v1/products", response_model=ProductResponse, status_code=201)
async def upsert_product(
    product_id: str = Form(...),
    name: str = Form(...),
    inventory_count: int = Form(0),
    view_label: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    _ensure_image(file)
    temp_path = _save_upload_to_temp(file)

    try:
        try:
            embedding = process_registration_image(temp_path)
        except RegistrationImageError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        product = db.get(Product, product_id)

        if product is None:
            product = Product(product_id=product_id)
            db.add(product)

        product.name = name
        product.inventory_count = inventory_count
        db.flush()
        reference_image_path = _save_product_reference_image(product.product_id, temp_path)
        db.add(
            ProductEmbedding(
                product_id=product.product_id,
                embedding=embedding,
                image_path=reference_image_path,
                view_label=view_label,
                source="manual_upload",
                quality_status="approved",
            )
        )

        db.commit()
        db.refresh(product)

        return ProductResponse(
            product_id=product.product_id,
            name=product.name,
            inventory_count=product.inventory_count,
        )
    except Exception:
        db.rollback()
        raise
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.delete("/api/v1/products/{product_id}", response_model=ProductDeleteResponse)
def delete_product(product_id: str, db: Session = Depends(get_db)):
    product = db.get(Product, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    embedding_ids = [
        row[0]
        for row in db.query(ProductEmbedding.id)
        .filter(ProductEmbedding.product_id == product_id)
        .all()
    ]
    deleted_embeddings = len(embedding_ids)
    deleted_inventory_transactions = (
        db.query(InventoryTransaction)
        .filter(InventoryTransaction.product_id == product_id)
        .delete(synchronize_session=False)
    )
    cleared_review_product_links = 0
    cleared_review_embedding_links = 0

    review_product_refs = db.query(DetectionReview).filter(
        (DetectionReview.predicted_product_id == product_id)
        | (DetectionReview.confirmed_product_id == product_id)
    )
    for review in review_product_refs.all():
        if review.predicted_product_id == product_id:
            review.predicted_product_id = None
            cleared_review_product_links += 1
        if review.confirmed_product_id == product_id:
            review.confirmed_product_id = None
            cleared_review_product_links += 1

    if embedding_ids:
        review_embedding_refs = db.query(DetectionReview).filter(
            DetectionReview.matched_embedding_id.in_(embedding_ids)
        )
        for review in review_embedding_refs.all():
            review.matched_embedding_id = None
            review.matched_view_label = None
            cleared_review_embedding_links += 1

    db.delete(product)
    db.commit()

    return ProductDeleteResponse(
        product_id=product_id,
        deleted_embeddings=deleted_embeddings,
        deleted_inventory_transactions=deleted_inventory_transactions,
        cleared_review_product_links=cleared_review_product_links,
        cleared_review_embedding_links=cleared_review_embedding_links,
    )


@app.post(
    "/api/v1/products/{product_id}/embeddings",
    response_model=ProductEmbeddingResponse,
    status_code=201,
)
async def add_product_embedding(
    product_id: str,
    view_label: str | None = Form(None),
    use_full_image: bool = Form(False),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    _ensure_image(file)
    temp_path = _save_upload_to_temp(file)

    try:
        product = db.get(Product, product_id)

        if product is None:
            raise HTTPException(status_code=404, detail="Product not found")

        try:
            embedding = (
                process_image(temp_path)
                if use_full_image
                else process_registration_image(temp_path)
            )
        except RegistrationImageError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        product_embedding = ProductEmbedding(
            product_id=product.product_id,
            embedding=embedding,
            image_path=_save_product_reference_image(product.product_id, temp_path),
            view_label=view_label,
            source="manual_upload",
            quality_status="approved",
        )
        db.add(product_embedding)
        db.commit()
        db.refresh(product_embedding)

        return ProductEmbeddingResponse(
            id=product_embedding.id,
            product_id=product_embedding.product_id,
            view_label=product_embedding.view_label,
            image_path=product_embedding.image_path,
            source=product_embedding.source,
            quality_status=product_embedding.quality_status,
        )
    except Exception:
        db.rollback()
        raise
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/api/v1/recognize", response_model=list[MultiRecognizeResponse])
async def recognize(
    file: UploadFile = File(...),
    mode: str = Form("operation"),
    model_version: str | None = Form(None),
    top_k: int = Form(TOP_K_CANDIDATES, ge=1, le=20),
    db: Session = Depends(get_db),
):
    _ensure_image(file)
    temp_path = _save_upload_to_temp(file)

    try:
        detected_items = process_multiple_images(temp_path)
        response_items = []
        session = _create_recognition_session(db, temp_path, mode, model_version)
        logger.info("recognize detected_boxes=%s", len(detected_items))

        for index, item in enumerate(detected_items, start=1):
            detection_id = f"det_{index}"
            crop_path = _save_detection_crop(session, temp_path, item["box"], index)
            base_response = {
                "session_id": session.id,
                "review_id": None,
                "detection_id": detection_id,
                "box": item["box"],
                "crop_preview_base64": item.get("crop_preview_base64"),
                "detector_confidence": item.get("detector_confidence"),
                "detector_backend": item.get("detector_backend"),
                "detector_model": item.get("detector_model"),
                "detector_prompt": item.get("detector_prompt"),
                "detector_class_id": item.get("detector_class_id"),
                "detector_class_name": item.get("detector_class_name"),
                "product_id": None,
                "name": None,
                "inventory_count": None,
                "distance": None,
                "matched_embedding_id": None,
                "matched_view_label": None,
                "top1_distance": None,
                "top2_distance": None,
                "distance_margin": None,
                "raw_ocr_text": None,
                "normalized_ocr_text": None,
                "image_similarity_score": None,
                "text_match_score": None,
                "category_match_score": None,
                "ocr_text_found": False,
                "text_match_used_in_rerank": False,
                "final_score": None,
                "confidence_level": "UNKNOWN",
                "confidence_explanation": [],
                "explanation": [],
                "candidates": [],
            }

            def append_review_response(payload: dict) -> None:
                candidates = _candidate_dicts(payload.get("candidates", []))
                review = DetectionReview(
                    session_id=session.id,
                    detection_index=index,
                    original_box_x1=float(item["box"][0]),
                    original_box_y1=float(item["box"][1]),
                    original_box_x2=float(item["box"][2]),
                    original_box_y2=float(item["box"][3]),
                    crop_path=crop_path,
                    predicted_product_id=payload.get("product_id"),
                    user_decision="ignored",
                    detector_confidence=payload.get("detector_confidence"),
                    top1_distance=payload.get("top1_distance"),
                    top2_distance=payload.get("top2_distance"),
                    distance_margin=payload.get("distance_margin"),
                    matched_embedding_id=payload.get("matched_embedding_id"),
                    matched_view_label=payload.get("matched_view_label"),
                    candidates_json=json.dumps(candidates) if candidates else None,
                )
                db.add(review)
                db.flush()
                payload["review_id"] = review.id
                response_items.append(MultiRecognizeResponse(**payload))

            if not item.get("is_valid_crop", True) or item.get("embedding") is None:
                logger.info(
                    "recognize item=%s crop_width=%s crop_height=%s area_ratio=%.6f status=%s",
                    index,
                    item.get("crop_width"),
                    item.get("crop_height"),
                    item.get("crop_area_ratio", 0.0),
                    "unknown",
                )
                append_review_response(
                    {
                        **base_response,
                        "status": "unknown",
                        "explanation": ["Crop is too small or invalid for recognition"],
                    }
                )
                continue

            results = _nearest_product_candidates(
                db,
                item["embedding"],
                limit=top_k,
            )
            raw_ocr_text, normalized_ocr_text = _extract_ocr_text(crop_path)
            ocr_text_found = _ocr_text_is_meaningful(normalized_ocr_text)
            ocr_fields = {
                "raw_ocr_text": raw_ocr_text,
                "normalized_ocr_text": normalized_ocr_text,
                "ocr_text_found": ocr_text_found,
            }

            if not results:
                logger.info(
                    "recognize item=%s best_distance=%s status=%s",
                    index,
                    None,
                    "unknown",
                )
                append_review_response(
                    {
                        **base_response,
                        **ocr_fields,
                        "status": "unknown",
                        "explanation": ["No reference product embeddings were available"],
                    }
                )
                continue

            candidates = _ranked_candidate_responses(
                results,
                raw_ocr_text=raw_ocr_text,
                normalized_ocr_text=normalized_ocr_text,
            )
            selected_candidate = candidates[0]
            top1_distance = selected_candidate.distance
            top2_distance = candidates[1].distance if len(candidates) > 1 else None
            distance_margin = (
                top2_distance - top1_distance
                if top2_distance is not None
                else None
            )
            match_fields = {
                **base_response,
                **ocr_fields,
                "distance": top1_distance,
                "matched_embedding_id": selected_candidate.matched_embedding_id,
                "matched_view_label": selected_candidate.matched_view_label,
                "top1_distance": top1_distance,
                "top2_distance": top2_distance,
                "distance_margin": distance_margin,
                "image_similarity_score": selected_candidate.image_similarity_score,
                "text_match_score": selected_candidate.text_match_score,
                "category_match_score": selected_candidate.category_match_score,
                "ocr_text_found": selected_candidate.ocr_text_found,
                "text_match_used_in_rerank": (
                    selected_candidate.text_match_used_in_rerank
                ),
                "final_score": selected_candidate.final_score,
                "confidence_level": selected_candidate.confidence_level or "UNKNOWN",
                "confidence_explanation": selected_candidate.confidence_explanation,
                "explanation": selected_candidate.explanation,
                "candidates": candidates,
            }

            detector_confidence = item.get("detector_confidence")
            is_low_detector_confidence = (
                detector_confidence is not None
                and detector_confidence < DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD
            )
            is_medium_detector_confidence = (
                detector_confidence is not None
                and detector_confidence < DETECTOR_RECOGNIZED_CONFIDENCE_THRESHOLD
            )

            if is_low_detector_confidence:
                logger.info(
                    "recognize item=%s detector_confidence=%.6f status=%s",
                    index,
                    detector_confidence,
                    "unknown",
                )
                append_review_response({**match_fields, "status": "unknown"})
                continue

            if top1_distance > SIMILARITY_UNKNOWN_THRESHOLD:
                logger.info(
                    "recognize item=%s best_distance=%.6f status=%s",
                    index,
                    top1_distance,
                    "unknown",
                )
                append_review_response({**match_fields, "status": "unknown"})
                continue

            if is_medium_detector_confidence:
                logger.info(
                    "recognize item=%s detector_confidence=%.6f status=%s",
                    index,
                    detector_confidence,
                    "uncertain",
                )
                append_review_response(
                    {
                        **match_fields,
                        "product_id": selected_candidate.product_id,
                        "name": selected_candidate.name,
                        "inventory_count": selected_candidate.inventory_count,
                        "status": "uncertain",
                    }
                )
                continue

            if top1_distance > SIMILARITY_RECOGNIZED_THRESHOLD:
                logger.info(
                    "recognize item=%s best_distance=%.6f status=%s",
                    index,
                    top1_distance,
                    "uncertain",
                )
                append_review_response(
                    {
                        **match_fields,
                        "product_id": selected_candidate.product_id,
                        "name": selected_candidate.name,
                        "inventory_count": selected_candidate.inventory_count,
                        "status": "uncertain",
                    }
                )
                continue

            if distance_margin is not None and distance_margin < SIMILARITY_MARGIN_THRESHOLD:
                logger.info(
                    "recognize item=%s best_distance=%.6f margin=%.6f status=%s",
                    index,
                    top1_distance,
                    distance_margin,
                    "uncertain",
                )
                append_review_response(
                    {
                        **match_fields,
                        "product_id": selected_candidate.product_id,
                        "name": selected_candidate.name,
                        "inventory_count": selected_candidate.inventory_count,
                        "status": "uncertain",
                    }
                )
                continue

            logger.info(
                "recognize item=%s best_distance=%.6f status=%s",
                index,
                top1_distance,
                "recognized",
            )
            append_review_response(
                {
                    **match_fields,
                    "product_id": selected_candidate.product_id,
                    "name": selected_candidate.name,
                    "inventory_count": selected_candidate.inventory_count,
                    "status": "recognized",
                }
            )

        db.commit()
        return response_items
    except Exception:
        db.rollback()
        raise
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/api/v1/recognize/candidates", response_model=RecognizeCandidatesResponse)
async def recognize_candidates(
    file: UploadFile = File(...),
    top_k: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
):
    _ensure_image(file)
    temp_path = _save_upload_to_temp(file)

    try:
        query_vector = process_image(temp_path)
        results = _nearest_product_candidates(db, query_vector, limit=top_k)

        if not results:
            raise HTTPException(status_code=404, detail="No reference products have embeddings")

        return RecognizeCandidatesResponse(
            candidates=_ranked_candidate_responses(results)
        )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.get("/api/v1/detector/settings")
def detector_settings():
    try:
        return get_detector_info()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.post("/api/v1/detector/compare", response_model=DetectorCompareResponse)
async def detector_compare(file: UploadFile = File(...)):
    _ensure_image(file)
    temp_path = _save_upload_to_temp(file)

    try:
        comparison = compare_detectors(temp_path)
        return DetectorCompareResponse(
            detector_settings=get_detector_info(),
            comparison=comparison,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.get("/api/v1/review/sessions", response_model=list[RecognitionSessionSummary])
def list_review_sessions(
    limit: int | None = Query(None, ge=1, le=5000),
    mode: str | None = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(RecognitionSession)
    if mode:
        query = query.filter(RecognitionSession.mode == mode)

    query = query.order_by(RecognitionSession.created_at.desc())
    if limit is not None:
        query = query.limit(limit)
    sessions = query.all()
    return [
        RecognitionSessionSummary(
            id=session.id,
            original_image_path=session.original_image_path,
            status=session.status,
            mode=session.mode,
            model_version=session.model_version,
            created_at=session.created_at,
            detection_count=len(session.detections),
            reviewed_count=len(
                [
                    detection
                    for detection in session.detections
                    if detection.user_decision
                    not in {"ignored", "needs_review"}
                ]
            ),
            pending_count=len(
                [
                    detection
                    for detection in session.detections
                    if detection.user_decision in {"ignored", "needs_review"}
                ]
            ),
        )
        for session in sessions
    ]


@app.get("/api/v1/review/sessions/{session_id}", response_model=RecognitionSessionDetail)
def get_review_session(session_id: int, db: Session = Depends(get_db)):
    session = db.get(RecognitionSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Recognition session not found")

    detections = (
        db.query(DetectionReview)
        .filter(DetectionReview.session_id == session.id)
        .order_by(DetectionReview.detection_index)
        .all()
    )
    original_width, original_height = _image_dimensions(session.original_image_path)
    original_mime_type = _image_mime_type(session.original_image_path)
    preview_base64, preview_width, preview_height = _image_to_base64_with_size(
        session.original_image_path,
        max_size=(1200, 1200),
    )
    return RecognitionSessionDetail(
        id=session.id,
        original_image_path=session.original_image_path,
        status=session.status,
        mode=session.mode,
        model_version=session.model_version,
        created_at=session.created_at,
        detection_count=len(detections),
        reviewed_count=len(
            [
                detection
                for detection in detections
                if detection.user_decision not in {"ignored", "needs_review"}
            ]
        ),
        pending_count=len(
            [
                detection
                for detection in detections
                if detection.user_decision in {"ignored", "needs_review"}
            ]
        ),
        original_image_base64=preview_base64,
        original_image_width=original_width,
        original_image_height=original_height,
        original_image_mime_type=original_mime_type,
        preview_image_width=preview_width,
        preview_image_height=preview_height,
        preview_image_mime_type="image/jpeg" if preview_base64 else None,
        detections=[_review_response(review) for review in detections],
    )


@app.delete(
    "/api/v1/review/sessions/{session_id}",
    response_model=RecognitionSessionDeleteResponse,
)
def delete_review_session(
    session_id: int,
    delete_training_data: bool = Query(True),
    db: Session = Depends(get_db),
):
    session = db.get(RecognitionSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Recognition session not found")

    detections_removed = len(session.detections)
    artifacts_removed = (
        remove_recognition_session_artifacts(db, session)
        if delete_training_data
        else {}
    )
    db.delete(session)
    db.commit()
    return RecognitionSessionDeleteResponse(
        deleted=True,
        session_id=session_id,
        detections_removed=detections_removed,
        artifacts_removed=artifacts_removed,
    )


@app.get("/api/v1/yolo-dataset/summary", response_model=YoloDatasetSummaryResponse)
def get_yolo_dataset_summary():
    return _yolo_dataset_summary()


@app.post("/api/v1/yolo-dataset/export-yaml", response_model=YoloDatasetExportResponse)
def create_yolo_dataset_yaml():
    data_yaml_path = export_yolo_data_yaml()
    return YoloDatasetExportResponse(
        data_yaml_path=data_yaml_path,
        summary=_yolo_dataset_summary(),
    )


@app.post(
    "/api/v1/review/detections/{review_id}",
    response_model=DetectionReviewResponse,
)
def update_detection_review(
    review_id: int,
    payload: DetectionReviewUpdateRequest,
    db: Session = Depends(get_db),
):
    if payload.user_decision not in REVIEW_DECISIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid user_decision: {payload.user_decision}",
        )

    if payload.reference_quality_status not in REFERENCE_QUALITY_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid reference_quality_status: {payload.reference_quality_status}",
        )

    review = db.get(DetectionReview, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Detection review not found")

    confirmed_product_id = payload.confirmed_product_id

    if payload.corrected_box is not None:
        corrected_box = _validate_box(payload.corrected_box, "corrected_box")
        (
            review.corrected_box_x1,
            review.corrected_box_y1,
            review.corrected_box_x2,
            review.corrected_box_y2,
        ) = corrected_box
        if review.session is None or not os.path.exists(review.session.original_image_path):
            raise HTTPException(status_code=400, detail="Original session image is unavailable")
        crop_path = _save_detection_crop(
            review.session,
            review.session.original_image_path,
            corrected_box,
            review.detection_index,
        )
        if crop_path is None:
            raise HTTPException(status_code=400, detail="Corrected box could not be cropped")
        review.crop_path = crop_path
        review.detector_confidence = None
        _recognize_review_crop(db, review)

    if payload.user_decision == "accepted" and not confirmed_product_id:
        confirmed_product_id = review.predicted_product_id

    if confirmed_product_id and db.get(Product, confirmed_product_id) is None:
        raise HTTPException(
            status_code=404,
            detail=f"Product not found: {confirmed_product_id}",
        )

    review.user_decision = payload.user_decision
    review.confirmed_product_id = confirmed_product_id

    if payload.add_as_reference:
        if not confirmed_product_id:
            raise HTTPException(
                status_code=400,
                detail="confirmed_product_id is required to add a reference image",
            )
        if not review.crop_path or not os.path.exists(review.crop_path):
            raise HTTPException(status_code=400, detail="Review crop image is unavailable")

        embedding = process_image(review.crop_path)
        db.add(
            ProductEmbedding(
                product_id=confirmed_product_id,
                embedding=embedding,
                image_path=review.crop_path,
                view_label=f"user_confirmed_{review.id}",
                source="user_confirmed_crop",
                quality_status=payload.reference_quality_status,
            )
        )

    yolo_annotation = None
    if payload.use_for_yolo_training:
        if payload.user_decision not in YOLO_POSITIVE_DECISIONS:
            raise HTTPException(
                status_code=400,
                detail="Only positive review decisions can be saved as YOLO labels",
            )
        if review.session is None:
            raise HTTPException(status_code=400, detail="Review session is unavailable")
        yolo_product = db.get(Product, confirmed_product_id) if confirmed_product_id else None
        yolo_box = _box_from_review(review, "corrected") or _box_from_review(review, "original")
        if yolo_box is None:
            raise HTTPException(status_code=400, detail="Review box is unavailable")
        yolo_annotation = save_yolo_annotation(
            session=review.session,
            review=review,
            box=yolo_box,
            product=yolo_product,
            source=f"human_{payload.user_decision}",
        )
    elif payload.user_decision in {
        "needs_review",
        "not_product",
        "unknown",
        "rejected_detection",
        "wrong_sku",
    }:
        if review.session is not None:
            save_correction_event_metadata(
                session=review.session,
                review=review,
                source=f"human_{payload.user_decision}",
            )

    if review.session is not None:
        save_feedback_event_metadata(
            session=review.session,
            review=review,
            source=f"human_feedback_{payload.user_decision}",
        )

    db.flush()
    _update_session_status(db, review.session)

    db.commit()
    db.refresh(review)
    return _review_response(review, yolo_annotation=yolo_annotation)


@app.post(
    "/api/v1/review/sessions/{session_id}/manual-detection",
    response_model=DetectionReviewResponse,
)
def add_manual_detection(
    session_id: int,
    payload: ManualDetectionRequest,
    db: Session = Depends(get_db),
):
    if payload.user_decision not in REVIEW_DECISIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid user_decision: {payload.user_decision}",
        )

    corrected_box = _validate_box(payload.corrected_box, "corrected_box")
    session = db.get(RecognitionSession, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Recognition session not found")
    if not os.path.exists(session.original_image_path):
        raise HTTPException(status_code=400, detail="Original session image is unavailable")

    if payload.confirmed_product_id and db.get(Product, payload.confirmed_product_id) is None:
        raise HTTPException(
            status_code=404,
            detail=f"Product not found: {payload.confirmed_product_id}",
        )

    last_review = (
        db.query(DetectionReview)
        .filter(DetectionReview.session_id == session.id)
        .order_by(DetectionReview.detection_index.desc())
        .first()
    )
    detection_index = (last_review.detection_index if last_review else 0) + 1
    crop_path = _save_detection_crop(
        session,
        session.original_image_path,
        corrected_box,
        detection_index,
    )
    if crop_path is None:
        raise HTTPException(status_code=400, detail="Manual box could not be cropped")

    review = DetectionReview(
        session_id=session.id,
        detection_index=detection_index,
        original_box_x1=corrected_box[0],
        original_box_y1=corrected_box[1],
        original_box_x2=corrected_box[2],
        original_box_y2=corrected_box[3],
        corrected_box_x1=corrected_box[0],
        corrected_box_y1=corrected_box[1],
        corrected_box_x2=corrected_box[2],
        corrected_box_y2=corrected_box[3],
        crop_path=crop_path,
        confirmed_product_id=payload.confirmed_product_id,
        user_decision=payload.user_decision,
    )
    db.add(review)
    db.flush()
    _recognize_review_crop(db, review)
    yolo_product = (
        db.get(Product, payload.confirmed_product_id)
        if payload.confirmed_product_id
        else None
    )
    yolo_annotation = save_yolo_annotation(
        session=session,
        review=review,
        box=corrected_box,
        product=yolo_product,
        external_product_id=payload.external_product_id,
        displayed_box=payload.displayed_box,
        display_size=payload.display_size,
        source=payload.source or "human_missing_box",
    )
    _update_session_status(db, session)
    db.commit()
    db.refresh(review)
    return _review_response(review, yolo_annotation=yolo_annotation)


@app.delete("/api/v1/review/detections/{review_id}")
def delete_manual_detection_review(
    review_id: int,
    db: Session = Depends(get_db),
):
    review = db.get(DetectionReview, review_id)
    if review is None:
        raise HTTPException(status_code=404, detail="Detection review not found")
    if review.user_decision != "manually_added":
        raise HTTPException(
            status_code=400,
            detail="Only manually added detections can be deleted",
        )

    session = review.session
    removed_artifacts = remove_manual_yolo_annotation(review)
    db.delete(review)
    if session is not None:
        _update_session_status(db, session)
    db.commit()
    return {
        "deleted": True,
        "review_id": review_id,
        "removed_artifacts": removed_artifacts,
    }


@app.get(
    "/api/v1/product-embeddings/pending-review",
    response_model=list[ProductEmbeddingReviewResponse],
)
def list_pending_reference_embeddings(
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(ProductEmbedding, Product)
        .join(Product, ProductEmbedding.product_id == Product.product_id)
        .filter(ProductEmbedding.source == "user_confirmed_crop")
        .filter(ProductEmbedding.quality_status == "pending")
        .order_by(ProductEmbedding.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        _embedding_review_response(product_embedding, product)
        for product_embedding, product in rows
    ]


@app.post(
    "/api/v1/product-embeddings/{embedding_id}/quality-status",
    response_model=ProductEmbeddingReviewResponse,
)
def update_product_embedding_quality_status(
    embedding_id: int,
    payload: ProductEmbeddingQualityStatusRequest,
    db: Session = Depends(get_db),
):
    if payload.quality_status not in REFERENCE_QUALITY_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid quality_status: {payload.quality_status}",
        )

    product_embedding = db.get(ProductEmbedding, embedding_id)
    if product_embedding is None:
        raise HTTPException(status_code=404, detail="Product embedding not found")

    product_embedding.quality_status = payload.quality_status
    product = db.get(Product, product_embedding.product_id)
    db.commit()
    db.refresh(product_embedding)
    return _embedding_review_response(product_embedding, product)


@app.post("/api/v1/inventory/confirm", response_model=InventoryConfirmResponse)
async def confirm_inventory(
    payload: InventoryConfirmRequest,
    db: Session = Depends(get_db),
):
    valid_actions = {"count", "stock_in", "stock_out", "adjustment"}
    applied_items = []

    try:
        for item in payload.confirmed_items:
            if item.action not in valid_actions:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid inventory action: {item.action}",
                )

            if item.quantity < 0:
                raise HTTPException(
                    status_code=400,
                    detail="Quantity must be greater than or equal to zero",
                )

            product = db.get(Product, item.product_id)

            if product is None:
                raise HTTPException(
                    status_code=404,
                    detail=f"Product not found: {item.product_id}",
                )

            current_count = product.inventory_count or 0
            quantity_delta = 0

            if item.action == "stock_in":
                quantity_delta = item.quantity
                product.inventory_count = current_count + item.quantity
            elif item.action == "stock_out":
                if item.quantity > current_count:
                    raise HTTPException(
                        status_code=400,
                        detail=(
                            f"Not enough stock for {item.product_id}: "
                            f"current={current_count}, requested={item.quantity}"
                        ),
                    )

                quantity_delta = -item.quantity
                product.inventory_count = current_count - item.quantity
            elif item.action == "adjustment":
                quantity_delta = item.quantity - current_count
                product.inventory_count = item.quantity

            transaction = InventoryTransaction(
                product_id=product.product_id,
                quantity_delta=quantity_delta,
                action_type=item.action,
                source="user_confirmed",
                detection_id=item.detection_id,
            )
            db.add(transaction)
            db.flush()

            applied_items.append(
                {
                    "detection_id": item.detection_id,
                    "product_id": product.product_id,
                    "action": item.action,
                    "quantity": item.quantity,
                    "quantity_delta": quantity_delta,
                    "inventory_count": product.inventory_count or 0,
                    "transaction_id": transaction.id,
                }
            )

        db.commit()

        return InventoryConfirmResponse(
            confirmed_items=applied_items,
            rejected_items=[
                {"detection_id": item.detection_id, "reason": item.reason}
                for item in payload.rejected_items
            ],
        )
    except Exception:
        db.rollback()
        raise
