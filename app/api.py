import base64
import json
import logging
import os
import shutil
import tempfile
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from io import BytesIO
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from PIL import Image

from .ai_pipeline import (
    RegistrationImageError,
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
RECOGNITION_CANDIDATE_LIMIT = int(os.getenv("RECOGNITION_CANDIDATE_LIMIT", "3"))
MODEL_VERSION = os.getenv("MODEL_VERSION", os.getenv("YOLO_MODEL_PATH", "yolov8n.pt"))
REVIEW_STORAGE_DIR = Path(os.getenv("REVIEW_STORAGE_DIR", "review_data"))
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Visual Search & Inventory PoC",
    version="0.1.0",
    lifespan=lifespan,
)


class ProductResponse(BaseModel):
    product_id: str
    name: str
    inventory_count: int


class RecognizeResponse(ProductResponse):
    distance: float


class CandidateResponse(RecognizeResponse):
    matched_embedding_id: int
    matched_view_label: str | None


class ProductEmbeddingResponse(BaseModel):
    id: int
    product_id: str
    view_label: str | None
    image_path: str | None
    source: str
    quality_status: str


class MultiRecognizeResponse(BaseModel):
    session_id: int | None
    review_id: int | None
    detection_id: str
    box: list[float]
    crop_preview_base64: str | None
    detector_confidence: float | None
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
    candidates: list[CandidateResponse] = Field(default_factory=list)


class RecognizeCandidatesResponse(BaseModel):
    candidates: list[CandidateResponse]


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


class ManualDetectionRequest(BaseModel):
    corrected_box: list[float]
    confirmed_product_id: str | None = None
    user_decision: str = "manually_added"


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
    created_at: datetime


class RecognitionSessionSummary(BaseModel):
    id: int
    original_image_path: str
    status: str
    mode: str
    model_version: str | None
    created_at: datetime


class RecognitionSessionDetail(RecognitionSessionSummary):
    original_image_base64: str | None
    detections: list[DetectionReviewResponse]


class ProductEmbeddingQualityStatusRequest(BaseModel):
    quality_status: str


class ProductEmbeddingReviewResponse(ProductEmbeddingResponse):
    product_name: str | None
    image_preview_base64: str | None


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


def _image_to_base64(path: str | None, max_size: tuple[int, int] | None = None) -> str | None:
    if not path or not os.path.exists(path):
        return None

    image = Image.open(path).convert("RGB")
    if max_size is not None:
        image.thumbnail(max_size)

    buffer = BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    buffer.seek(0)
    return base64.b64encode(buffer.read()).decode("ascii")


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


def _review_response(review: DetectionReview) -> DetectionReviewResponse:
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

    product, product_embedding, distance = results[0]
    top2_distance = results[1][2] if len(results) > 1 else None
    candidates = [
        _candidate_response(candidate_product, candidate_embedding, candidate_distance)
        for candidate_product, candidate_embedding, candidate_distance in results
    ]

    review.predicted_product_id = product.product_id
    review.top1_distance = distance
    review.top2_distance = top2_distance
    review.distance_margin = (
        top2_distance - distance if top2_distance is not None else None
    )
    review.matched_embedding_id = product_embedding.id
    review.matched_view_label = product_embedding.view_label
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
    return CandidateResponse(
        product_id=product.product_id,
        name=product.name,
        inventory_count=product.inventory_count or 0,
        distance=distance,
        matched_embedding_id=product_embedding.id,
        matched_view_label=product_embedding.view_label,
    )


@app.get("/health")
def health_check():
    return {"status": "ok"}


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
        db.add(
            ProductEmbedding(
                product_id=product.product_id,
                embedding=embedding,
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
                "product_id": None,
                "name": None,
                "inventory_count": None,
                "distance": None,
                "matched_embedding_id": None,
                "matched_view_label": None,
                "top1_distance": None,
                "top2_distance": None,
                "distance_margin": None,
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
                append_review_response({**base_response, "status": "unknown"})
                continue

            results = _nearest_product_candidates(
                db,
                item["embedding"],
                limit=RECOGNITION_CANDIDATE_LIMIT,
            )

            if not results:
                logger.info(
                    "recognize item=%s best_distance=%s status=%s",
                    index,
                    None,
                    "unknown",
                )
                append_review_response({**base_response, "status": "unknown"})
                continue

            product, product_embedding, distance = results[0]
            candidates = [
                _candidate_response(
                    candidate_product,
                    candidate_embedding,
                    candidate_distance,
                )
                for candidate_product, candidate_embedding, candidate_distance in results
            ]
            top1_distance = distance
            top2_distance = results[1][2] if len(results) > 1 else None
            distance_margin = (
                top2_distance - top1_distance
                if top2_distance is not None
                else None
            )
            match_fields = {
                **base_response,
                "distance": top1_distance,
                "matched_embedding_id": product_embedding.id,
                "matched_view_label": product_embedding.view_label,
                "top1_distance": top1_distance,
                "top2_distance": top2_distance,
                "distance_margin": distance_margin,
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

            if distance > SIMILARITY_UNKNOWN_THRESHOLD:
                logger.info(
                    "recognize item=%s best_distance=%.6f status=%s",
                    index,
                    distance,
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
                        "product_id": product.product_id,
                        "name": product.name,
                        "inventory_count": product.inventory_count or 0,
                        "status": "uncertain",
                    }
                )
                continue

            if distance > SIMILARITY_RECOGNIZED_THRESHOLD:
                logger.info(
                    "recognize item=%s best_distance=%.6f status=%s",
                    index,
                    distance,
                    "uncertain",
                )
                append_review_response(
                    {
                        **match_fields,
                        "product_id": product.product_id,
                        "name": product.name,
                        "inventory_count": product.inventory_count or 0,
                        "status": "uncertain",
                    }
                )
                continue

            if distance_margin is not None and distance_margin < SIMILARITY_MARGIN_THRESHOLD:
                logger.info(
                    "recognize item=%s best_distance=%.6f margin=%.6f status=%s",
                    index,
                    distance,
                    distance_margin,
                    "uncertain",
                )
                append_review_response(
                    {
                        **match_fields,
                        "product_id": product.product_id,
                        "name": product.name,
                        "inventory_count": product.inventory_count or 0,
                        "status": "uncertain",
                    }
                )
                continue

            logger.info(
                "recognize item=%s best_distance=%.6f status=%s",
                index,
                distance,
                "recognized",
            )
            append_review_response(
                {
                    **match_fields,
                    "product_id": product.product_id,
                    "name": product.name,
                    "inventory_count": product.inventory_count or 0,
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
            candidates=[
                _candidate_response(product, product_embedding, distance)
                for product, product_embedding, distance in results
            ]
        )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.get("/api/v1/review/sessions", response_model=list[RecognitionSessionSummary])
def list_review_sessions(
    limit: int = Query(25, ge=1, le=100),
    mode: str | None = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(RecognitionSession)
    if mode:
        query = query.filter(RecognitionSession.mode == mode)

    sessions = query.order_by(RecognitionSession.created_at.desc()).limit(limit).all()
    return [
        RecognitionSessionSummary(
            id=session.id,
            original_image_path=session.original_image_path,
            status=session.status,
            mode=session.mode,
            model_version=session.model_version,
            created_at=session.created_at,
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
    return RecognitionSessionDetail(
        id=session.id,
        original_image_path=session.original_image_path,
        status=session.status,
        mode=session.mode,
        model_version=session.model_version,
        created_at=session.created_at,
        original_image_base64=_image_to_base64(
            session.original_image_path,
            max_size=(1200, 1200),
        ),
        detections=[_review_response(review) for review in detections],
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

    db.flush()
    _update_session_status(db, review.session)

    db.commit()
    db.refresh(review)
    return _review_response(review)


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
    _update_session_status(db, session)
    db.commit()
    db.refresh(review)
    return _review_response(review)


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
