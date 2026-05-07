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
CREATE INDEX IF NOT EXISTS products_embedding_hnsw_idx
ON products
USING hnsw (embedding vector_cosine_ops)
"""


def init_db() -> None:
    from .models import Base

    with engine.begin() as connection:
        connection.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))

    Base.metadata.create_all(bind=engine)

    with engine.begin() as connection:
        connection.execute(text(HNSW_COSINE_INDEX_SQL))
