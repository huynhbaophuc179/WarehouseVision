import os
import shutil
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .ai_pipeline import process_image
from .database import SessionLocal, init_db
from .models import Product

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


class RecognizeCandidatesResponse(BaseModel):
    candidates: list[RecognizeResponse]


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


def _nearest_products(
    db: Session,
    query_vector: list[float],
    limit: int = 1,
) -> list[tuple[Product, float]]:
    distance_expr = Product.embedding.cosine_distance(query_vector)
    rows = (
        db.query(Product, distance_expr.label("distance"))
        .filter(Product.embedding.isnot(None))
        .order_by(distance_expr)
        .limit(limit)
        .all()
    )
    return [(product, float(distance)) for product, distance in rows if distance is not None]


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/v1/products", response_model=ProductResponse, status_code=201)
async def upsert_product(
    product_id: str = Form(...),
    name: str = Form(...),
    inventory_count: int = Form(0),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    _ensure_image(file)
    temp_path = _save_upload_to_temp(file)

    try:
        embedding = process_image(temp_path)
        product = db.get(Product, product_id)

        if product is None:
            product = Product(product_id=product_id)
            db.add(product)

        product.name = name
        product.inventory_count = inventory_count
        product.embedding = embedding

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


@app.post("/api/v1/recognize", response_model=RecognizeResponse)
async def recognize(file: UploadFile = File(...), db: Session = Depends(get_db)):
    _ensure_image(file)
    temp_path = _save_upload_to_temp(file)

    try:
        query_vector = process_image(temp_path)
        results = _nearest_products(db, query_vector)

        if not results:
            raise HTTPException(status_code=404, detail="No reference products have embeddings")

        product, distance = results[0]

        if distance > SIMILARITY_THRESHOLD:
            raise HTTPException(
                status_code=404,
                detail="Product not recognized or confidence too low",
            )

        return RecognizeResponse(
            product_id=product.product_id,
            name=product.name,
            inventory_count=product.inventory_count,
            distance=float(distance),
        )
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
        results = _nearest_products(db, query_vector, limit=top_k)

        if not results:
            raise HTTPException(status_code=404, detail="No reference products have embeddings")

        return RecognizeCandidatesResponse(
            candidates=[
                RecognizeResponse(
                    product_id=product.product_id,
                    name=product.name,
                    inventory_count=product.inventory_count,
                    distance=distance,
                )
                for product, distance in results
            ]
        )
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)
