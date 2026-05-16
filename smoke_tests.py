from app.api import MultiRecognizeResponse, REVIEW_DECISIONS, app
from app.ai_pipeline import (
    YOLO_CONFIDENCE_THRESHOLD,
    YOLO_IOU_THRESHOLD,
    YOLO_MAX_DETECTIONS,
)
from app.models import (
    DetectionReview,
    InventoryTransaction,
    ProductEmbedding,
    RecognitionSession,
)
from scripts.export_yolo_dataset import POSITIVE_DECISIONS


def test_drawable_canvas_dependency_declared() -> None:
    with open("requirements.txt", encoding="utf-8") as requirements:
        content = requirements.read()
    assert "streamlit-drawable-canvas" in content


def test_required_routes_exist() -> None:
    route_paths = {route.path for route in app.routes}
    required_paths = {
        "/health",
        "/api/v1/products",
        "/api/v1/products/{product_id}/embeddings",
        "/api/v1/recognize",
        "/api/v1/recognize/candidates",
        "/api/v1/inventory/confirm",
        "/api/v1/review/sessions",
        "/api/v1/review/sessions/{session_id}",
        "/api/v1/review/detections/{review_id}",
        "/api/v1/review/sessions/{session_id}/manual-detection",
        "/api/v1/product-embeddings/pending-review",
        "/api/v1/product-embeddings/{embedding_id}/quality-status",
    }

    missing_paths = required_paths - route_paths
    assert not missing_paths, f"Missing required routes: {sorted(missing_paths)}"


def test_product_embedding_model_exists() -> None:
    assert ProductEmbedding.__tablename__ == "product_embeddings"


def test_product_embedding_dimension() -> None:
    embedding_type = ProductEmbedding.__table__.c.embedding.type
    assert getattr(embedding_type, "dim", None) == 512


def test_product_embedding_review_metadata_exists() -> None:
    columns = ProductEmbedding.__table__.c
    assert "source" in columns
    assert "quality_status" in columns


def test_inventory_transaction_model_exists() -> None:
    assert InventoryTransaction.__tablename__ == "inventory_transactions"


def test_review_models_exist() -> None:
    assert RecognitionSession.__tablename__ == "recognition_sessions"
    assert DetectionReview.__tablename__ == "detection_reviews"


def test_detection_review_feedback_fields_exist() -> None:
    columns = DetectionReview.__table__.c
    required_columns = {
        "session_id",
        "detection_index",
        "crop_path",
        "predicted_product_id",
        "confirmed_product_id",
        "user_decision",
        "matched_embedding_id",
        "candidates_json",
    }
    missing_columns = required_columns - set(columns.keys())
    assert not missing_columns, f"Missing detection review columns: {sorted(missing_columns)}"


def test_detection_review_model_can_be_created() -> None:
    review = DetectionReview(
        session_id=1,
        detection_index=1,
        original_box_x1=0.0,
        original_box_y1=0.0,
        original_box_x2=100.0,
        original_box_y2=100.0,
        user_decision="needs_review",
    )
    assert review.user_decision == "needs_review"


def test_needs_review_decision_exists_but_is_not_exported_positive() -> None:
    assert "needs_review" in REVIEW_DECISIONS
    assert "needs_review" not in POSITIVE_DECISIONS


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
        "session_id",
        "review_id",
    }
    missing_fields = required_fields - set(fields)
    assert not missing_fields, f"Missing response fields: {sorted(missing_fields)}"


def test_embedding_route_accepts_full_image_option() -> None:
    route = next(
        route
        for route in app.routes
        if route.path == "/api/v1/products/{product_id}/embeddings"
    )
    body_param_names = {param.name for param in route.dependant.body_params}
    assert "use_full_image" in body_param_names


def test_yolo_prediction_defaults_exist() -> None:
    assert 0.0 <= YOLO_CONFIDENCE_THRESHOLD <= 1.0
    assert 0.0 <= YOLO_IOU_THRESHOLD <= 1.0
    assert YOLO_MAX_DETECTIONS >= 1


if __name__ == "__main__":
    test_drawable_canvas_dependency_declared()
    test_required_routes_exist()
    test_product_embedding_model_exists()
    test_product_embedding_dimension()
    test_product_embedding_review_metadata_exists()
    test_inventory_transaction_model_exists()
    test_review_models_exist()
    test_detection_review_feedback_fields_exist()
    test_detection_review_model_can_be_created()
    test_needs_review_decision_exists_but_is_not_exported_positive()
    test_recognize_response_debug_fields_exist()
    test_embedding_route_accepts_full_image_option()
    test_yolo_prediction_defaults_exist()
    print("Smoke checks passed")
