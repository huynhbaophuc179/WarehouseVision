# AI Visual Inventory PoC

Self-hosted visual inventory proof of concept for registering products from images and recognizing one or more products from a camera/upload image.

## Architecture

- FastAPI API in `app/api.py`
- YOLO + CLIP image pipeline in `app/ai_pipeline.py`
- PostgreSQL 15 with pgvector for product metadata and visual embeddings
- SQLAlchemy models:
  - `Product(product_id, name, inventory_count, created_at, updated_at)`
  - `ProductEmbedding(id, product_id, embedding, image_path, view_label, created_at)`
- Streamlit frontend in `frontend/main.py`
- Docker Compose starts `db`, `api`, and `frontend`

The API stores many normalized 512-dimensional CLIP embeddings per product. Recognition detects product regions with YOLO, crops each region, embeds each crop, searches across all product reference embeddings with pgvector cosine distance, then maps the best embedding matches back to unique `product_id` results.

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

The Streamlit frontend supports single-image product creation and batch upload of additional reference images for the same SKU. Batch uploads auto-generate view labels such as `view_1`, `view_2`, or `front_1`, `front_2` when a common prefix is provided.

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
    "box": [10.0, 20.0, 140.0, 180.0],
    "product_id": "CUP-001",
    "name": "Test Cup",
    "inventory_count": 25,
    "distance": 0.08,
    "status": "recognized"
  },
  {
    "box": [180.0, 40.0, 260.0, 150.0],
    "product_id": null,
    "name": null,
    "inventory_count": null,
    "distance": 0.41,
    "status": "unknown"
  }
]
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
- `SIMILARITY_THRESHOLD`: maximum cosine distance for a recognized result. Larger distances become `unknown`.
- `YOLO_MODEL_PATH`: YOLO model path, default `yolov8n.pt`.
- `YOLO_CLASSES`: comma-separated YOLO class IDs to detect. Use an empty value for the generic PoC so YOLO is not restricted to a few COCO classes.
- `CLIP_MODEL_NAME`: Hugging Face CLIP model name, default `openai/clip-vit-base-patch32`.
- `REGISTRATION_FALLBACK_TO_FULL_IMAGE`: when `true`, product registration embeds the full image if YOLO detects zero boxes.
- `LOG_LEVEL`: Python logging level for the API, default `INFO`.

For this generic PoC, keep `YOLO_CLASSES=""`. In production, train or provide a one-class YOLO model for `product` detection, then calibrate `YOLO_CLASSES` and detection thresholds around real warehouse images.

`SIMILARITY_THRESHOLD` must be calibrated with real product photos. The default is only a starting point; too high can create false matches, and too low can mark valid products as `unknown`.

## Database Initialization

On FastAPI startup, `init_db()` creates:

- pgvector extension
- `products` table
- `product_embeddings` table
- HNSW cosine index on `product_embeddings.embedding`

Index name:

```sql
product_embeddings_embedding_hnsw_idx
```

Older databases that still have a legacy `products.embedding` column are migrated conservatively by copying one `legacy` embedding per product into `product_embeddings` when that product has no reference embeddings yet.

## Reference Image Guidance

One product can have multiple reference images. For normal SKUs, start with 5-10 images per product from different angles and lighting conditions. For small industrial components, use 8-12 images per SKU because shape, surface finish, oil, shadows, and partial occlusion can change the CLIP embedding more than expected. The frontend batch uploader is intended to make collecting those 5-12 reference images practical during registration.

Recognition searches every stored reference embedding first, then aggregates matches back to unique products by keeping each product's smallest cosine distance. Multiple embeddings improve robustness across views, lighting, packaging states, and close-up model-code photos.

## Smoke Checks

Run lightweight import/route checks inside the API container:

```bash
docker compose exec api python smoke_tests.py
```

These checks do not run YOLO or CLIP inference.

## Known Limitations

- The default `yolov8n.pt` model is trained on COCO classes, not industrial inventory parts.
- Product registration rejects multiple detected boxes, but can use full-image fallback when YOLO detects zero boxes.
- Recognition uses threshold-based unknown handling and does not update inventory quantities automatically.
- Real accuracy depends on training a one-class product detector later and calibrating the similarity threshold with real images.
- Current recognition is visual-only: no OCR, no fine-tuning, and no custom YOLO model is included yet.
- Model weights are downloaded on first use unless already cached in the Docker volume.
- No auth, Qdrant, Kubernetes, model fine-tuning, or automatic stock mutation is included in this PoC.
