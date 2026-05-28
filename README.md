# AI Visual Inventory PoC

Self-hosted visual inventory proof of concept for registering products from images and recognizing one or more products from a camera/upload image.

## Architecture

- FastAPI API in `app/api.py`
- YOLO + CLIP image pipeline in `app/ai_pipeline.py`
- PostgreSQL 15 with pgvector for product metadata and visual embeddings
- SQLAlchemy models:
  - `Product(product_id, name, inventory_count, created_at, updated_at)`
  - `ProductEmbedding(id, product_id, embedding, image_path, view_label, source, quality_status, created_at)`
  - `InventoryTransaction(id, product_id, quantity_delta, action_type, source, detection_id, created_at)`
  - `RecognitionSession(id, original_image_path, status, mode, model_version, created_at)`
  - `DetectionReview(id, session_id, boxes, crop_path, predicted/confirmed product, decision, confidence fields, created_at)`
- Streamlit frontend in `frontend/main.py`
- Docker Compose starts `db`, `api`, and `frontend`

The API stores many normalized 512-dimensional CLIP embeddings per product. Recognition detects product regions with YOLO, crops each region, embeds each crop, searches across all product reference embeddings with pgvector cosine distance, then maps the best embedding matches back to unique `product_id` results. Phase 2 recognition returns Top-K product candidates for every crop, can optionally run OCR on the crop, computes text/category reranking scores when metadata is available, and records human feedback for later improvement. Recognition is only a suggestion: the frontend shows bounding boxes for review, and inventory is changed only after explicit human confirmation.

Recognition responses include a small base64 JPEG crop preview for every detected box. These previews are debugging aids to verify whether YOLO cropped the actual product or a misleading fragment before trusting the CLIP match.

## UI Modes

The Streamlit app separates daily work from AI improvement:

- `Nhận diện / Kiểm kho`: for warehouse scanning. It shows the uploaded image with bounding boxes, a simple product list, Top-K candidate choices for each crop, confidence explanations, and user decisions for inventory confirmation. Technical fields stay hidden under `Technical Details`.
- `Quản lý sản phẩm`: keeps the existing product creation and multi-image reference upload flow.
- `Review & sửa lỗi AI`: for supervisors/admins reviewing AI behavior. It shows stored recognition sessions, crops, top-K candidates, detector confidence, distance metrics, matched embedding details, and training decisions.
- `Vẽ box sản phẩm bị thiếu`: lets a reviewer draw one missing product box directly on the source image, preview the crop, and save it as a one-class YOLO `product` annotation.
- `Dataset YOLO`: shows local dataset counts and creates or refreshes `data.yaml`.
- `Cài đặt`: summarizes the main runtime threshold knobs.

Every recognition request creates a review session and one detection review row per box. Operation Mode can save decisions such as accepted, corrected product, unknown, not product, `needs_review`, or ignored. Training Mode can later review the same stored session.

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

Register a product reference image. This upserts product metadata and inserts a new reference embedding without overwriting existing embeddings for the same product. By default, registration embeds the full uploaded image so manually cropped reference photos are safe to use. If `REGISTRATION_USE_DETECTOR_CROP=true`, registration uses the stricter YOLO crop path and rejects images with multiple detected objects:

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

If the reference image is already cropped tightly around the product, bypass detector cropping for that upload:

```bash
curl -F view_label=back \
  -F use_full_image=true \
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
    "session_id": 42,
    "review_id": 1001,
    "box": [10.0, 20.0, 140.0, 180.0],
    "crop_preview_base64": "/9j/4AAQSkZJRgABAQ...",
    "detector_confidence": 0.87,
    "detector_backend": "yolov8",
    "detector_model": "yolov8n.pt",
    "detector_prompt": "product",
    "detector_class_name": "product",
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
    "raw_ocr_text": null,
    "normalized_ocr_text": null,
    "ocr_text_found": false,
    "image_similarity_score": 0.92,
    "text_match_score": null,
    "text_match_used_in_rerank": false,
    "final_score": 0.92,
    "confidence_level": "HIGH",
    "confidence_explanation": ["Image similarity is high", "Final score is 0.92"],
    "explanation": ["Image similarity is high", "Final score is 0.92"],
    "candidates": [
      {
        "product_id": "CUP-001",
        "product_code": "CUP-001",
        "product_name": "Test Cup",
        "name": "Test Cup",
        "inventory_count": 25,
        "distance": 0.08,
        "image_similarity_score": 0.92,
        "text_match_score": null,
        "ocr_text_found": false,
        "text_match_used_in_rerank": false,
        "final_score": 0.92,
        "confidence_level": "HIGH",
        "confidence_explanation": ["Image similarity is high", "Final score is 0.92"],
        "reference_image_path": null,
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
When OCR is enabled on `/api/v1/recognize`, the frontend sorts and explains candidates using image similarity, OCR text matching, and optional category metadata. `/api/v1/recognize/candidates` remains image-only because it receives a full image reference query.

```json
{
  "candidates": [
    {
      "product_id": "CUP-001",
      "product_code": "CUP-001",
      "product_name": "Test Cup",
      "name": "Test Cup",
      "inventory_count": 25,
      "distance": 0.08,
      "image_similarity_score": 0.92,
      "text_match_score": null,
      "ocr_text_found": false,
      "text_match_used_in_rerank": false,
      "final_score": 0.92,
      "confidence_level": "HIGH",
      "reference_image_path": null,
      "matched_embedding_id": 12,
      "matched_view_label": "front"
    }
  ]
}
```

Review recent recognition sessions:

```bash
curl http://localhost:8000/api/v1/review/sessions
```

Update a detection review:

```bash
curl -X POST http://localhost:8000/api/v1/review/detections/1001 \
  -H "Content-Type: application/json" \
  -d '{
    "user_decision": "corrected_product",
    "confirmed_product_id": "CUP-001",
    "add_as_reference": false
  }'
```

Send a detection to the review queue without marking the session complete:

```bash
curl -X POST http://localhost:8000/api/v1/review/detections/1001 \
  -H "Content-Type: application/json" \
  -d '{"user_decision": "needs_review"}'
```

Add a missing product box to a recognition session. The API crops the box from the original image, runs embedding search for candidates, and stores a `manually_added` review row:

```bash
curl -X POST http://localhost:8000/api/v1/review/sessions/42/manual-detection \
  -H "Content-Type: application/json" \
  -d '{
    "corrected_box": [100, 120, 260, 310],
    "confirmed_product_id": "CUP-001"
  }'
```

Approve or reject a pending user-confirmed crop before it can affect production recognition:

```bash
curl http://localhost:8000/api/v1/product-embeddings/pending-review

curl -X POST http://localhost:8000/api/v1/product-embeddings/55/quality-status \
  -H "Content-Type: application/json" \
  -d '{"quality_status": "approved"}'
```

## Environment Variables

API service variables in `docker-compose.yml`:

- `DATABASE_URL`: SQLAlchemy connection string for PostgreSQL.
- `DETECTOR_RECOGNIZED_CONFIDENCE_THRESHOLD`: minimum YOLO confidence for a direct `recognized` result, default `0.60`.
- `DETECTOR_UNCERTAIN_CONFIDENCE_THRESHOLD`: minimum YOLO confidence before recognition is even considered, default `0.45`. Lower-confidence crops become `unknown`.
- `SIMILARITY_RECOGNIZED_THRESHOLD`: maximum top-1 cosine distance for a direct `recognized` result, default `0.15`.
- `SIMILARITY_UNKNOWN_THRESHOLD`: maximum top-1 cosine distance before a crop becomes `unknown`, default `0.22`.
- `SIMILARITY_MARGIN_THRESHOLD`: minimum gap between top-1 and top-2 cosine distance before a result is considered safely recognized, default `0.03`. Smaller gaps become `uncertain`.
- `TOP_K_CANDIDATES`: number of unique product candidates returned per detected crop, default `5`.
- `ENABLE_OCR`: optional crop OCR switch, default `false`. When OCR fails or dependencies are missing, image recognition still works.
- `OCR_ENGINE`: optional OCR backend name, default `easyocr`. Supported adapters are `easyocr`, `paddleocr`, and `tesseract` when installed in the runtime.
- `IMAGE_SIMILARITY_WEIGHT`: retained for configuration compatibility; image similarity is always the baseline score.
- `TEXT_MATCH_WEIGHT`: retained for configuration compatibility. OCR/text matching is treated as an optional positive signal, not a mandatory penalty.
- `CATEGORY_MATCH_WEIGHT`: retained for configuration compatibility.
- `OCR_MIN_MEANINGFUL_CHARS`: minimum normalized OCR characters before text matching is considered meaningful, default `3`.
- `TEXT_MATCH_RERANK_THRESHOLD`: minimum text match score before OCR can add a reranking bonus, default `0.60`.
- `TEXT_MATCH_BONUS_MAX`: maximum positive final-score bonus from OCR text matching, default `0.15`.
- `TEXT_CONFLICT_THRESHOLD`: text match score at or below this value marks a candidate as suspicious, default `0.15`.
- `CATEGORY_MATCH_BONUS_MAX`: maximum positive final-score bonus from category metadata, default `0.03`.
- `HIGH_CONFIDENCE_THRESHOLD`: minimum final score for `HIGH` confidence, default `0.85`.
- `MEDIUM_CONFIDENCE_THRESHOLD`: minimum final score for `MEDIUM` confidence, default `0.70`.
- `DETECTOR_BACKEND`: detector backend, default `yolov8`. Allowed values are `yolov8` and `yolo_world`.
- `FALLBACK_TO_YOLOV8`: when `true`, YOLO-World load/runtime failures fall back to the existing YOLOv8 detector.
- `YOLO_CONFIDENCE_THRESHOLD`: YOLO prediction confidence threshold, default `0.25`.
- `YOLO_IOU_THRESHOLD`: YOLO NMS IoU threshold, default `0.45`.
- `YOLO_MAX_DETECTIONS`: maximum YOLO detections per image, default `20`.
- `YOLO_MODEL_PATH`: YOLO model path, default `yolov8n.pt`.
- `YOLO_CLASSES`: comma-separated YOLO class IDs to detect. Use an empty value for the generic PoC so YOLO is not restricted to a few COCO classes.
- `YOLO_WORLD_MODEL`: YOLO-World model path or Ultralytics weight name, default `yolov8s-world.pt`.
- `YOLO_WORLD_PROMPTS`: comma-separated open-vocabulary prompts for YOLO-World.
- `YOLO_WORLD_CONFIDENCE`: YOLO-World confidence threshold, default `0.20`.
- `YOLO_WORLD_IOU`: YOLO-World NMS IoU threshold, default `0.50`.
- `YOLO_WORLD_MAX_DETECTIONS`: maximum raw YOLO-World detections per image, default `30`.
- `MIN_DETECTION_AREA_RATIO`: minimum detector box area relative to the full image, default `0.002`.
- `MAX_DETECTION_AREA_RATIO`: maximum detector box area relative to the full image unless confidence is very high, default `0.80`.
- `MAX_DETECTIONS_PER_IMAGE`: post-filter maximum detector boxes per image, default `30`.
- `CLIP_MODEL_NAME`: Hugging Face CLIP model name, default `openai/clip-vit-base-patch32`.
- `RECOGNITION_CANDIDATE_LIMIT`: backward-compatible alias for candidate count. Prefer `TOP_K_CANDIDATES`; Docker defaults both to `5`.
- `REVIEW_STORAGE_DIR`: directory for recognition session images and detection crops. Docker sets this to `/data/reviews`; local runs default to `review_data`.
- `YOLO_DATASET_DIR`: directory for saved human annotations and YOLO labels. Docker sets this to `/code/data/yolo_dataset`, mounted from local `./data`.
- `REGISTRATION_USE_DETECTOR_CROP`: when `false`, registration embeds the full uploaded reference image. Set to `true` only when the detector crop is trusted.
- `REGISTRATION_FALLBACK_TO_FULL_IMAGE`: when `true`, product registration embeds the full image if YOLO detects zero boxes.
- `MIN_CROP_DIMENSION_PX`: minimum crop width and height accepted for recognition, default `32`.
- `MIN_CROP_AREA_RATIO`: minimum crop area relative to full image before recognition is attempted, default `0.001`.
- `LOG_LEVEL`: Python logging level for the API, default `INFO`.

For this generic PoC, keep `DETECTOR_BACKEND=yolov8` and `YOLO_CLASSES=""`. In production, train or provide a one-class YOLO model for `product` detection, then calibrate detection thresholds around real warehouse images.

## Recognition Roadmap

- Phase 1: YOLO finds product-like regions, CLIP embeds each crop, and pgvector returns nearest product reference embeddings.
- Phase 2: every crop returns Top-K unique product candidates, optional OCR text, image/text/category scores, a final confidence level, and a short explanation. Human choices are logged through the review workflow so mistakes can be audited later.
- Phase 3 later: fine-tune or replace the embedding model using reviewed data. This repository does not fine-tune models yet.

OCR is disabled by default because offline OCR packages add runtime size and model downloads. Enable it only after installing the selected OCR engine in the API image or local environment. Product metadata matching currently uses available fields such as `product_id`, `name`, and reference `view_label`; future metadata such as brand, model, description, barcode, or category will be used automatically if those attributes are added.

OCR is intentionally a positive signal only. If OCR is disabled, fails, or returns no meaningful text, `final_score` falls back to `image_similarity_score`. If OCR finds text that matches product metadata, it can add a small configurable bonus and set `text_match_used_in_rerank=true`. If OCR text strongly conflicts with a candidate, the candidate is marked in `confidence_explanation` and its confidence level can be capped, but the image score is not aggressively penalized until real warehouse data justifies stricter rules.

## Custom Product Detector

The default `yolov8n.pt` model is only a placeholder trained on COCO classes. For multi-object warehouse scenes, train a custom one-class YOLO detector with class name `product`. This detector should only crop valid product regions; SKU identity remains CLIP embedding search against pgvector, not YOLO class prediction.

After training, copy the weights to `./models/best.pt`, set `YOLO_MODEL_PATH=/models/best.pt`, and restart with Docker Compose. The API service mounts `./models` to `/models`. See `docs/detector_training.md` for dataset layout, annotation rules, and training commands.

Recognition thresholds must be calibrated with real product photos. A direct `recognized` result now requires both detector confidence and visual similarity confidence. If wrong boxes are recognized as a known SKU, raise `DETECTOR_RECOGNIZED_CONFIDENCE_THRESHOLD`, lower `SIMILARITY_RECOGNIZED_THRESHOLD`, lower `SIMILARITY_UNKNOWN_THRESHOLD`, or raise `SIMILARITY_MARGIN_THRESHOLD`. If valid products are often missed, loosen these gradually while watching false positives.

## Optional YOLO-World Detector

The detector backend can be switched without changing the rest of the pipeline:

```bash
DETECTOR_BACKEND=yolov8
YOLO_MODEL_PATH=yolov8n.pt
```

YOLO-World can be used for open-vocabulary PoC detection and pseudo-labeling before enough warehouse data exists for a custom one-class detector:

```bash
DETECTOR_BACKEND=yolo_world
YOLO_WORLD_MODEL=yolov8s-world.pt
YOLO_WORLD_PROMPTS=product,industrial component,electrical component,small box,package,button switch,relay,connector,pneumatic fitting,plastic wrapped product
YOLO_WORLD_CONFIDENCE=0.20
FALLBACK_TO_YOLOV8=true
```

The app tries to call `set_classes()` with the configured prompts when the installed Ultralytics version supports it. If prompt setup fails, the API logs a warning and continues with model defaults if possible. If the YOLO-World model cannot load and `FALLBACK_TO_YOLOV8=true`, the current YOLOv8 detector is used instead.

YOLO-World may download weights automatically through Ultralytics when `YOLO_WORLD_MODEL=yolov8s-world.pt`. For offline deployment, place the model file under `./models`, set `YOLO_WORLD_MODEL=/models/<file>.pt`, and keep the existing Docker Compose model volume.

Available prompt presets in code:

- `general_product`: `product, package, box, small object`
- `industrial_parts`: `industrial component, electrical component, button switch, relay, connector, pneumatic fitting, terminal block`
- `plastic_wrapped`: `plastic wrapped product, bagged component, small packaged item`

Use `YOLO_WORLD_PROMPTS` to override all presets.

YOLO-World is not the long-term detector target. It is a bridge for open-vocabulary experiments and collecting better review data. The intended production path remains:

```text
custom YOLO 1-class product detector -> crop -> CLIP/OCR/vector search -> human confirmation
```

In `Cài đặt`, the Streamlit app has a detector debug section and a `Run both detectors` comparison tool. It runs YOLOv8 and YOLO-World on the same image and shows detection counts, boxes, class names, prompts, and fallback status without changing normal recognition results.

## Database Initialization

On FastAPI startup, `init_db()` creates:

- pgvector extension
- `products` table
- `product_embeddings` table
- `inventory_transactions` table
- `recognition_sessions` table
- `detection_reviews` table
- HNSW cosine index on `product_embeddings.embedding`

Index name:

```sql
product_embeddings_embedding_hnsw_idx
```

Older databases that still have a legacy `products.embedding` column are migrated conservatively by copying one `legacy` embedding per product into `product_embeddings` when that product has no reference embeddings yet.

## Reference Image Guidance

One product can have multiple reference images. For normal SKUs, start with 5-10 images per product from different angles and lighting conditions. For small industrial components, use 8-12 images per SKU because shape, surface finish, oil, shadows, and partial occlusion can change the CLIP embedding more than expected. The frontend batch uploader is intended to make collecting those 5-12 reference images practical during registration. When reference photos are already cropped tightly around one product, enable the full-image option so YOLO does not recrop them.

Recognition searches every stored reference embedding first, then aggregates matches back to unique products by keeping each product's smallest cosine distance. Multiple embeddings improve robustness across views, lighting, packaging states, and close-up model-code photos.

Reference embeddings have a `quality_status`. Recognition uses `approved` and `auto_approved` embeddings only. User-confirmed crops can be saved as `pending` references from Training or Operation Mode without immediately affecting production recognition.

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

When an Operation Mode user selects `Gửi sang Training Review`, the detection is saved as `needs_review`. It is excluded from inventory updates and keeps the session visible for Training Mode follow-up.

Each accept/correct/reject/unknown decision is also written as feedback metadata. The record includes session/review IDs, crop path, predicted and selected product IDs, Top-K candidates, image similarity scores, OCR text when available, text match scores, final scores, and timestamp. This is audit data only; it does not automatically retrain the model or update inventory.

## Progressive Learning Export

Reviewed detections can be exported later for one-class YOLO training:

```bash
docker compose exec api python scripts/export_yolo_dataset.py --output-dir datasets/yolo_product
```

The exporter groups reviews by recognition session: each original image is copied once, and every positive box in that image is written into one YOLO label file. Positive product labels are exported for decisions `accepted`, `corrected_product`, `box_adjusted`, and `manually_added`. Decisions such as `needs_review`, `not_product`, `unknown`, `rejected_detection`, and `ignored` are not exported as product labels.

The app also saves human-drawn missing boxes into a local YOLO dataset folder:

```text
data/yolo_dataset/
  images/train/
  images/val/
  labels/train/
  labels/val/
  metadata/
  pending_review/
```

Manual missing boxes are saved as class `0 = product` labels with normalized YOLO coordinates. Rejected detections and other non-positive corrections are saved as metadata only, so they can be reviewed as hard examples without polluting positive training labels. Docker Compose mounts `./data` into the API container, so these files persist on the host.

## Smoke Checks

Run lightweight import/route checks inside the API container:

```bash
docker compose exec api python smoke_tests.py
```

These checks do not run YOLO or CLIP inference.

## Known Limitations

- The default `yolov8n.pt` model is trained on COCO classes, not industrial inventory parts.
- Product registration embeds full images by default. If `REGISTRATION_USE_DETECTOR_CROP=true`, multiple detected boxes are rejected and zero boxes can fall back to full image.
- Recognition uses threshold-based unknown handling and does not update inventory quantities without user confirmation.
- Missing product boxes can be drawn on the source image in Streamlit, but full interactive editing/deleting of existing boxes is still a later improvement.
- Real accuracy depends on training a one-class product detector later and calibrating the similarity threshold with real images.
- Current recognition is visual-only: no OCR, no fine-tuning, and no custom YOLO model is included yet.
- Model weights are downloaded on first use unless already cached in the Docker volume.
- No auth, Qdrant, Kubernetes, model fine-tuning, or automatic stock mutation is included in this PoC.
