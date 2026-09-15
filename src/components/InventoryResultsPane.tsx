import * as React from "react";
import { ScannerConfirmDialog } from "@/components/ScannerConfirmDialog";
import { ScannerDecisionCard } from "@/components/ScannerDecisionCard";
import { deriveScannerDecisionState } from "@/lib/scannerDecisionState";
import type { DetectionDecisionState, DetectionResult, InventoryAction } from "@/types/api";

export interface InventoryResultsPaneProps {
  detections: DetectionResult[];
  decisions: Record<string, DetectionDecisionState>;
  quantities: Record<string, string>;
  inventoryAction: InventoryAction;
  recognitionAttempted: boolean;
  recognitionVersion: number;
  isProcessing: boolean;
  isConfirming: boolean;
  committed: boolean;
  confirmMessage: string | null;
  errorMessage: string | null;
  onInventoryActionChange: (action: InventoryAction) => void;
  onAcceptSuggestion: (productId: string) => void;
  onQuantityChange: (productId: string, quantity: string) => void;
  onConfirm: () => void;
}

export const InventoryResultsPane = ({
  detections,
  decisions,
  quantities,
  inventoryAction,
  recognitionAttempted,
  recognitionVersion,
  isProcessing,
  isConfirming,
  committed,
  confirmMessage,
  errorMessage,
  onInventoryActionChange,
  onAcceptSuggestion,
  onQuantityChange,
  onConfirm,
}: InventoryResultsPaneProps): JSX.Element => {
  const quantityInputRef = React.useRef<HTMLInputElement>(null);
  const suggestionActionRef = React.useRef<HTMLButtonElement>(null);
  const confirmActionRef = React.useRef<HTMLButtonElement>(null);
  const focusedRecognitionRef = React.useRef<number | null>(null);
  const focusedSuggestionRef = React.useRef<number | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const state = deriveScannerDecisionState({
    detections,
    decisions,
    quantities,
    recognitionAttempted,
    isProcessing,
    committed,
  });
  const group = state.kind === "singleGroup" ? state.group : null;
  const quantity = state.kind === "singleGroup" ? state.quantity : "1";
  const canConfirm =
    state.kind === "singleGroup" && state.quantityValid && !isConfirming && !committed;

  React.useEffect(() => {
    if (state.focusOwner !== "quantity" || focusedRecognitionRef.current === recognitionVersion) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select();
      focusedRecognitionRef.current = recognitionVersion;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [recognitionVersion, state.focusOwner]);

  React.useEffect(() => {
    if (state.focusOwner !== "suggestion" || focusedSuggestionRef.current === recognitionVersion) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      suggestionActionRef.current?.focus();
      focusedSuggestionRef.current = recognitionVersion;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [recognitionVersion, state.focusOwner]);

  React.useEffect(() => {
    if (committed) {
      setConfirmOpen(false);
    }
  }, [committed]);

  const requestConfirmation = (): void => {
    if (canConfirm) {
      setConfirmOpen(true);
    }
  };

  return (
    <aside className="h-full min-h-0">
      <ScannerDecisionCard
        state={state}
        inventoryAction={inventoryAction}
        isConfirming={isConfirming}
        confirmMessage={confirmMessage}
        errorMessage={errorMessage}
        quantityInputRef={quantityInputRef}
        suggestionActionRef={suggestionActionRef}
        onInventoryActionChange={onInventoryActionChange}
        onAcceptSuggestion={onAcceptSuggestion}
        onQuantityChange={onQuantityChange}
        onRequestConfirmation={requestConfirmation}
      />
      <ScannerConfirmDialog
        open={confirmOpen}
        group={group}
        quantity={quantity}
        inventoryAction={inventoryAction}
        canConfirm={canConfirm}
        isConfirming={isConfirming}
        errorMessage={errorMessage}
        confirmActionRef={confirmActionRef}
        onOpenChange={(open) => {
          if (!isConfirming) {
            setConfirmOpen(open);
          }
        }}
        onConfirm={onConfirm}
      />
    </aside>
  );
};
