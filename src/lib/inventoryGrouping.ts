import type {
  CandidateResponse,
  DetectionDecisionState,
  DetectionResult,
  InventoryAction,
  InventoryConfirmRequest,
} from "../types/api";

export interface InventoryProductGroup {
  productId: string;
  name: string;
  inventoryCount: number | null;
  representativeDetection: DetectionResult;
  detectionIds: string[];
  skipped: boolean;
  score: number;
}

export interface UnresolvedInventoryDetection {
  detection: DetectionResult;
  state: DetectionDecisionState;
  skipped: boolean;
}

export interface InventoryGroupingResult {
  groups: InventoryProductGroup[];
  unresolved: UnresolvedInventoryDetection[];
}

const matchingCandidate = (
  detection: DetectionResult,
  productId: string,
): CandidateResponse | null =>
  detection.candidates.find((candidate) => candidate.product_id === productId) ?? null;

const scoreForProduct = (detection: DetectionResult, productId: string): number => {
  const candidate = matchingCandidate(detection, productId);
  return (
    candidate?.final_score ??
    candidate?.image_similarity_score ??
    detection.final_score ??
    detection.image_similarity_score ??
    0
  );
};

const productName = (detection: DetectionResult, productId: string): string => {
  const candidate = matchingCandidate(detection, productId);
  if (detection.product_id === productId && detection.name) {
    return detection.name;
  }
  return candidate?.name ?? candidate?.product_name ?? productId;
};

const productInventory = (detection: DetectionResult, productId: string): number | null => {
  const candidate = matchingCandidate(detection, productId);
  if (detection.product_id === productId && detection.inventory_count !== null) {
    return detection.inventory_count;
  }
  return candidate?.inventory_count ?? null;
};

const fallbackDecision = (detection: DetectionResult): DetectionDecisionState => ({
  decision: "unknown",
  selectedProductId: detection.product_id ?? detection.candidates[0]?.product_id ?? null,
  quantity: 1,
});

export const groupInventoryDetections = (
  detections: DetectionResult[],
  decisions: Record<string, DetectionDecisionState>,
): InventoryGroupingResult => {
  const grouped = new Map<
    string,
    InventoryProductGroup & { activeDetectionCount: number }
  >();
  const unresolved: UnresolvedInventoryDetection[] = [];

  detections.forEach((detection) => {
    const state = decisions[detection.detection_id] ?? fallbackDecision(detection);
    const canGroup =
      Boolean(state.selectedProductId) &&
      (state.decision === "accepted" || state.decision === "corrected" || state.decision === "rejected");

    if (!canGroup || !state.selectedProductId) {
      unresolved.push({
        detection,
        state,
        skipped: state.decision === "rejected",
      });
      return;
    }

    const productId = state.selectedProductId;
    const score = scoreForProduct(detection, productId);
    const existing = grouped.get(productId);
    const isActive = state.decision === "accepted" || state.decision === "corrected";

    if (!existing) {
      grouped.set(productId, {
        productId,
        name: productName(detection, productId),
        inventoryCount: productInventory(detection, productId),
        representativeDetection: detection,
        detectionIds: [detection.detection_id],
        skipped: !isActive,
        score,
        activeDetectionCount: isActive ? 1 : 0,
      });
      return;
    }

    existing.detectionIds.push(detection.detection_id);
    const hadActiveDetection = existing.activeDetectionCount > 0;
    if (isActive) {
      existing.activeDetectionCount += 1;
      existing.skipped = false;
    }
    const shouldReplaceRepresentative = isActive
      ? !hadActiveDetection || score > existing.score
      : !hadActiveDetection && score > existing.score;
    if (shouldReplaceRepresentative) {
      existing.score = score;
      existing.representativeDetection = detection;
      existing.name = productName(detection, productId);
      existing.inventoryCount = productInventory(detection, productId);
    }
  });

  const groups = Array.from(grouped.values())
    .map(({ activeDetectionCount: _activeDetectionCount, ...group }) => group)
    .sort((first, second) => Number(first.skipped) - Number(second.skipped) || first.productId.localeCompare(second.productId));

  return { groups, unresolved };
};

export const buildGroupedInventoryPayload = (
  detections: DetectionResult[],
  decisions: Record<string, DetectionDecisionState>,
  quantities: Record<string, string>,
  action: InventoryAction,
): InventoryConfirmRequest => {
  const { groups } = groupInventoryDetections(detections, decisions);
  const confirmedItems = groups
    .filter((group) => !group.skipped)
    .map((group) => ({
      detection_id: group.representativeDetection.detection_id,
      product_id: group.productId,
      quantity: Math.max(1, Number.parseInt(quantities[group.productId] ?? "1", 10) || 1),
      action,
    }));
  const rejectedItems = detections.flatMap((detection) => {
    const state = decisions[detection.detection_id] ?? fallbackDecision(detection);
    if (state.decision === "accepted" || state.decision === "corrected") {
      return [];
    }
    return [{ detection_id: detection.detection_id, reason: state.decision }];
  });

  return {
    confirmed_items: confirmedItems,
    rejected_items: rejectedItems,
  };
};

export const isValidInventoryQuantity = (value: string): boolean => {
  if (!/^\d+$/.test(value.trim())) {
    return false;
  }
  return Number.parseInt(value, 10) >= 1;
};
