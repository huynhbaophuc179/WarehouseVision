import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DetectionResultCard } from "@/components/DetectionResultCard";
import type {
  CandidateResponse,
  DetectionDecision,
  DetectionDecisionState,
  DetectionResult,
} from "@/types/api";

export interface DetectionConfirmationPanelProps {
  detections: DetectionResult[];
  decisions: Record<string, DetectionDecisionState>;
  selectedDetectionId: string | null;
  isProcessing: boolean;
  onSelectDetection: (detectionId: string) => void;
  onDecisionChange: (detectionId: string, decision: DetectionDecision) => void;
  onProductSelect: (detectionId: string, candidate: CandidateResponse) => void;
  onQuantityChange: (detectionId: string, quantity: number) => void;
}

export const DetectionConfirmationPanel = ({
  detections,
  decisions,
  selectedDetectionId,
  isProcessing,
  onSelectDetection,
  onDecisionChange,
  onProductSelect,
  onQuantityChange,
}: DetectionConfirmationPanelProps): JSX.Element | null => {
  if (isProcessing) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Xác nhận chi tiết</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (detections.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Xác nhận chi tiết</CardTitle>
        <p className="text-sm text-slate-500">
          Kiểm tra từng vùng, chọn đúng mã sản phẩm và nhập số lượng trước khi cập nhật kho.
        </p>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {detections.map((detection, index) => (
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
        ))}
      </CardContent>
    </Card>
  );
};
