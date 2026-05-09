# AI Visual Inventory PoC

Self-hosted visual inventory proof of concept for registering products from images and recognizing one or more products from a camera/upload image.

## Architecture

- FastAPI API in `app/api.py`
- YOLO + CLIP image pipeline in `app/ai_pipeline.py`
- PostgreSQL 15 with pgvector for product metadata and embeddings
- SQLAlchemy model `Product(product_id, name, inventory_count, embedding)`
- Streamlit frontend in `frontend/main.py`
- Docker Compose starts `db`, `api`, and `frontend`

The API stores one normalized 512-dimensional CLIP embedding per product. Recognition detects product regions with YOLO, crops each region, embeds each crop, searches nearest products with pgvector cosine distance, and returns `recognized` or `unknown` per detected region.

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

Register a product reference image. If YOLO detects exactly one object, the API stores an embedding for that crop. If YOLO detects zero objects and `REGISTRATION_FALLBACK_TO_FULL_IMAGE=true`, the API stores a full-image embedding. Images with multiple detected objects are rejected:

```bash
curl -F product_id=CUP-001 \
  -F name="Test Cup" \
  -F inventory_count=25 \
  -F file=@cup.jpg \
  http://localhost:8000/api/v1/products
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
- HNSW cosine index on `products.embedding`

Index name:

```sql
products_embedding_hnsw_idx
```

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
- Model weights are downloaded on first use unless already cached in the Docker volume.
- No auth, Qdrant, Kubernetes, model fine-tuning, or automatic stock mutation is included in this PoC.
