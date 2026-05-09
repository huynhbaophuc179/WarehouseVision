import logging
import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .ai_pipeline import (
    RegistrationImageError,
    process_image,
    process_multiple_images,
    process_registration_image,
)
from .database import SessionLocal, init_db
from .models import Product, ProductEmbedding

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger(__name__)

SIMILARITY_THRESHOLD = float(os.getenv("SIMILARITY_THRESHOLD", "0.25"))


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


class MultiRecognizeResponse(BaseModel):
    box: list[float]
    product_id: str | None
    name: str | None
    inventory_count: int | None
    distance: float | None
    status: str


class RecognizeCandidatesResponse(BaseModel):
    candidates: list[CandidateResponse]


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
            embedding = process_registration_image(temp_path)
        except RegistrationImageError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        product_embedding = ProductEmbedding(
            product_id=product.product_id,
            embedding=embedding,
            view_label=view_label,
        )
        db.add(product_embedding)
        db.commit()
        db.refresh(product_embedding)

        return ProductEmbeddingResponse(
            id=product_embedding.id,
            product_id=product_embedding.product_id,
            view_label=product_embedding.view_label,
            image_path=product_embedding.image_path,
        )
    except Exception:
        db.rollback()
        raise
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.post("/api/v1/recognize", response_model=list[MultiRecognizeResponse])
async def recognize(file: UploadFile = File(...), db: Session = Depends(get_db)):
    _ensure_image(file)
    temp_path = _save_upload_to_temp(file)

    try:
        detected_items = process_multiple_images(temp_path)
        response_items = []
        logger.info("recognize detected_boxes=%s", len(detected_items))

        for index, item in enumerate(detected_items, start=1):
            results = _nearest_product_candidates(db, item["embedding"])

            if not results:
                logger.info(
                    "recognize item=%s best_distance=%s status=%s",
                    index,
                    None,
                    "unknown",
                )
                response_items.append(
                    MultiRecognizeResponse(
                        box=item["box"],
                        product_id=None,
                        name=None,
                        inventory_count=None,
                        distance=None,
                        status="unknown",
                    )
                )
                continue

            product, product_embedding, distance = results[0]

            if distance > SIMILARITY_THRESHOLD:
                logger.info(
                    "recognize item=%s best_distance=%.6f status=%s",
                    index,
                    distance,
                    "unknown",
                )
                response_items.append(
                    MultiRecognizeResponse(
                        box=item["box"],
                        product_id=None,
                        name=None,
                        inventory_count=None,
                        distance=distance,
                        status="unknown",
                    )
                )
                continue

            logger.info(
                "recognize item=%s best_distance=%.6f status=%s",
                index,
                distance,
                "recognized",
            )
            response_items.append(
                MultiRecognizeResponse(
                    box=item["box"],
                    product_id=product.product_id,
                    name=product.name,
                    inventory_count=product.inventory_count,
                    distance=distance,
                    status="recognized",
                )
            )

        return response_items
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
                CandidateResponse(
                    product_id=product.product_id,
                    name=product.name,
                    inventory_count=product.inventory_count,
                    distance=distance,
                    matched_embedding_id=product_embedding.id,
                    matched_view_label=product_embedding.view_label,
                )
                for product, product_embedding, distance in results
            ]
        )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
