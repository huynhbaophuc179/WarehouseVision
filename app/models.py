from sqlalchemy import Column, Integer, String
from sqlalchemy.orm import declarative_base
from pgvector.sqlalchemy import Vector

Base = declarative_base()


class Product(Base):
    __tablename__ = "products"

    product_id = Column(String(50), primary_key=True)
    name = Column(String(255), nullable=False)
    inventory_count = Column(Integer, default=0)
    embedding = Column(Vector(512))
