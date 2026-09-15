import {
  groupInventoryDetections,
  isValidInventoryQuantity,
  type InventoryProductGroup,
// The Node test runner needs explicit extensions for nested TypeScript imports.
// @ts-expect-error TypeScript compilation resolves the same source module.
} from "./inventoryGrouping.ts";
import type { DetectionDecisionState, DetectionResult } from "../types/api.ts";

export interface SuggestedInventoryProduct {
  productId: string;
  name: string;
  inventoryCount: number | null;
  representativeDetection: DetectionResult;
}

export type ScannerDecisionViewState =
  | { kind: "idle"; focusOwner: "window" }
  | { kind: "processing"; focusOwner: "none" }
  | {
      kind: "singleGroup";
      focusOwner: "quantity";
      group: InventoryProductGroup;
      quantity: string;
      quantityValid: boolean;
    }
  | {
      kind: "singleSuggestion";
      focusOwner: "suggestion";
      suggestion: SuggestedInventoryProduct;
    }
  | {
      kind: "retakeRequired";
      focusOwner: "window";
      reason: "noResult" | "multipleProducts" | "multipleSuggestions";
    }
  | {
      kind: "committed";
      focusOwner: "none";
      product: InventoryProductGroup | SuggestedInventoryProduct | null;
    };

const scoreForProduct = (detection: DetectionResult, productId: string): number => {
  const candidate = detection.candidates.find((item) => item.product_id === productId);
  return (
    candidate?.final_score ??
    candidate?.image_similarity_score ??
    detection.final_score ??
    detection.image_similarity_score ??
    0
  );
};

export const buildSuggestedProduct = (
  detections: DetectionResult[],
  decisions: Record<string, DetectionDecisionState>,
): SuggestedInventoryProduct | null => {
  const suggested = detections.flatMap((detection) => {
    const decision = decisions[detection.detection_id];
    if (
      detection.status !== "uncertain" ||
      decision?.decision !== "unknown" ||
      !decision.selectedProductId
    ) {
      return [];
    }
    return [{ detection, productId: decision.selectedProductId }];
  });
  const productIds = new Set(suggested.map(({ productId }) => productId));
  if (productIds.size !== 1 || !suggested[0]) {
    return null;
  }

  const productId = suggested[0].productId;
  const representative = suggested.reduce((best, current) =>
    scoreForProduct(current.detection, productId) > scoreForProduct(best.detection, productId)
      ? current
      : best,
  );
  const detection = representative.detection;
  const candidate = detection.candidates.find((item) => item.product_id === productId);
  return {
    productId,
    name:
      detection.product_id === productId && detection.name
        ? detection.name
        : candidate?.name ?? candidate?.product_name ?? productId,
    inventoryCount:
      detection.product_id === productId
        ? detection.inventory_count
        : candidate?.inventory_count ?? null,
    representativeDetection: detection,
  };
};

interface ScannerDecisionStateInput {
  detections: DetectionResult[];
  decisions: Record<string, DetectionDecisionState>;
  quantities: Record<string, string>;
  recognitionAttempted: boolean;
  isProcessing: boolean;
  committed: boolean;
}

export const deriveScannerDecisionState = ({
  detections,
  decisions,
  quantities,
  recognitionAttempted,
  isProcessing,
  committed,
}: ScannerDecisionStateInput): ScannerDecisionViewState => {
  const { groups, unresolved } = groupInventoryDetections(detections, decisions);
  const activeGroups = groups.filter((group) => !group.skipped);
  const group = activeGroups.length === 1 ? activeGroups[0] : null;
  const suggestion = group ? null : buildSuggestedProduct(detections, decisions);

  if (committed) {
    return { kind: "committed", focusOwner: "none", product: group ?? suggestion };
  }
  if (isProcessing) {
    return { kind: "processing", focusOwner: "none" };
  }
  if (group) {
    const quantity = quantities[group.productId] ?? "1";
    return {
      kind: "singleGroup",
      focusOwner: "quantity",
      group,
      quantity,
      quantityValid: isValidInventoryQuantity(quantity),
    };
  }
  if (suggestion) {
    return { kind: "singleSuggestion", focusOwner: "suggestion", suggestion };
  }
  if (!recognitionAttempted) {
    return { kind: "idle", focusOwner: "window" };
  }
  if (activeGroups.length > 1) {
    return { kind: "retakeRequired", focusOwner: "window", reason: "multipleProducts" };
  }
  const uncertainCount = unresolved.filter(
    ({ detection, state }) => detection.status === "uncertain" && state.decision === "unknown",
  ).length;
  return {
    kind: "retakeRequired",
    focusOwner: "window",
    reason: uncertainCount > 1 ? "multipleSuggestions" : "noResult",
  };
};
