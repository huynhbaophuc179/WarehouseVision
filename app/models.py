from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import declarative_base, relationship
from pgvector.sqlalchemy import Vector

Base = declarative_base()


class Product(Base):
    __tablename__ = "products"

    product_id = Column(String(50), primary_key=True)
    name = Column(String(255), nullable=False)
    inventory_count = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )

    embeddings = relationship(
        "ProductEmbedding",
        back_populates="product",
        cascade="all, delete-orphan",
    )


class ProductEmbedding(Base):
    __tablename__ = "product_embeddings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(
        String(50),
        ForeignKey("products.product_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    embedding = Column(Vector(512), nullable=False)
    image_path = Column(String(1024), nullable=True)
    view_label = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    product = relationship("Product", back_populates="embeddings")


class InventoryTransaction(Base):
    __tablename__ = "inventory_transactions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(
        String(50),
        ForeignKey("products.product_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    quantity_delta = Column(Integer, nullable=False)
    action_type = Column(String(50), nullable=False)
    source = Column(String(100), nullable=False, default="human_confirmation")
    detection_id = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    product = relationship("Product")
