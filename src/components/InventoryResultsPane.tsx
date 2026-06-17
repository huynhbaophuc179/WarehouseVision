import { Loader2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DetectionResultCard } from "@/components/DetectionResultCard";
import { StatMetric } from "@/components/StatMetric";
import type {
  CandidateResponse,
  DetectionDecision,
  DetectionDecisionState,
  DetectionResult,
  InventoryAction,
} from "@/types/api";
import { cn } from "@/lib/utils";

export interface InventoryResultsPaneProps {
  detections: DetectionResult[];
  decisions: Record<string, DetectionDecisionState>;
  selectedDetectionId: string | null;
  inventoryAction: InventoryAction;
  isProcessing: boolean;
  isConfirming: boolean;
  confirmMessage: string | null;
  errorMessage: string | null;
  onSelectDetection: (detectionId: string) => void;
  onInventoryActionChange: (action: InventoryAction) => void;
  onDecisionChange: (detectionId: string, decision: DetectionDecision) => void;
  onProductSelect: (detectionId: string, candidate: CandidateResponse) => void;
  onQuantityChange: (detectionId: string, quantity: number) => void;
  onConfirmInventory: () => void;
}

const actionOptions: { value: InventoryAction; label: string }[] = [
  { value: "stock_in", label: "Nhập kho" },
  { value: "stock_out", label: "Xuất kho" },
];

export const InventoryResultsPane = ({
  detections,
  decisions,
  selectedDetectionId,
  inventoryAction,
  isProcessing,
  isConfirming,
  confirmMessage,
  errorMessage,
  onSelectDetection,
  onInventoryActionChange,
  onDecisionChange,
  onProductSelect,
  onQuantityChange,
  onConfirmInventory,
}: InventoryResultsPaneProps): JSX.Element => {
  const acceptedCount = detections.filter((item) => {
    const state = decisions[item.detection_id];
    return state?.decision === "accepted" || state?.decision === "corrected";
  }).length;
  const reviewCount = detections.filter((item) => {
    const state = decisions[item.detection_id];
    return state?.decision === "review" || state?.decision === "unknown";
  }).length;
  const canConfirm = acceptedCount > 0 && !isConfirming;

  return (
    <aside className="flex h-full min-h-0 flex-col gap-3">
      <div>
        <h2 className="text-lg font-semibold text-slate-950">Kết quả tồn kho</h2>
        <p className="text-sm text-slate-500">Xác nhận nhanh từng vùng trước khi cập nhật kho.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <StatMetric label="Vùng" value={detections.length} />
        <StatMetric label="Chấp nhận" value={acceptedCount} tone="success" />
        <StatMetric label="Cần xem" value={reviewCount} tone="warning" />
      </div>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Chế độ kho</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {actionOptions.map((option) => (
              <Button
                key={option.value}
                variant="outline"
                className={cn(
                  inventoryAction === option.value && "border-slate-950 bg-slate-950 text-white hover:bg-slate-800",
                )}
                onClick={() => onInventoryActionChange(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <Button className="w-full" disabled={!canConfirm} onClick={onConfirmInventory}>
            {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
            Xác nhận cập nhật kho
          </Button>
          {confirmMessage && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {confirmMessage}
            </div>
          )}
          {errorMessage && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          )}
        </CardContent>
      </Card>
      <div className="min-h-0 flex-1 space-y-2 overflow-auto pr-1">
        {isProcessing ? (
          <div className="space-y-3">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : detections.length > 0 ? (
          detections.map((detection, index) => (
            <DetectionResultCard
              key={detection.detection_id}
              index={index + 1}
              detection={detection}
              state={
                decisions[detection.detection_id] ?? {
                  decision: "unknown",
                  selectedProductId: detection.product_id,
                  quantity: 1,
                }
              }
              selected={selectedDetectionId === detection.detection_id}
              onSelect={() => onSelectDetection(detection.detection_id)}
              onDecisionChange={(decision) => onDecisionChange(detection.detection_id, decision)}
              onProductSelect={(candidate) => onProductSelect(detection.detection_id, candidate)}
              onQuantityChange={(quantity) => onQuantityChange(detection.detection_id, quantity)}
            />
          ))
        ) : (
          <Card>
            <CardContent className="p-6 text-center text-sm text-slate-500">
              Chưa có kết quả. Hãy chọn ảnh và bấm nhận diện.
            </CardContent>
          </Card>
        )}
      </div>
    </aside>
  );
};
