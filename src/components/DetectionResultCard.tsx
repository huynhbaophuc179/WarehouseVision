import { Check, HelpCircle, Send, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { confidenceLevelLabel, formatNumber, formatPercent, statusLabel } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CandidateResponse, DetectionDecision, DetectionDecisionState, DetectionResult } from "@/types/api";

export interface DetectionResultCardProps {
  index: number;
  detection: DetectionResult;
  state: DetectionDecisionState;
  selected: boolean;
  onSelect: () => void;
  onDecisionChange: (decision: DetectionDecision) => void;
  onProductSelect: (product: CandidateResponse) => void;
  onQuantityChange: (quantity: number) => void;
}

const statusVariant = (status: DetectionResult["status"]): "success" | "warning" | "secondary" => {
  if (status === "recognized") {
    return "success";
  }
  if (status === "uncertain") {
    return "warning";
  }
  return "secondary";
};

const decisionButtonClass = (active: boolean): string =>
  active ? "border-primary bg-action text-action-content hover:bg-action-hover" : "";

export const DetectionResultCard = ({
  index,
  detection,
  state,
  selected,
  onSelect,
  onDecisionChange,
  onProductSelect,
  onQuantityChange,
}: DetectionResultCardProps): JSX.Element => {
  const selectedCandidate =
    detection.candidates.find((candidate) => candidate.product_id === state.selectedProductId) ??
    detection.candidates[0] ??
    null;
  const productName = detection.name ?? selectedCandidate?.name ?? selectedCandidate?.product_name ?? "Chưa xác định";
  const productId = state.selectedProductId ?? detection.product_id ?? selectedCandidate?.product_id ?? "-";
  const cropSrc = detection.crop_preview_base64
    ? `data:image/jpeg;base64,${detection.crop_preview_base64}`
    : null;
  const candidates = detection.candidates.slice(0, 3);

  return (
    <Card
      className={cn(
        "cursor-pointer transition-colors",
        selected ? "border-content ring-2 ring-content/10" : "border-line",
      )}
      onClick={onSelect}
    >
      <CardContent className="p-3">
        <div className="flex gap-3">
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md border border-line bg-inset">
            {cropSrc ? (
              <img src={cropSrc} alt={`Vùng ${index}`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs text-faint">
                Không có ảnh
              </div>
            )}
            <div className="absolute left-1 top-1 rounded bg-slate-950 px-1.5 py-0.5 text-xs font-bold text-white">
              {index}
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-content">{productName}</p>
                <p className="truncate text-xs text-muted">Mã: {productId}</p>
              </div>
              <Badge variant={statusVariant(detection.status)}>{statusLabel(detection.status)}</Badge>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div>
                <p className="text-faint">Tồn kho</p>
                <p className="font-semibold text-content">{detection.inventory_count ?? "-"}</p>
              </div>
              <div>
                <p className="text-faint">Tin cậy</p>
                <p className="font-semibold text-content">{confidenceLevelLabel(detection.confidence_level)}</p>
              </div>
              <div>
                <p className="text-faint">Độ chắc vùng</p>
                <p className="font-semibold text-content">{formatPercent(detection.detector_confidence)}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            className={decisionButtonClass(state.decision === "accepted")}
            disabled={!productId || productId === "-"}
            onClick={(event) => {
              event.stopPropagation();
              onDecisionChange("accepted");
            }}
          >
            <Check className="h-4 w-4" />
            Chấp nhận
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={decisionButtonClass(state.decision === "rejected")}
            onClick={(event) => {
              event.stopPropagation();
              onDecisionChange("rejected");
            }}
          >
            <X className="h-4 w-4" />
            Từ chối
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={decisionButtonClass(state.decision === "unknown")}
            onClick={(event) => {
              event.stopPropagation();
              onDecisionChange("unknown");
            }}
          >
            <HelpCircle className="h-4 w-4" />
            Chưa xác định
          </Button>
          <Button
            variant="outline"
            size="sm"
            className={decisionButtonClass(state.decision === "review")}
            onClick={(event) => {
              event.stopPropagation();
              onDecisionChange("review");
            }}
          >
            <Send className="h-4 w-4" />
            Gửi rà soát
          </Button>
        </div>
        {candidates.length > 0 && (
          <div className="mt-3 space-y-2">
            <p className="text-xs font-medium text-muted">Gợi ý sản phẩm</p>
            <div className="space-y-1">
              {candidates.map((candidate) => (
                <Button variant="outline"
                  key={`${detection.detection_id}-${candidate.product_id}`}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-md border px-2 py-1.5 text-left text-xs transition-colors",
                    state.selectedProductId === candidate.product_id
                      ? "border-primary bg-action text-action-content"
                      : "border-line hover:bg-subtle",
                  )}
                  onClick={(event) => {
                    event.stopPropagation();
                    onProductSelect(candidate);
                  }}
                >
                  <span className="truncate font-medium">{candidate.name}</span>
                  <span>{formatNumber(candidate.final_score ?? candidate.image_similarity_score ?? null, 2)}</span>
                </Button>
              ))}
            </div>
          </div>
        )}
        {state.decision === "accepted" || state.decision === "corrected" ? (
          <div className="mt-3">
            <Label className="text-xs text-muted" htmlFor={`qty-${detection.detection_id}`}>
              Số lượng
            </Label>
            <Input
              id={`qty-${detection.detection_id}`}
              type="number"
              min={1}
              value={state.quantity}
              className="mt-1 h-9"
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => onQuantityChange(Math.max(1, Number(event.target.value)))}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
