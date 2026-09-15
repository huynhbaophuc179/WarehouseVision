import { Table } from "antd";
import {
  CheckCircle2,
  ImageOff,
  Loader2,
  PackageCheck,
  RotateCcw,
  X,
} from "lucide-react";
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
  onCandidateSelect: (
    detectionId: string,
    candidate: CandidateResponse,
  ) => void;
  onUnresolvedSkipChange: (detectionId: string, skipped: boolean) => void;
  onConfirm: () => void;
}

const cropSource = (detection: DetectionResult): string | null =>
  detection.crop_preview_base64
    ? `data:image/jpeg;base64,${detection.crop_preview_base64}`
    : null;

const CropPreview = ({
  detection,
  index,
}: {
  detection: DetectionResult;
  index: number;
}): JSX.Element => {
  const source = cropSource(detection);
  return (
    <div className="relative h-14 w-14 overflow-hidden rounded-md border border-line bg-inset">
      {source ? (
        <img
          src={source}
          alt={`Vùng ${index}`}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <ImageOff className="h-4 w-4 text-faint" />
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
  const { groups, unresolved } = groupInventoryDetections(
    detections,
    decisions,
  );
  const displayedGroups = showRecognizedGroups ? groups : [];
  const activeGroups = displayedGroups.filter((group) => !group.skipped);
  const quantitiesValid = activeGroups.every((group) =>
    isValidInventoryQuantity(quantities[group.productId] ?? "1"),
  );
  const canConfirm =
    activeGroups.length > 0 && quantitiesValid && !isConfirming && !committed;

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
    const currentIndex = activeGroups.findIndex(
      (group) => group.productId === productId,
    );
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
          <CardTitle>
            {showRecognizedGroups ? "Sản phẩm trong phiên" : "Vùng cần chọn mã"}
          </CardTitle>
          <p className="mt-1 text-sm text-muted">
            {showRecognizedGroups
              ? "Mỗi mã hàng chỉ xuất hiện một lần. Nhập số lượng thực tế bằng bàn phím số."
              : "Chọn mã phù hợp hoặc bỏ qua vùng không phải sản phẩm."}
          </p>
        </div>
        <Badge variant="secondary">
          {showRecognizedGroups
            ? `${activeGroups.length} loại sẽ cập nhật`
            : `${unresolved.length} vùng`}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <Table
          size="small"
          pagination={false}
          rowKey="key"
          scroll={{ x: 920 }}
          rowClassName={(record) => record.className}
          onRow={(record) => ({
            onClick: () => onSelectDetection(record.detectionId),
          })}
          dataSource={[
            ...displayedGroups.map((group) => {
              const representativeIndex =
                detections.findIndex(
                  (detection) =>
                    detection.detection_id ===
                    group.representativeDetection.detection_id,
                ) + 1;
              const quantity = quantities[group.productId] ?? "1";
              const invalidQuantity =
                !group.skipped && !isValidInventoryQuantity(quantity);
              return {
                key: group.productId,
                detectionId: group.representativeDetection.detection_id,
                className: cn(
                  selectedDetectionId ===
                    group.representativeDetection.detection_id && "bg-subtle",
                  group.skipped && "opacity-55",
                ),
                cell0: (
                  <div className="px-3 py-2">
                    <CropPreview
                      detection={group.representativeDetection}
                      index={representativeIndex}
                    />
                  </div>
                ),
                cell1: (
                  <div className="min-w-0 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-content">
                        {group.productId}
                      </p>
                      {group.detectionIds.length > 1 ? (
                        <Badge variant="warning">
                          {group.detectionIds.length} vùng cùng mã
                        </Badge>
                      ) : null}
                    </div>
                    <p className="truncate text-xs text-muted">
                      {group.name}
                    </p>
                  </div>
                ),
                cell2: (
                  <div className="px-3 py-2 text-sm font-semibold text-content">
                    {group.inventoryCount ?? "-"}
                  </div>
                ),
                cell3: (
                  <div className="px-3 py-2">
                    <Badge variant={group.skipped ? "secondary" : "success"}>
                      {group.skipped ? "Đã bỏ qua" : "Sẵn sàng"}
                    </Badge>
                  </div>
                ),
                cell4: (
                  <div className="px-3 py-2">
                    {group.skipped ? (
                      <span className="text-sm text-faint">-</span>
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
                        className={cn(
                          "h-9 w-28",
                          invalidQuantity && "border-danger",
                        )}
                        aria-label={`Số lượng ${group.productId}`}
                        onFocus={(event) => event.currentTarget.select()}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) =>
                          onQuantityChange(group.productId, event.target.value)
                        }
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            focusNextQuantity(group.productId);
                          }
                        }}
                      />
                    )}
                  </div>
                ),
                cell5: (
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
                      {group.skipped ? (
                        <RotateCcw className="h-4 w-4" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                      {group.skipped ? "Khôi phục" : "Bỏ qua"}
                    </Button>
                  </div>
                ),
              };
            }),
            ...unresolved.map(({ detection, skipped }, unresolvedIndex) => {
              const detectionIndex =
                detections.findIndex(
                  (item) => item.detection_id === detection.detection_id,
                ) + 1;
              const candidates = detection.candidates.slice(0, 3);
              return {
                key: detection.detection_id,
                detectionId: detection.detection_id,
                className: cn(skipped && "opacity-55"),
                cell0: (
                  <div className="px-3 py-2">
                    <CropPreview
                      detection={detection}
                      index={detectionIndex || unresolvedIndex + 1}
                    />
                  </div>
                ),
                cell1: (
                  <div className="min-w-0 px-3 py-2">
                    <p className="text-sm font-semibold text-content">
                      Vùng chưa xác định
                    </p>
                    {candidates.length > 0 && !skipped ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {candidates.map((candidate) => (
                          <Button
                            variant="outline"
                            key={`${detection.detection_id}-${candidate.product_id}`}
                            type="button"
                            className="rounded-md border border-line bg-surface px-2 py-1 text-xs font-medium text-secondary hover:border-content hover:text-content"
                            onClick={(event) => {
                              event.stopPropagation();
                              onCandidateSelect(
                                detection.detection_id,
                                candidate,
                              );
                            }}
                          >
                            {candidate.product_id} ·{" "}
                            {formatNumber(
                              candidate.final_score ??
                                candidate.image_similarity_score ??
                                null,
                              2,
                            )}
                          </Button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted">
                        {skipped
                          ? "Vùng này sẽ không cập nhật kho."
                          : "Không có mã phù hợp."}
                      </p>
                    )}
                  </div>
                ),
                cell2: (
                  <div className="px-3 py-2 text-sm text-faint">-</div>
                ),
                cell3: (
                  <div className="px-3 py-2">
                    <Badge variant={skipped ? "secondary" : "warning"}>
                      {skipped ? "Đã bỏ qua" : "Cần chọn mã"}
                    </Badge>
                  </div>
                ),
                cell4: (
                  <div className="px-3 py-2 text-sm text-faint">-</div>
                ),
                cell5: (
                  <div className="flex justify-end px-3 py-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={committed}
                      onClick={(event) => {
                        event.stopPropagation();
                        onUnresolvedSkipChange(
                          detection.detection_id,
                          !skipped,
                        );
                      }}
                    >
                      {skipped ? (
                        <RotateCcw className="h-4 w-4" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                      {skipped ? "Khôi phục" : "Bỏ qua"}
                    </Button>
                  </div>
                ),
              };
            }),
          ]}
          columns={[
            { title: "Ảnh", dataIndex: "cell0", key: "cell0", width: 90 },
            { title: "Mã hàng", dataIndex: "cell1", key: "cell1" },
            { title: "Tồn kho", dataIndex: "cell2", key: "cell2", width: 100 },
            {
              title: "Trạng thái",
              dataIndex: "cell3",
              key: "cell3",
              width: 130,
            },
            { title: "Số lượng", dataIndex: "cell4", key: "cell4", width: 150 },
            { title: "Thao tác", dataIndex: "cell5", key: "cell5", width: 130 },
          ]}
        />

        {showRecognizedGroups ? (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-subtle p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-content">
                {inventoryAction === "stock_in" ? "Nhập kho" : "Xuất kho"} ·{" "}
                {activeGroups.length} loại sản phẩm
              </p>
              <p className="text-xs text-muted">
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
          </div>
        ) : null}

        {showRecognizedGroups && confirmMessage ? (
          <div className="rounded-md border border-success-border bg-success-surface px-3 py-2 text-sm text-success">
            {confirmMessage}
          </div>
        ) : null}
        {showRecognizedGroups && errorMessage ? (
          <div className="rounded-md border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
};
