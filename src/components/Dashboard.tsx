import * as React from "react";
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
import type {
  CandidateResponse,
  DetectionDecision,
  DetectionDecisionState,
  DetectionResult,
  InventoryAction,
  InventoryConfirmRequest,
  ScannerSettings,
} from "@/types/api";
import type { DashboardView } from "@/types/navigation";

const buildInitialDecision = (detection: DetectionResult): DetectionDecisionState => ({
  decision: detection.status === "recognized" && detection.product_id ? "accepted" : "unknown",
  selectedProductId: detection.product_id,
  quantity: 1,
});

const buildInitialDecisions = (detections: DetectionResult[]): Record<string, DetectionDecisionState> =>
  detections.reduce<Record<string, DetectionDecisionState>>((accumulator, detection) => {
    accumulator[detection.detection_id] = buildInitialDecision(detection);
    return accumulator;
  }, {});

const buildConfirmPayload = (
  detections: DetectionResult[],
  decisions: Record<string, DetectionDecisionState>,
  inventoryAction: InventoryAction,
): InventoryConfirmRequest => {
  const confirmedItems = detections.flatMap((detection) => {
    const state = decisions[detection.detection_id];
    if (!state || !state.selectedProductId) {
      return [];
    }
    if (state.decision !== "accepted" && state.decision !== "corrected") {
      return [];
    }
    return [
      {
        detection_id: detection.detection_id,
        product_id: state.selectedProductId,
        quantity: state.quantity,
        action: inventoryAction,
      },
    ];
  });

  const rejectedItems = detections.flatMap((detection) => {
    const state = decisions[detection.detection_id];
    if (!state || state.decision === "accepted" || state.decision === "corrected") {
      return [];
    }
    return [
      {
        detection_id: detection.detection_id,
        reason: state.decision,
      },
    ];
  });

  return {
    confirmed_items: confirmedItems,
    rejected_items: rejectedItems,
  };
};

export const Dashboard = (): JSX.Element => {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [activeView, setActiveView] = React.useState<DashboardView>("scanner");
  const [settings, setSettings] = React.useState<ScannerSettings>({
    apiBaseUrl: defaultApiBaseUrl,
    confidenceThreshold: 0.25,
    iouThreshold: 0.3,
    modelName: "warehouse.pt",
    topK: 5,
  });
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [imageUrl, setImageUrl] = React.useState<string | null>(null);
  const [detections, setDetections] = React.useState<DetectionResult[]>([]);
  const [decisions, setDecisions] = React.useState<Record<string, DetectionDecisionState>>({});
  const [selectedDetectionId, setSelectedDetectionId] = React.useState<string | null>(null);
  const [inventoryAction, setInventoryAction] = React.useState<InventoryAction>("stock_in");
  const [confirmMessage, setConfirmMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const recognizeMutation = useRecognizeImage(settings.apiBaseUrl);
  const confirmMutation = useConfirmInventory(settings.apiBaseUrl);

  React.useEffect(() => {
    if (!selectedFile) {
      setImageUrl(null);
      return;
    }
    const nextUrl = URL.createObjectURL(selectedFile);
    setImageUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [selectedFile]);

  const handleFileSelected = (file: File): void => {
    setSelectedFile(file);
    setDetections([]);
    setDecisions({});
    setSelectedDetectionId(null);
    setConfirmMessage(null);
    setErrorMessage(null);
    recognizeMutation.reset();
    confirmMutation.reset();
  };

  const handleRecognize = (): void => {
    if (!selectedFile) {
      return;
    }
    setConfirmMessage(null);
    setErrorMessage(null);
    recognizeMutation.mutate(selectedFile, {
      onSuccess: (result) => {
        setDetections(result);
        setDecisions(buildInitialDecisions(result));
        setSelectedDetectionId(result[0]?.detection_id ?? null);
      },
      onError: (error) => {
        setErrorMessage(error.message);
      },
    });
  };

  const updateDecision = (
    detectionId: string,
    updater: (state: DetectionDecisionState) => DetectionDecisionState,
  ): void => {
    setDecisions((current) => {
      const detection = detections.find((item) => item.detection_id === detectionId);
      const fallback = detection ? buildInitialDecision(detection) : { decision: "unknown", selectedProductId: null, quantity: 1 };
      return {
        ...current,
        [detectionId]: updater(current[detectionId] ?? fallback),
      };
    });
  };

  const handleDecisionChange = (detectionId: string, decision: DetectionDecision): void => {
    updateDecision(detectionId, (state) => ({
      ...state,
      decision,
    }));
  };

  const handleProductSelect = (detectionId: string, candidate: CandidateResponse): void => {
    updateDecision(detectionId, (state) => ({
      ...state,
      decision: "corrected",
      selectedProductId: candidate.product_id,
    }));
  };

  const handleQuantityChange = (detectionId: string, quantity: number): void => {
    updateDecision(detectionId, (state) => ({
      ...state,
      quantity,
    }));
  };

  const handleConfirmInventory = (): void => {
    const payload = buildConfirmPayload(detections, decisions, inventoryAction);
    if (payload.confirmed_items.length === 0) {
      setErrorMessage("Chưa có sản phẩm nào được chấp nhận để cập nhật kho.");
      return;
    }
    setConfirmMessage(null);
    setErrorMessage(null);
    confirmMutation.mutate(payload, {
      onSuccess: (result) => {
        setConfirmMessage(`Đã xác nhận ${result.confirmed_items.length} sản phẩm.`);
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
          imageUrl={imageUrl}
          selectedFileName={selectedFile?.name ?? null}
          detections={detections}
          selectedDetectionId={selectedDetectionId}
          isProcessing={recognizeMutation.isPending}
          onFileSelected={handleFileSelected}
          onRecognize={handleRecognize}
          onSelectDetection={setSelectedDetectionId}
        />
      }
      rightPane={
        <InventoryResultsPane
          detections={detections}
          decisions={decisions}
          selectedDetectionId={selectedDetectionId}
          inventoryAction={inventoryAction}
          isProcessing={recognizeMutation.isPending}
          isConfirming={confirmMutation.isPending}
          confirmMessage={confirmMessage}
          errorMessage={errorMessage ?? recognizeMutation.error?.message ?? confirmMutation.error?.message ?? null}
          onSelectDetection={setSelectedDetectionId}
          onInventoryActionChange={setInventoryAction}
          onDecisionChange={handleDecisionChange}
          onProductSelect={handleProductSelect}
          onQuantityChange={handleQuantityChange}
          onConfirmInventory={handleConfirmInventory}
        />
      }
    />
  );
};
