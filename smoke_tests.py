from app.api import MultiRecognizeResponse, app
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


def test_recognize_response_debug_fields_exist() -> None:
    if hasattr(MultiRecognizeResponse, "model_fields"):
        fields = MultiRecognizeResponse.model_fields
    else:
        fields = MultiRecognizeResponse.__fields__
    required_fields = {
        "crop_preview_base64",
        "detector_confidence",
        "top1_distance",
        "top2_distance",
        "distance_margin",
    }
    missing_fields = required_fields - set(fields)
    assert not missing_fields, f"Missing response fields: {sorted(missing_fields)}"


if __name__ == "__main__":
    test_required_routes_exist()
    test_product_embedding_model_exists()
    test_product_embedding_dimension()
    test_inventory_transaction_model_exists()
    test_recognize_response_debug_fields_exist()
    print("Smoke checks passed")
