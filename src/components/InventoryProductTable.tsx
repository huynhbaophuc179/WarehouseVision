import { CheckCircle2, ImageOff, Loader2, PackageCheck, RotateCcw, X } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  groupInventoryDetections,
  isValidInventoryQuantity,
} from "@/lib/inventoryGrouping";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  CandidateResponse,
  DetectionDecisionState,
  DetectionResult,
  InventoryAction,
} from "@/types/api";

export interface InventoryProductTableProps {
  detections: DetectionResult[];
  decisions: Record<string, DetectionDecisionState>;
  quantities: Record<string, string>;
  inventoryAction: InventoryAction;
  selectedDetectionId: string | null;
  isProcessing: boolean;
  isConfirming: boolean;
  committed: boolean;
  showRecognizedGroups?: boolean;
  confirmMessage: string | null;
  errorMessage: string | null;
  onSelectDetection: (detectionId: string) => void;
  onQuantityChange: (productId: string, quantity: string) => void;
  onGroupSkipChange: (detectionIds: string[], skipped: boolean) => void;
  onCandidateSelect: (detectionId: string, candidate: CandidateResponse) => void;
  onUnresolvedSkipChange: (detectionId: string, skipped: boolean) => void;
  onConfirm: () => void;
}

const cropSource = (detection: DetectionResult): string | null =>
  detection.crop_preview_base64
    ? `data:image/jpeg;base64,${detection.crop_preview_base64}`
    : null;

const CropPreview = ({ detection, index }: { detection: DetectionResult; index: number }): JSX.Element => {
  const source = cropSource(detection);
  return (
    <div className="relative h-14 w-14 overflow-hidden rounded-md border border-slate-200 bg-slate-100">
      {source ? (
        <img src={source} alt={`Vùng ${index}`} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="h-4 w-4 text-slate-400" />
        </div>
      )}
      <span className="absolute left-0.5 top-0.5 rounded bg-slate-950 px-1 text-[10px] font-bold text-white">
        {index}
      </span>
    </div>
  );
};

export const InventoryProductTable = ({
  detections,
  decisions,
  quantities,
  inventoryAction,
  selectedDetectionId,
  isProcessing,
  isConfirming,
  committed,
  showRecognizedGroups = true,
  confirmMessage,
  errorMessage,
  onSelectDetection,
  onQuantityChange,
  onGroupSkipChange,
  onCandidateSelect,
  onUnresolvedSkipChange,
  onConfirm,
}: InventoryProductTableProps): JSX.Element | null => {
  const quantityRefs = React.useRef(new Map<string, HTMLInputElement>());
  const confirmButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const { groups, unresolved } = groupInventoryDetections(detections, decisions);
  const displayedGroups = showRecognizedGroups ? groups : [];
  const activeGroups = displayedGroups.filter((group) => !group.skipped);
  const quantitiesValid = activeGroups.every((group) =>
    isValidInventoryQuantity(quantities[group.productId] ?? "1"),
  );
  const canConfirm = activeGroups.length > 0 && quantitiesValid && !isConfirming && !committed;

  if (isProcessing) {
    if (!showRecognizedGroups) {
      return null;
    }
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>Sản phẩm trong phiên</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (detections.length === 0) {
    return null;
  }

  if (!showRecognizedGroups && unresolved.length === 0) {
    return null;
  }

  const focusNextQuantity = (productId: string): void => {
    const currentIndex = activeGroups.findIndex((group) => group.productId === productId);
    const nextGroup = activeGroups[currentIndex + 1];
    if (nextGroup) {
      quantityRefs.current.get(nextGroup.productId)?.focus();
      return;
    }
    confirmButtonRef.current?.focus();
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 pb-3">
        <div>
          <CardTitle>{showRecognizedGroups ? "Sản phẩm trong phiên" : "Vùng cần chọn mã"}</CardTitle>
          <p className="mt-1 text-sm text-slate-500">
            {showRecognizedGroups
              ? "Mỗi mã hàng chỉ xuất hiện một lần. Nhập số lượng thực tế bằng bàn phím số."
              : "Chọn mã phù hợp hoặc bỏ qua vùng không phải sản phẩm."}
          </p>
        </div>
        <Badge variant="secondary">
          {showRecognizedGroups ? `${activeGroups.length} loại sẽ cập nhật` : `${unresolved.length} vùng`}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <div className="min-w-[920px]">
            <div className="grid grid-cols-[72px_minmax(220px,1fr)_130px_150px_150px_120px] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <div className="px-3 py-2">Ảnh</div>
              <div className="px-3 py-2">Mã hàng</div>
              <div className="px-3 py-2">Tồn kho</div>
              <div className="px-3 py-2">Trạng thái</div>
              <div className="px-3 py-2">Số lượng</div>
              <div className="px-3 py-2 text-right">Thao tác</div>
            </div>
            {displayedGroups.map((group) => {
              const representativeIndex =
                detections.findIndex(
                  (detection) => detection.detection_id === group.representativeDetection.detection_id,
                ) + 1;
              const quantity = quantities[group.productId] ?? "1";
              const invalidQuantity = !group.skipped && !isValidInventoryQuantity(quantity);

              return (
                <div
                  key={group.productId}
                  className={cn(
                    "grid grid-cols-[72px_minmax(220px,1fr)_130px_150px_150px_120px] items-center border-b border-slate-100 transition-colors last:border-b-0",
                    selectedDetectionId === group.representativeDetection.detection_id && "bg-slate-50",
                    group.skipped && "bg-slate-50 opacity-55",
                  )}
                  onClick={() => onSelectDetection(group.representativeDetection.detection_id)}
                >
                  <div className="px-3 py-2">
                    <CropPreview detection={group.representativeDetection} index={representativeIndex} />
                  </div>
                  <div className="min-w-0 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-950">{group.productId}</p>
                      {group.detectionIds.length > 1 ? (
                        <Badge variant="warning">{group.detectionIds.length} vùng cùng mã</Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-slate-500">{group.name}</p>
                  </div>
                  <div className="px-3 py-2 text-sm font-semibold text-slate-950">
                    {group.inventoryCount ?? "-"}
                  </div>
                  <div className="px-3 py-2">
                    <Badge variant={group.skipped ? "secondary" : "success"}>
                      {group.skipped ? "Đã bỏ qua" : "Sẵn sàng"}
                    </Badge>
                  </div>
                  <div className="px-3 py-2">
                    {group.skipped ? (
                      <span className="text-sm text-slate-400">-</span>
                    ) : (
                      <Input
                        ref={(element) => {
                          if (element) {
                            quantityRefs.current.set(group.productId, element);
                          } else {
                            quantityRefs.current.delete(group.productId);
                          }
                        }}
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={quantity}
                        disabled={committed}
                        className={cn("h-9 w-28", invalidQuantity && "border-red-400")}
                        aria-label={`Số lượng ${group.productId}`}
                        onFocus={(event) => event.currentTarget.select()}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => onQuantityChange(group.productId, event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            focusNextQuantity(group.productId);
                          }
                        }}
                      />
                    )}
                  </div>
                  <div className="flex justify-end px-3 py-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={committed}
                      onClick={(event) => {
                        event.stopPropagation();
                        onGroupSkipChange(group.detectionIds, !group.skipped);
                      }}
                    >
                      {group.skipped ? <RotateCcw className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      {group.skipped ? "Khôi phục" : "Bỏ qua"}
                    </Button>
                  </div>
                </div>
              );
            })}

            {unresolved.map(({ detection, skipped }, unresolvedIndex) => {
              const detectionIndex = detections.findIndex(
                (item) => item.detection_id === detection.detection_id,
              ) + 1;
              const candidates = detection.candidates.slice(0, 3);
              return (
                <div
                  key={detection.detection_id}
                  className={cn(
                    "grid grid-cols-[72px_minmax(220px,1fr)_130px_150px_150px_120px] items-center border-b border-slate-100 last:border-b-0",
                    skipped && "bg-slate-50 opacity-55",
                  )}
                  onClick={() => onSelectDetection(detection.detection_id)}
                >
                  <div className="px-3 py-2">
                    <CropPreview detection={detection} index={detectionIndex || unresolvedIndex + 1} />
                  </div>
                  <div className="min-w-0 px-3 py-2">
                    <p className="text-sm font-semibold text-slate-950">Vùng chưa xác định</p>
                    {candidates.length > 0 && !skipped ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {candidates.map((candidate) => (
                          <button
                            key={`${detection.detection_id}-${candidate.product_id}`}
                            type="button"
                            className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-slate-950 hover:text-slate-950"
                            onClick={(event) => {
                              event.stopPropagation();
                              onCandidateSelect(detection.detection_id, candidate);
                            }}
                          >
                            {candidate.product_id} · {formatNumber(candidate.final_score ?? candidate.image_similarity_score ?? null, 2)}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        {skipped ? "Vùng này sẽ không cập nhật kho." : "Không có mã phù hợp."}
                      </p>
                    )}
                  </div>
                  <div className="px-3 py-2 text-sm text-slate-400">-</div>
                  <div className="px-3 py-2">
                    <Badge variant={skipped ? "secondary" : "warning"}>
                      {skipped ? "Đã bỏ qua" : "Cần chọn mã"}
                    </Badge>
                  </div>
                  <div className="px-3 py-2 text-sm text-slate-400">-</div>
                  <div className="flex justify-end px-3 py-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={committed}
                      onClick={(event) => {
                        event.stopPropagation();
                        onUnresolvedSkipChange(detection.detection_id, !skipped);
                      }}
                    >
                      {skipped ? <RotateCcw className="h-4 w-4" /> : <X className="h-4 w-4" />}
                      {skipped ? "Khôi phục" : "Bỏ qua"}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {showRecognizedGroups ? <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-950">
              {inventoryAction === "stock_in" ? "Nhập kho" : "Xuất kho"} · {activeGroups.length} loại sản phẩm
            </p>
            <p className="text-xs text-slate-500">
              Chỉ các dòng có trạng thái Sẵn sàng mới được cập nhật.
            </p>
          </div>
          <Button
            ref={confirmButtonRef}
            className="min-w-56"
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            {isConfirming ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : committed ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <PackageCheck className="h-4 w-4" />
            )}
            {committed ? "Đã cập nhật kho" : "Xác nhận cập nhật kho"}
          </Button>
        </div> : null}

        {showRecognizedGroups && confirmMessage ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            {confirmMessage}
          </div>
        ) : null}
        {showRecognizedGroups && errorMessage ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
