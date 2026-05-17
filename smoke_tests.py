from pathlib import Path

from app.api import (
    CandidateResponse,
    ENABLE_OCR,
    HIGH_CONFIDENCE_THRESHOLD,
    IMAGE_SIMILARITY_WEIGHT,
    ManualDetectionRequest,
    MEDIUM_CONFIDENCE_THRESHOLD,
    MultiRecognizeResponse,
    REVIEW_DECISIONS,
    TEXT_MATCH_WEIGHT,
    TOP_K_CANDIDATES,
    app,
    convert_box_to_yolo,
    convert_display_box_to_original,
)
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


def test_custom_box_canvas_component_exists() -> None:
    component_path = Path("frontend/box_canvas_component/index.html")
    if not component_path.exists():
        return

    with component_path.open(encoding="utf-8") as component:
        content = component.read()
    assert "Streamlit.setComponentValue" in content
    assert "selection_id" in content
    assert "displayed_box" in content
    assert "image_mime_type" in content
    assert "existing_boxes" in content


def test_drawable_canvas_dependency_removed() -> None:
    with open("requirements.txt", encoding="utf-8") as requirements:
        content = requirements.read()
    assert "streamlit-drawable-canvas" not in content


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
        "/api/v1/yolo-dataset/summary",
        "/api/v1/yolo-dataset/export-yaml",
        "/api/v1/product-embeddings/pending-review",
        "/api/v1/product-embeddings/{embedding_id}/quality-status",
    }

    missing_paths = required_paths - route_paths
    assert not missing_paths, f"Missing required routes: {sorted(missing_paths)}"


def test_product_list_route_exists() -> None:
    matching_routes = [
        route
        for route in app.routes
        if route.path == "/api/v1/products" and "GET" in getattr(route, "methods", set())
    ]
    assert matching_routes, "Missing GET /api/v1/products route"


def test_manual_detection_accepts_external_product_id() -> None:
    if hasattr(ManualDetectionRequest, "model_fields"):
        fields = ManualDetectionRequest.model_fields
    else:
        fields = ManualDetectionRequest.__fields__
    assert "external_product_id" in fields


def test_missing_box_ui_hides_yolo_copy() -> None:
    main_path = Path("frontend/main.py")
    if not main_path.exists():
        return

    content = main_path.read_text(encoding="utf-8")
    assert "YOLO label" not in content
    assert "YOLO training data" not in content


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
        "raw_ocr_text",
        "normalized_ocr_text",
        "image_similarity_score",
        "text_match_score",
        "category_match_score",
        "final_score",
        "confidence_level",
        "explanation",
    }
    missing_fields = required_fields - set(fields)
    assert not missing_fields, f"Missing response fields: {sorted(missing_fields)}"


def test_candidate_phase2_fields_exist() -> None:
    if hasattr(CandidateResponse, "model_fields"):
        fields = CandidateResponse.model_fields
    else:
        fields = CandidateResponse.__fields__
    required_fields = {
        "product_code",
        "product_name",
        "image_similarity_score",
        "text_match_score",
        "category_match_score",
        "final_score",
        "reference_image_path",
        "confidence_level",
        "explanation",
    }
    missing_fields = required_fields - set(fields)
    assert not missing_fields, f"Missing candidate fields: {sorted(missing_fields)}"


def test_phase2_config_defaults_are_safe() -> None:
    assert TOP_K_CANDIDATES == 5
    assert ENABLE_OCR is False
    assert 0.0 <= IMAGE_SIMILARITY_WEIGHT <= 1.0
    assert 0.0 <= TEXT_MATCH_WEIGHT <= 1.0
    assert HIGH_CONFIDENCE_THRESHOLD >= MEDIUM_CONFIDENCE_THRESHOLD


def test_recognize_route_accepts_top_k_form_field() -> None:
    route = next(route for route in app.routes if route.path == "/api/v1/recognize")
    body_param_names = {param.name for param in route.dependant.body_params}
    assert "top_k" in body_param_names


def test_review_session_response_image_size_fields_exist() -> None:
    from app.api import RecognitionSessionDetail

    if hasattr(RecognitionSessionDetail, "model_fields"):
        fields = RecognitionSessionDetail.model_fields
    else:
        fields = RecognitionSessionDetail.__fields__
    required_fields = {
        "original_image_width",
        "original_image_height",
        "original_image_mime_type",
        "preview_image_width",
        "preview_image_height",
        "preview_image_mime_type",
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


def test_yolo_box_conversion() -> None:
    x_center, y_center, width, height = convert_box_to_yolo(
        [10.0, 20.0, 50.0, 80.0],
        100,
        100,
    )
    assert round(x_center, 3) == 0.3
    assert round(y_center, 3) == 0.5
    assert round(width, 3) == 0.4
    assert round(height, 3) == 0.6


def test_canvas_box_converts_to_original_coordinates() -> None:
    assert convert_display_box_to_original(
        [90.0, 60.0, 180.0, 120.0],
        display_width=900,
        display_height=600,
        original_width=3000,
        original_height=2000,
    ) == [300.0, 200.0, 600.0, 400.0]


if __name__ == "__main__":
    test_custom_box_canvas_component_exists()
    test_drawable_canvas_dependency_removed()
    test_required_routes_exist()
    test_product_list_route_exists()
    test_manual_detection_accepts_external_product_id()
    test_missing_box_ui_hides_yolo_copy()
    test_product_embedding_model_exists()
    test_product_embedding_dimension()
    test_product_embedding_review_metadata_exists()
    test_inventory_transaction_model_exists()
    test_review_models_exist()
    test_detection_review_feedback_fields_exist()
    test_detection_review_model_can_be_created()
    test_needs_review_decision_exists_but_is_not_exported_positive()
    test_recognize_response_debug_fields_exist()
    test_candidate_phase2_fields_exist()
    test_phase2_config_defaults_are_safe()
    test_recognize_route_accepts_top_k_form_field()
    test_review_session_response_image_size_fields_exist()
    test_embedding_route_accepts_full_image_option()
    test_yolo_prediction_defaults_exist()
    test_yolo_box_conversion()
    test_canvas_box_converts_to_original_coordinates()
    print("Smoke checks passed")
