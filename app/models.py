from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import declarative_base, relationship
from pgvector.sqlalchemy import Vector

Base = declarative_base()


class ProductCategory(Base):
    __tablename__ = "product_categories"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(255), nullable=False, unique=True, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Product(Base):
    __tablename__ = "products"

    product_id = Column(String(50), primary_key=True)
    name = Column(String(255), nullable=False)
    category = Column(String(255), nullable=True, index=True)
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
    source = Column(String(50), nullable=False, default="manual_upload")
    quality_status = Column(String(50), nullable=False, default="approved")
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
    source = Column(String(50), nullable=False, default="user_confirmed")
    detection_id = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    product = relationship("Product")


class RecognitionSession(Base):
    __tablename__ = "recognition_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    original_image_path = Column(String(1024), nullable=False)
    status = Column(String(50), nullable=False, default="open")
    mode = Column(String(50), nullable=False, default="operation")
    model_version = Column(String(100), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    detections = relationship(
        "DetectionReview",
        back_populates="session",
        cascade="all, delete-orphan",
    )


class DetectionReview(Base):
    __tablename__ = "detection_reviews"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_id = Column(
        Integer,
        ForeignKey("recognition_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    detection_index = Column(Integer, nullable=False)
    original_box_x1 = Column(Float, nullable=False)
    original_box_y1 = Column(Float, nullable=False)
    original_box_x2 = Column(Float, nullable=False)
    original_box_y2 = Column(Float, nullable=False)
    corrected_box_x1 = Column(Float, nullable=True)
    corrected_box_y1 = Column(Float, nullable=True)
    corrected_box_x2 = Column(Float, nullable=True)
    corrected_box_y2 = Column(Float, nullable=True)
    crop_path = Column(String(1024), nullable=True)
    predicted_product_id = Column(
        String(50),
        ForeignKey("products.product_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    confirmed_product_id = Column(
        String(50),
        ForeignKey("products.product_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_decision = Column(String(50), nullable=False, default="ignored")
    detector_confidence = Column(Float, nullable=True)
    top1_distance = Column(Float, nullable=True)
    top2_distance = Column(Float, nullable=True)
    distance_margin = Column(Float, nullable=True)
    matched_embedding_id = Column(
        Integer,
        ForeignKey("product_embeddings.id", ondelete="SET NULL"),
        nullable=True,
    )
    matched_view_label = Column(String(100), nullable=True)
    candidates_json = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    session = relationship("RecognitionSession", back_populates="detections")
    predicted_product = relationship("Product", foreign_keys=[predicted_product_id])
    confirmed_product = relationship("Product", foreign_keys=[confirmed_product_id])
    matched_embedding = relationship("ProductEmbedding")
