from app.api import app
from app.models import InventoryTransaction, ProductEmbedding


def test_required_routes_exist() -> None:
    route_paths = {route.path for route in app.routes}
    required_paths = {
        "/health",
        "/api/v1/products",
        "/api/v1/products/{product_id}/embeddings",
        "/api/v1/recognize",
        "/api/v1/recognize/candidates",
        "/api/v1/inventory/confirm",
    }

    missing_paths = required_paths - route_paths
    assert not missing_paths, f"Missing required routes: {sorted(missing_paths)}"


def test_product_embedding_model_exists() -> None:
    assert ProductEmbedding.__tablename__ == "product_embeddings"


def test_product_embedding_dimension() -> None:
    embedding_type = ProductEmbedding.__table__.c.embedding.type
    assert getattr(embedding_type, "dim", None) == 512


def test_inventory_transaction_model_exists() -> None:
    assert InventoryTransaction.__tablename__ == "inventory_transactions"


if __name__ == "__main__":
    test_required_routes_exist()
    test_product_embedding_model_exists()
    test_product_embedding_dimension()
    test_inventory_transaction_model_exists()
    print("Smoke checks passed")
