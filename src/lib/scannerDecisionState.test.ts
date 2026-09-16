import assert from "node:assert/strict";
import test from "node:test";
import { deriveScannerDecisionState } from "./scannerDecisionState.ts";
import type { CandidateResponse, DetectionDecisionState, DetectionResult } from "../types/api.ts";

const candidate = (productId: string, score = 0.8): CandidateResponse => ({
  product_id: productId,
  name: `Sản phẩm ${productId}`,
  inventory_count: 10,
  distance: 1 - score,
  matched_embedding_id: 1,
  matched_view_label: null,
  final_score: score,
});

const detection = (
  id: string,
  productId: string | null,
  status: DetectionResult["status"],
  score = 0.8,
): DetectionResult => ({
  detection_id: id,
  box: [0, 0, 100, 100],
  product_id: productId,
  name: productId ? `Sản phẩm ${productId}` : null,
  inventory_count: productId ? 10 : null,
  distance: 1 - score,
  status,
  final_score: score,
  candidates: productId ? [candidate(productId, score)] : [],
});

const decision = (
  productId: string,
  value: DetectionDecisionState["decision"] = "accepted",
): DetectionDecisionState => ({ decision: value, selectedProductId: productId, quantity: 1 });

const derive = (
  overrides: Partial<Parameters<typeof deriveScannerDecisionState>[0]> = {},
) =>
  deriveScannerDecisionState({
    detections: [],
    decisions: {},
    quantities: {},
    recognitionAttempted: false,
    isProcessing: false,
    committed: false,
    ...overrides,
  });

test("chưa chụp giữ quyền nhận phím ở cửa sổ", () => {
  assert.deepEqual(derive(), { kind: "idle", focusOwner: "window" });
});

test("đang xử lý không chuyển focus", () => {
  assert.deepEqual(derive({ isProcessing: true }), { kind: "processing", focusOwner: "none" });
});

test("một nhóm rõ ràng dùng ô số lượng và kiểm tra số lượng", () => {
  const item = detection("det_1", "SKU_01", "recognized");
  const state = derive({
    detections: [item],
    decisions: { det_1: decision("SKU_01") },
    quantities: { SKU_01: "4" },
    recognitionAttempted: true,
  });

  assert.equal(state.kind, "singleGroup");
  if (state.kind === "singleGroup") {
    assert.equal(state.group.productId, "SKU_01");
    assert.equal(state.quantity, "4");
    assert.equal(state.quantityValid, true);
    assert.equal(state.focusOwner, "quantity");
  }
});

test("nhiều vùng mơ hồ cùng mã tạo một gợi ý và chọn vùng có điểm cao nhất", () => {
  const first = { ...detection("det_1", null, "uncertain", 0.7), candidates: [candidate("SKU_01", 0.7)] };
  const second = { ...detection("det_2", null, "uncertain", 0.9), candidates: [candidate("SKU_01", 0.9)] };
  const state = derive({
    detections: [first, second],
    decisions: {
      det_1: decision("SKU_01", "unknown"),
      det_2: decision("SKU_01", "unknown"),
    },
    recognitionAttempted: true,
  });

  assert.equal(state.kind, "singleSuggestion");
  if (state.kind === "singleSuggestion") {
    assert.equal(state.suggestion.productId, "SKU_01");
    assert.equal(state.suggestion.representativeDetection.detection_id, "det_2");
    assert.equal(state.focusOwner, "suggestion");
  }
});

test("không có kết quả yêu cầu chụp lại nhưng giữ Enter cho cửa sổ", () => {
  assert.deepEqual(derive({ recognitionAttempted: true }), {
    kind: "retakeRequired",
    focusOwner: "window",
    reason: "noResult",
  });
});

test("nhiều nhóm sản phẩm yêu cầu chụp lại", () => {
  const first = detection("det_1", "SKU_01", "recognized");
  const second = detection("det_2", "SKU_02", "recognized");
  const state = derive({
    detections: [first, second],
    decisions: { det_1: decision("SKU_01"), det_2: decision("SKU_02") },
    recognitionAttempted: true,
  });

  assert.equal(state.kind, "retakeRequired");
  if (state.kind === "retakeRequired") {
    assert.equal(state.reason, "multipleProducts");
  }
});

test("nhiều gợi ý khác mã yêu cầu chụp lại", () => {
  const first = { ...detection("det_1", null, "uncertain"), candidates: [candidate("SKU_01")] };
  const second = { ...detection("det_2", null, "uncertain"), candidates: [candidate("SKU_02")] };
  const state = derive({
    detections: [first, second],
    decisions: {
      det_1: decision("SKU_01", "unknown"),
      det_2: decision("SKU_02", "unknown"),
    },
    recognitionAttempted: true,
  });

  assert.equal(state.kind, "retakeRequired");
  if (state.kind === "retakeRequired") {
    assert.equal(state.reason, "multipleSuggestions");
  }
});

test("đã ghi kho có ưu tiên cao nhất và không chuyển focus", () => {
  assert.deepEqual(derive({ committed: true, isProcessing: true }), {
    kind: "committed",
    focusOwner: "none",
    product: null,
  });
});
