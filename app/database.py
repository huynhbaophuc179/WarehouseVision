import os

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+psycopg2://postgres:postgres@localhost:5432/visual_inventory",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

HNSW_COSINE_INDEX_SQL = """
CREATE INDEX IF NOT EXISTS product_embeddings_embedding_hnsw_idx
ON product_embeddings
USING hnsw (embedding vector_cosine_ops)
"""

PRODUCT_TIMESTAMP_MIGRATION_SQL = """
ALTER TABLE products
ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE products
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
"""

PRODUCT_EMBEDDING_METADATA_MIGRATION_SQL = """
ALTER TABLE product_embeddings
ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'manual_upload';

ALTER TABLE product_embeddings
ADD COLUMN IF NOT EXISTS quality_status VARCHAR(50) NOT NULL DEFAULT 'approved';
"""

LEGACY_EMBEDDING_MIGRATION_SQL = """
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'products'
          AND column_name = 'embedding'
    ) THEN
        INSERT INTO product_embeddings (product_id, embedding, view_label)
        SELECT p.product_id, p.embedding, 'legacy'
        FROM products p
        WHERE p.embedding IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM product_embeddings pe
              WHERE pe.product_id = p.product_id
                AND pe.view_label = 'legacy'
          );

        DROP INDEX IF EXISTS products_embedding_hnsw_idx;
        ALTER TABLE products DROP COLUMN IF EXISTS embedding;
    END IF;
END $$;
"""


def init_db() -> None:
    from .models import Base

    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    Base.metadata.create_all(bind=engine)

    with engine.begin() as connection:
        connection.execute(text(PRODUCT_TIMESTAMP_MIGRATION_SQL))
        connection.execute(text(PRODUCT_EMBEDDING_METADATA_MIGRATION_SQL))
        connection.execute(text(LEGACY_EMBEDDING_MIGRATION_SQL))
        connection.execute(text(HNSW_COSINE_INDEX_SQL))
