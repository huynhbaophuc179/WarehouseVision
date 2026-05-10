# AI Visual Inventory PoC

Self-hosted visual inventory proof of concept for registering products from images and recognizing one or more products from a camera/upload image.

## Architecture

- FastAPI API in `app/api.py`
- YOLO + CLIP image pipeline in `app/ai_pipeline.py`
- PostgreSQL 15 with pgvector for product metadata and visual embeddings
- SQLAlchemy models:
  - `Product(product_id, name, inventory_count, created_at, updated_at)`
  - `ProductEmbedding(id, product_id, embedding, image_path, view_label, created_at)`
  - `InventoryTransaction(id, product_id, quantity_delta, action_type, source, detection_id, created_at)`
- Streamlit frontend in `frontend/main.py`
- Docker Compose starts `db`, `api`, and `frontend`

The API stores many normalized 512-dimensional CLIP embeddings per product. Recognition detects product regions with YOLO, crops each region, embeds each crop, searches across all product reference embeddings with pgvector cosine distance, then maps the best embedding matches back to unique `product_id` results. Recognition is only a suggestion: the frontend shows bounding boxes for review, and inventory is changed only after explicit human confirmation.

Recognition responses include a small base64 JPEG crop preview for every detected box. These previews are debugging aids to verify whether YOLO cropped the actual product or a misleading fragment before trusting the CLIP match.

## Run With Docker Compose

```bash
docker compose up --build
```

Or run in the background:

```bash
docker compose up -d --build
```

Services:

- API: http://localhost:8000
- API docs: http://localhost:8000/docs
- Streamlit frontend: http://localhost:8501
- PostgreSQL: localhost:5432

The Streamlit frontend supports multi-image product registration in one submit. The first selected image creates the product, and remaining selected images are uploaded as additional reference embeddings for the same SKU. Batch uploads auto-generate view labels such as `view_1`, `view_2`, or `front_1`, `front_2` when a common prefix is provided.

Stop services:

```bash
docker compose down
```

Reset database volumes:

```bash
docker compose down -v
```

## API Examples

Health check:

```bash
curl http://localhost:8000/health
```

Register a product reference image. This upserts product metadata and inserts a new reference embedding without overwriting existing embeddings for the same product. If YOLO detects exactly one object, the API stores an embedding for that crop. If YOLO detects zero objects and `REGISTRATION_FALLBACK_TO_FULL_IMAGE=true`, the API stores a full-image embedding. Images with multiple detected objects are rejected:

```bash
curl -F product_id=CUP-001 \
  -F name="Test Cup" \
  -F inventory_count=25 \
  -F view_label=front \
  -F file=@cup.jpg \
  http://localhost:8000/api/v1/products
```

Add another reference image to an existing product:

```bash
curl -F view_label=back \
  -F file=@cup-back.jpg \
  http://localhost:8000/api/v1/products/CUP-001/embeddings
```

Recognize all detected products in an image:

```bash
curl -F file=@scene.jpg \
  http://localhost:8000/api/v1/recognize
```

Example response:

```json
[
  {
    "detection_id": "det_1",
    "box": [10.0, 20.0, 140.0, 180.0],
    "crop_preview_base64": "/9j/4AAQSkZJRgABAQ...",
    "detector_confidence": 0.87,
    "product_id": "CUP-001",
    "name": "Test Cup",
    "inventory_count": 25,
    "distance": 0.08,
    "status": "recognized",
    "matched_embedding_id": 12,
    "matched_view_label": "front",
    "top1_distance": 0.08,
    "top2_distance": 0.19,
    "distance_margin": 0.11,
    "candidates": [
      {
        "product_id": "CUP-001",
        "name": "Test Cup",
        "inventory_count": 25,
        "distance": 0.08,
        "matched_embedding_id": 12,
        "matched_view_label": "front"
      }
    ]
  },
  {
    "detection_id": "det_2",
    "box": [180.0, 40.0, 260.0, 150.0],
    "crop_preview_base64": "/9j/4AAQSkZJRgABAQ...",
    "detector_confidence": 0.42,
    "product_id": null,
    "name": null,
    "inventory_count": null,
    "distance": 0.41,
    "status": "unknown",
    "matched_embedding_id": 17,
    "matched_view_label": "side",
    "top1_distance": 0.41,
    "top2_distance": 0.43,
    "distance_margin": 0.02,
    "candidates": [
      {
        "product_id": "ALT-001",
        "name": "Closest visual candidate",
        "inventory_count": 5,
        "distance": 0.41,
        "matched_embedding_id": 17,
        "matched_view_label": "side"
      }
    ]
  }
]
```

Confirm reviewed inventory results. `count` records the confirmation without changing stock; `stock_in`, `stock_out`, and `adjustment` update `inventory_count` only after the user clicks the confirmation button in the frontend:

```bash
curl -X POST http://localhost:8000/api/v1/inventory/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "confirmed_items": [
      {
        "detection_id": "det_1",
        "product_id": "CUP-001",
        "quantity": 2,
        "action": "stock_in"
      }
    ],
    "rejected_items": [
      {
        "detection_id": "det_2",
        "reason": "wrong part"
      }
    ]
  }'
```

Get top candidate matches for a full image:

```bash
curl -F file=@product.jpg \
  "http://localhost:8000/api/v1/recognize/candidates?top_k=5"
```

Candidate responses are unique by product and include the best matched reference embedding:

```json
{
  "candidates": [
    {
      "product_id": "CUP-001",
      "name": "Test Cup",
      "inventory_count": 25,
      "distance": 0.08,
      "matched_embedding_id": 12,
      "matched_view_label": "front"
    }
  ]
}
```

## Environment Variables

API service variables in `docker-compose.yml`:

- `DATABASE_URL`: SQLAlchemy connection string for PostgreSQL.
- `DETECTOR_RECOGNIZED_CONFIDENCE_THRESHOLD`: minimum YOLO confidence for a direct `recognized` result, default `0.60`.
- `DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD`: minimum YOLO confidence before recognition is even considered, default `0.45`. Lower-confidence crops become `unknown`.
- `SIMILARITY_RECOGNIZED_THRESHOLD`: maximum top-1 cosine distance for a direct `recognized` result, default `0.15`.
- `SIMILARITY_UNKNOWN_THRESHOLD`: maximum top-1 cosine distance before a crop becomes `unknown`, default `0.22`.
- `SIMILARITY_MARGIN_THRESHOLD`: minimum gap between top-1 and top-2 cosine distance before a result is considered safely recognized, default `0.03`. Smaller gaps become `uncertain`.
- `YOLO_MODEL_PATH`: YOLO model path, default `yolov8n.pt`.
- `YOLO_CLASSES`: comma-separated YOLO class IDs to detect. Use an empty value for the generic PoC so YOLO is not restricted to a few COCO classes.
- `CLIP_MODEL_NAME`: Hugging Face CLIP model name, default `openai/clip-vit-base-patch32`.
- `RECOGNITION_CANDIDATE_LIMIT`: number of unique product candidates to include per detected box, default `3`.
- `REGISTRATION_FALLBACK_TO_FULL_IMAGE`: when `true`, product registration embeds the full image if YOLO detects zero boxes.
- `MIN_CROP_DIMENSION_PX`: minimum crop width and height accepted for recognition, default `32`.
- `MIN_CROP_AREA_RATIO`: minimum crop area relative to full image before recognition is attempted, default `0.001`.
- `LOG_LEVEL`: Python logging level for the API, default `INFO`.

For this generic PoC, keep `YOLO_CLASSES=""`. In production, train or provide a one-class YOLO model for `product` detection, then calibrate `YOLO_CLASSES` and detection thresholds around real warehouse images.

Recognition thresholds must be calibrated with real product photos. A direct `recognized` result now requires both detector confidence and visual similarity confidence. If wrong boxes are recognized as a known SKU, raise `DETECTOR_RECOGNIZED_CONFIDENCE_THRESHOLD`, lower `SIMILARITY_RECOGNIZED_THRESHOLD`, lower `SIMILARITY_UNKNOWN_THRESHOLD`, or raise `SIMILARITY_MARGIN_THRESHOLD`. If valid products are often missed, loosen these gradually while watching false positives.

## Database Initialization

On FastAPI startup, `init_db()` creates:

- pgvector extension
- `products` table
- `product_embeddings` table
- `inventory_transactions` table
- HNSW cosine index on `product_embeddings.embedding`

Index name:

```sql
product_embeddings_embedding_hnsw_idx
```

Older databases that still have a legacy `products.embedding` column are migrated conservatively by copying one `legacy` embedding per product into `product_embeddings` when that product has no reference embeddings yet.

## Reference Image Guidance

One product can have multiple reference images. For normal SKUs, start with 5-10 images per product from different angles and lighting conditions. For small industrial components, use 8-12 images per SKU because shape, surface finish, oil, shadows, and partial occlusion can change the CLIP embedding more than expected. The frontend batch uploader is intended to make collecting those 5-12 reference images practical during registration.

Recognition searches every stored reference embedding first, then aggregates matches back to unique products by keeping each product's smallest cosine distance. Multiple embeddings improve robustness across views, lighting, packaging states, and close-up model-code photos.

Recognition statuses:

- `recognized`: detector confidence is at least `DETECTOR_RECOGNIZED_CONFIDENCE_THRESHOLD`, top-1 distance is at or below `SIMILARITY_RECOGNIZED_THRESHOLD`, and top-2 is separated by at least `SIMILARITY_MARGIN_THRESHOLD`.
- `uncertain`: the crop is plausible but not safe enough for direct recognition. This includes medium detector confidence, top-1 distance between recognized and unknown thresholds, or a small top-1/top-2 margin. The frontend shows this as `Cần kiểm tra` and defaults toward manual review.
- `unknown`: no candidate, detector confidence is below `DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD`, distance is above `SIMILARITY_UNKNOWN_THRESHOLD`, or the crop is too small/invalid.

## Debugging False Positives

Use the crop previews in the frontend recognition cards first. If a wrong product such as `nút xanh 1` appears repeatedly, check whether the crop preview is actually the target product or a small misleading part of the scene. Low-confidence crops such as wires, connectors, reflections, or partial fragments should be rejected or marked unknown, even when their CLIP distance looks close. The response also exposes `detector_confidence`, `top1_distance`, `top2_distance`, and `distance_margin` so you can see whether CLIP strongly preferred one SKU or produced an ambiguous match.

For detector problems, tune YOLO classes/model later. For matching problems, tune detector confidence thresholds, similarity thresholds, margin threshold, and collect more reference images from the real product views.

## Human Confirmation Workflow

The Streamlit recognition screen draws bounding boxes over the uploaded image and labels every detected region with an index. Each detection can be confirmed, rejected, marked as unknown, or assigned to a manually entered `product_id`. Quantity and action are collected only for confirmed items.

AI recognition never updates stock by itself. The frontend sends reviewed results to `POST /api/v1/inventory/confirm` only when the user clicks `Confirm inventory result`. Rejected detections are returned in the confirmation response and can be collected later as useful examples for improving detector or embedding quality.

## Smoke Checks

Run lightweight import/route checks inside the API container:

```bash
docker compose exec api python smoke_tests.py
```

These checks do not run YOLO or CLIP inference.

## Known Limitations

- The default `yolov8n.pt` model is trained on COCO classes, not industrial inventory parts.
- Product registration rejects multiple detected boxes, but can use full-image fallback when YOLO detects zero boxes.
- Recognition uses threshold-based unknown handling and does not update inventory quantities without user confirmation.
- Real accuracy depends on training a one-class product detector later and calibrating the similarity threshold with real images.
- Current recognition is visual-only: no OCR, no fine-tuning, and no custom YOLO model is included yet.
- Model weights are downloaded on first use unless already cached in the Docker volume.
- No auth, Qdrant, Kubernetes, model fine-tuning, or automatic stock mutation is included in this PoC.
