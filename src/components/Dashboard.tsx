import * as React from "react";
import { CategoryManagementPage } from "@/components/CategoryManagementPage";
import { LiveScanner } from "@/components/LiveScanner";
import { InventoryResultsPane } from "@/components/InventoryResultsPane";
import { MissingBoxPage } from "@/components/MissingBoxPage";
import { ProductManagementPage } from "@/components/ProductManagementPage";
import { ReviewPage } from "@/components/ReviewPage";
import { SettingsSheet } from "@/components/SettingsSheet";
import { defaultApiBaseUrl } from "@/lib/api";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import { useConfirmInventory } from "@/hooks/useConfirmInventory";
import { useRecognizeImage } from "@/hooks/useRecognizeImage";
import { buildGroupedInventoryPayload, groupInventoryDetections } from "@/lib/inventoryGrouping";
import type {
  DetectionDecisionState,
  DetectionResult,
  InventoryAction,
  ScannerSettings,
} from "@/types/api";
import type { DashboardView } from "@/types/navigation";

const bestCandidateProductId = (detection: DetectionResult): string | null =>
  detection.product_id ?? detection.candidates[0]?.product_id ?? null;

const buildInitialDecision = (detection: DetectionResult): DetectionDecisionState => {
  const selectedProductId = bestCandidateProductId(detection);
  return {
    decision: detection.status === "recognized" && selectedProductId ? "accepted" : "unknown",
    selectedProductId,
    quantity: 1,
  };
};

const buildInitialDecisions = (detections: DetectionResult[]): Record<string, DetectionDecisionState> =>
  detections.reduce<Record<string, DetectionDecisionState>>((accumulator, detection) => {
    accumulator[detection.detection_id] = buildInitialDecision(detection);
    return accumulator;
  }, {});

export const Dashboard = (): JSX.Element => {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [activeView, setActiveView] = React.useState<DashboardView>("scanner");
  const [settings, setSettings] = React.useState<ScannerSettings>({
    apiBaseUrl: defaultApiBaseUrl,
    confidenceThreshold: 0.75,
    topK: 5,
  });
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [detections, setDetections] = React.useState<DetectionResult[]>([]);
  const [decisions, setDecisions] = React.useState<Record<string, DetectionDecisionState>>({});
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [selectedDetectionId, setSelectedDetectionId] = React.useState<string | null>(null);
  const [inventoryAction, setInventoryAction] = React.useState<InventoryAction>("stock_in");
  const [recognitionAttempted, setRecognitionAttempted] = React.useState(false);
  const [recognitionVersion, setRecognitionVersion] = React.useState(0);
  const [confirmMessage, setConfirmMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [inventoryCommitted, setInventoryCommitted] = React.useState(false);
  const resetTimerRef = React.useRef<number | null>(null);
  const recognizeMutation = useRecognizeImage(settings.apiBaseUrl);
  const confirmMutation = useConfirmInventory(settings.apiBaseUrl);
  const activeInventoryGroups = React.useMemo(
    () => groupInventoryDetections(detections, decisions).groups.filter((group) => !group.skipped),
    [decisions, detections],
  );
  const pendingSuggestedProductIds = React.useMemo(
    () =>
      new Set(
        detections.flatMap((detection) => {
          const state = decisions[detection.detection_id];
          return detection.status === "uncertain" &&
            state?.decision === "unknown" &&
            state.selectedProductId
            ? [state.selectedProductId]
            : [];
        }),
      ),
    [decisions, detections],
  );

  React.useEffect(
    () => () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (!selectedFile) {
      setImageUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(selectedFile);
    setImageUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [selectedFile]);

  React.useEffect(() => {
    const handleInventoryShortcut = (event: KeyboardEvent): void => {
      if (activeView !== "scanner" || inventoryCommitted) {
        return;
      }
      if (event.code === "NumpadAdd" || event.key === "+") {
        event.preventDefault();
        setInventoryAction("stock_in");
      } else if (event.code === "NumpadSubtract" || event.key === "-") {
        event.preventDefault();
        setInventoryAction("stock_out");
      }
    };
    window.addEventListener("keydown", handleInventoryShortcut);
    return () => window.removeEventListener("keydown", handleInventoryShortcut);
  }, [activeView, inventoryCommitted]);

  const resetScan = (): void => {
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
      resetTimerRef.current = null;
    }
    setSelectedFile(null);
    setDetections([]);
    setDecisions({});
    setQuantities({});
    setSelectedDetectionId(null);
    setRecognitionAttempted(false);
    setConfirmMessage(null);
    setErrorMessage(null);
    setInventoryCommitted(false);
    recognizeMutation.reset();
    confirmMutation.reset();
  };

  const handleFileSelected = (file: File): void => {
    resetScan();
    setSelectedFile(file);
  };

  const handleRecognize = (fileOverride?: File): void => {
    const recognitionFile = fileOverride ?? selectedFile;
    if (!recognitionFile) {
      return;
    }
    setRecognitionAttempted(false);
    setConfirmMessage(null);
    setErrorMessage(null);
    setInventoryCommitted(false);
    recognizeMutation.mutate({
      file: recognitionFile,
      topK: settings.topK,
      autoAcceptScoreThreshold: settings.confidenceThreshold,
    }, {
      onSuccess: (result) => {
        const initialDecisions = buildInitialDecisions(result);
        const initialGroups = groupInventoryDetections(result, initialDecisions).groups;
        setRecognitionAttempted(true);
        setRecognitionVersion((current) => current + 1);
        setDetections(result);
        setDecisions(initialDecisions);
        setQuantities(
          Object.fromEntries(initialGroups.map((group) => [group.productId, "1"])),
        );
        setSelectedDetectionId(result[0]?.detection_id ?? null);
      },
      onError: (error) => {
        setRecognitionAttempted(true);
        setErrorMessage(error.message);
      },
    });
  };

  const handleQuantityChange = (productId: string, quantity: string): void => {
    setQuantities((current) => ({
      ...current,
      [productId]: quantity,
    }));
  };

  const handleAcceptSuggestion = (productId: string): void => {
    setDecisions((current) =>
      Object.fromEntries(
        Object.entries(current).map(([detectionId, state]) => [
          detectionId,
          state.decision === "unknown" && state.selectedProductId === productId
            ? { ...state, decision: "accepted" }
            : state,
        ]),
      ),
    );
    setQuantities((current) => ({
      ...current,
      [productId]: current[productId] ?? "1",
    }));
  };

  const handleConfirmInventory = (): void => {
    if (inventoryCommitted) {
      return;
    }
    const payload = buildGroupedInventoryPayload(
      detections,
      decisions,
      quantities,
      inventoryAction,
    );
    if (payload.confirmed_items.length === 0) {
      setErrorMessage("Chưa có sản phẩm nào được chấp nhận để cập nhật kho.");
      return;
    }
    setConfirmMessage(null);
    setErrorMessage(null);
    confirmMutation.mutate(payload, {
      onSuccess: (result) => {
        const inventoryCounts = new Map(
          result.confirmed_items.map((item) => [item.product_id, item.inventory_count]),
        );
        setDetections((currentDetections) =>
          currentDetections.map((detection) => {
            const selectedProductId = decisions[detection.detection_id]?.selectedProductId;
            if (!selectedProductId || !inventoryCounts.has(selectedProductId)) {
              return detection;
            }
            const inventoryCount = inventoryCounts.get(selectedProductId) ?? detection.inventory_count;
            return {
              ...detection,
              inventory_count:
                detection.product_id === selectedProductId ? inventoryCount : detection.inventory_count,
              candidates: detection.candidates.map((candidate) =>
                candidate.product_id === selectedProductId
                  ? { ...candidate, inventory_count: inventoryCount ?? candidate.inventory_count }
                  : candidate,
              ),
            };
          }),
        );
        setInventoryCommitted(true);
        setConfirmMessage(`Đã cập nhật kho cho ${result.confirmed_items.length} loại sản phẩm.`);
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        resetTimerRef.current = window.setTimeout(() => resetScan(), 1200);
      },
      onError: (error) => {
        setErrorMessage(error.message);
      },
    });
  };

  return (
    <DashboardLayout
      activeView={activeView}
      onViewChange={setActiveView}
      onOpenSettings={() => setSettingsOpen(true)}
      fullPane={
        activeView === "products" ? (
          <ProductManagementPage apiBaseUrl={settings.apiBaseUrl} />
        ) : activeView === "categories" ? (
          <CategoryManagementPage apiBaseUrl={settings.apiBaseUrl} />
        ) : activeView === "review" ? (
          <ReviewPage apiBaseUrl={settings.apiBaseUrl} />
        ) : activeView === "missing-box" ? (
          <MissingBoxPage apiBaseUrl={settings.apiBaseUrl} />
        ) : undefined
      }
      settings={
        <SettingsSheet
          open={settingsOpen}
          settings={settings}
          onOpenChange={setSettingsOpen}
          onSettingsChange={setSettings}
        />
      }
      leftPane={
        <LiveScanner
          isProcessing={recognizeMutation.isPending}
          imageUrl={imageUrl}
          detections={detections}
          selectedDetectionId={selectedDetectionId}
          allowEnterRetake={
            recognitionAttempted &&
            activeInventoryGroups.length !== 1 &&
            pendingSuggestedProductIds.size !== 1
          }
          onFileSelected={handleFileSelected}
          onRecognize={handleRecognize}
          onSelectDetection={setSelectedDetectionId}
        />
      }
      rightPane={
        <InventoryResultsPane
          detections={detections}
          decisions={decisions}
          quantities={quantities}
          inventoryAction={inventoryAction}
          recognitionAttempted={recognitionAttempted}
          recognitionVersion={recognitionVersion}
          isProcessing={recognizeMutation.isPending}
          isConfirming={confirmMutation.isPending}
          committed={inventoryCommitted}
          confirmMessage={confirmMessage}
          errorMessage={errorMessage ?? recognizeMutation.error?.message ?? null}
          onInventoryActionChange={setInventoryAction}
          onAcceptSuggestion={handleAcceptSuggestion}
          onQuantityChange={handleQuantityChange}
          onConfirm={handleConfirmInventory}
        />
      }
    />
  );
};
