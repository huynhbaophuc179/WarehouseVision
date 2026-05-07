from app.api import app
from app.models import Product


def test_required_routes_exist() -> None:
    route_paths = {route.path for route in app.routes}
    required_paths = {
        "/health",
        "/api/v1/products",
        "/api/v1/recognize",
        "/api/v1/recognize/candidates",
    }

    missing_paths = required_paths - route_paths
    assert not missing_paths, f"Missing required routes: {sorted(missing_paths)}"


def test_product_embedding_dimension() -> None:
    embedding_type = Product.__table__.c.embedding.type
    assert getattr(embedding_type, "dim", None) == 512


if __name__ == "__main__":
    test_required_routes_exist()
    test_product_embedding_dimension()
    print("Smoke checks passed")
