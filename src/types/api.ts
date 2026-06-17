export type RecognitionStatus = "recognized" | "uncertain" | "unknown";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type InventoryAction = "stock_in" | "stock_out" | "count" | "adjustment";

export type DetectionDecision = "accepted" | "rejected" | "unknown" | "review" | "corrected";

export interface Product {
  product_id: string;
  name: string;
  inventory_count: number;
  embedding_count?: number;
  approved_embedding_count?: number;
  pending_embedding_count?: number;
  reference_image_count?: number;
  thumbnail_base64?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface ProductEmbedding {
  id: number;
  product_id: string;
  view_label: string | null;
  image_path: string | null;
  source: string;
  quality_status: string;
  created_at?: string | null;
  image_preview_base64?: string | null;
}

export interface ProductDetail extends Product {
  embeddings: ProductEmbedding[];
}

export interface ProductDeleteResponse {
  product_id: string;
  deleted_embeddings: number;
  deleted_inventory_transactions: number;
  cleared_review_product_links: number;
  cleared_review_embedding_links: number;
}

export interface DetectionReviewResponse {
  id: number;
  session_id: number;
  detection_index: number;
  original_box: number[];
  corrected_box: number[] | null;
  crop_path: string | null;
  crop_preview_base64: string | null;
  predicted_product_id: string | null;
  confirmed_product_id: string | null;
  user_decision: string;
  detector_confidence: number | null;
  top1_distance: number | null;
  top2_distance: number | null;
  distance_margin: number | null;
  matched_embedding_id: number | null;
  matched_view_label: string | null;
  candidates: CandidateResponse[];
  yolo_annotation: Record<string, unknown> | null;
  created_at: string;
}

export interface RecognitionSessionSummary {
  id: number;
  original_image_path: string;
  status: string;
  mode: string;
  model_version: string | null;
  created_at: string;
  detection_count?: number;
  reviewed_count?: number;
  pending_count?: number;
}

export interface RecognitionSessionDetail extends RecognitionSessionSummary {
  original_image_base64: string | null;
  original_image_width: number | null;
  original_image_height: number | null;
  original_image_mime_type: string | null;
  preview_image_width: number | null;
  preview_image_height: number | null;
  preview_image_mime_type: string | null;
  detections: DetectionReviewResponse[];
}

export interface ManualDetectionRequest {
  corrected_box: number[];
  confirmed_product_id?: string | null;
  external_product_id?: string | null;
  user_decision: "manually_added";
  displayed_box: number[];
  display_size: number[];
  source: "human_missing_box";
}

export interface ReviewDetectionDeleteResponse {
  deleted: boolean;
  review_id: number;
  removed_artifacts: Record<string, unknown>;
}

export interface DetectionReviewUpdateRequest {
  user_decision: string;
  confirmed_product_id?: string | null;
  corrected_box?: number[] | null;
  add_as_reference?: boolean;
  reference_quality_status?: string;
  use_for_yolo_training?: boolean;
}

export interface RecognitionSessionDeleteResponse {
  deleted: boolean;
  session_id: number;
  detections_removed: number;
  artifacts_removed: Record<string, unknown>;
}

export interface CandidateResponse extends Product {
  distance: number | null;
  matched_embedding_id: number | null;
  matched_view_label: string | null;
  product_code?: string | null;
  product_name?: string | null;
  image_similarity_score?: number | null;
  text_match_score?: number | null;
  category_match_score?: number | null;
  ocr_text_found?: boolean;
  text_match_used_in_rerank?: boolean;
  final_score?: number | null;
  reference_image_path?: string | null;
  confidence_level?: ConfidenceLevel | null;
  confidence_explanation?: string[];
  explanation?: string[];
}

export interface DetectionResult {
  session_id?: number | null;
  review_id?: number | null;
  detection_id: string;
  box: number[];
  crop_preview_base64?: string | null;
  detector_confidence?: number | null;
  detector_backend?: string | null;
  detector_model?: string | null;
  detector_prompt?: string | null;
  detector_class_id?: number | null;
  detector_class_name?: string | null;
  product_id: string | null;
  name: string | null;
  inventory_count: number | null;
  distance: number | null;
  status: RecognitionStatus;
  matched_embedding_id?: number | null;
  matched_view_label?: string | null;
  top1_distance?: number | null;
  top2_distance?: number | null;
  distance_margin?: number | null;
  raw_ocr_text?: string | null;
  normalized_ocr_text?: string | null;
  image_similarity_score?: number | null;
  text_match_score?: number | null;
  category_match_score?: number | null;
  ocr_text_found?: boolean;
  text_match_used_in_rerank?: boolean;
  final_score?: number | null;
  confidence_level?: ConfidenceLevel | null;
  confidence_explanation?: string[];
  explanation?: string[];
  candidates: CandidateResponse[];
}

export interface ConfirmedInventoryItem {
  detection_id: string;
  product_id: string;
  quantity: number;
  action: InventoryAction;
}

export interface RejectedInventoryItem {
  detection_id: string;
  reason: string;
}

export interface InventoryConfirmRequest {
  confirmed_items: ConfirmedInventoryItem[];
  rejected_items: RejectedInventoryItem[];
}

export interface InventoryConfirmResponse {
  confirmed_items: Record<string, unknown>[];
  rejected_items: Record<string, unknown>[];
}

export interface ScannerSettings {
  apiBaseUrl: string;
  confidenceThreshold: number;
  iouThreshold: number;
  modelName: string;
  topK: number;
}

export interface DetectionDecisionState {
  decision: DetectionDecision;
  selectedProductId: string | null;
  quantity: number;
}
