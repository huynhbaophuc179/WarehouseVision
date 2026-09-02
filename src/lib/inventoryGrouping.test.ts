import assert from "node:assert/strict";
import test from "node:test";
import { buildGroupedInventoryPayload, groupInventoryDetections } from "./inventoryGrouping.ts";
import type { CandidateResponse, DetectionDecisionState, DetectionResult } from "../types/api.ts";

const candidate = (productId: string, score: number): CandidateResponse => ({
  product_id: productId,
  product_code: productId,
  product_name: productId,
  name: productId,
  inventory_count: 10,
  distance: 1 - score,
  matched_embedding_id: 1,
  matched_view_label: null,
  final_score: score,
});

const detection = (
  detectionId: string,
  productId: string | null,
  score: number,
  candidates: CandidateResponse[],
): DetectionResult => ({
  detection_id: detectionId,
  box: [0, 0, 100, 100],
  product_id: productId,
  name: productId,
  inventory_count: 10,
  distance: 1 - score,
  status: productId ? "recognized" : "uncertain",
  final_score: score,
  candidates,
});

const acceptedDecision = (productId: string): DetectionDecisionState => ({
  decision: "accepted",
  selectedProductId: productId,
  quantity: 1,
});

test("gộp nhiều vùng cùng SKU thành một dòng và chọn crop có điểm cao nhất", () => {
  const detections = [
    detection("det_1", "SKU_01", 0.81, [candidate("SKU_01", 0.81)]),
    detection("det_2", "SKU_01", 0.92, [candidate("SKU_01", 0.92)]),
  ];
  const decisions = {
    det_1: acceptedDecision("SKU_01"),
    det_2: acceptedDecision("SKU_01"),
  };

  const result = groupInventoryDetections(detections, decisions);

  assert.equal(result.groups.length, 1);
  assert.deepEqual(result.groups[0]?.detectionIds, ["det_1", "det_2"]);
  assert.equal(result.groups[0]?.representativeDetection.detection_id, "det_2");
});

test("candidate được chọn sẽ gộp vào SKU đang có", () => {
  const detections = [
    detection("det_1", "SKU_01", 0.84, [candidate("SKU_01", 0.84)]),
    detection("det_2", null, 0.78, [candidate("SKU_01", 0.78), candidate("SKU_02", 0.71)]),
  ];
  const decisions: Record<string, DetectionDecisionState> = {
    det_1: acceptedDecision("SKU_01"),
    det_2: { decision: "corrected", selectedProductId: "SKU_01", quantity: 1 },
  };

  const result = groupInventoryDetections(detections, decisions);

  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]?.detectionIds.length, 2);
  assert.equal(result.unresolved.length, 0);
});

test("payload tồn kho chỉ có một item cho mỗi SKU", () => {
  const detections = [
    detection("det_1", "SKU_01", 0.81, [candidate("SKU_01", 0.81)]),
    detection("det_2", "SKU_01", 0.92, [candidate("SKU_01", 0.92)]),
    detection("det_3", "SKU_02", 0.88, [candidate("SKU_02", 0.88)]),
  ];
  const decisions = {
    det_1: acceptedDecision("SKU_01"),
    det_2: acceptedDecision("SKU_01"),
    det_3: acceptedDecision("SKU_02"),
  };

  const payload = buildGroupedInventoryPayload(
    detections,
    decisions,
    { SKU_01: "7", SKU_02: "3" },
    "stock_in",
  );

  assert.deepEqual(
    payload.confirmed_items.map((item) => [item.product_id, item.quantity]),
    [["SKU_01", 7], ["SKU_02", 3]],
  );
});

test("bỏ qua vẫn giữ nhóm để có thể khôi phục", () => {
  const detections = [detection("det_1", "SKU_01", 0.9, [candidate("SKU_01", 0.9)])];
  const decisions: Record<string, DetectionDecisionState> = {
    det_1: { decision: "rejected", selectedProductId: "SKU_01", quantity: 1 },
  };

  const result = groupInventoryDetections(detections, decisions);

  assert.equal(result.groups.length, 1);
  assert.equal(result.groups[0]?.skipped, true);
});
