# AGENTS.md — AI Visual Inventory Project

## Project context

This repository is a self-hosted AI Visual Inventory PoC.

The system should:
- Register products from uploaded product images.
- Generate image embeddings.
- Store product metadata, inventory count, and image embedding in PostgreSQL + pgvector.
- Recognize one or multiple products from an uploaded/camera image.
- Return product_id, product name, inventory_count, bounding box, distance score, and recognition status.
- Avoid retraining when adding new products.

Current architecture:
- API: FastAPI
- AI pipeline: YOLO + CLIP
- Database: PostgreSQL + pgvector
- Frontend PoC: Streamlit
- Deployment: Docker Compose

## Current codebase facts

Important existing files:
- `app/ai_pipeline.py`: loads YOLO and CLIP, detects product boxes, crops images, generates normalized 512-dim embeddings.
- `app/api.py`: exposes product registration and recognition APIs.
- `app/database.py`: creates the pgvector extension and SQLAlchemy session.
- `app/models.py`: defines `Product(product_id, name, inventory_count, embedding)`.
- `frontend/main.py`: Streamlit UI for product registration and recognition.
- `docker-compose.yml`: starts db, api, and frontend services.

Do not rewrite the whole system from scratch unless absolutely necessary.

## Main technical goals

### Goal 1 — Make the current project run reliably with Docker Compose

The command below should work from the repository root:

```bash
docker compose up --build