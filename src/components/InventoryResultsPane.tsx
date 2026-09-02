import { CheckCircle2, ImageOff, Loader2, PackageCheck } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { groupInventoryDetections, isValidInventoryQuantity } from "@/lib/inventoryGrouping";
import { cn } from "@/lib/utils";
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

const actionOptions: { value: InventoryAction; label: string; shortcut: string }[] = [
  { value: "stock_in", label: "Nhập kho", shortcut: "+" },
  { value: "stock_out", label: "Xuất kho", shortcut: "−" },
];

const cropSource = (detection: DetectionResult): string | null =>
  detection.crop_preview_base64
    ? `data:image/jpeg;base64,${detection.crop_preview_base64}`
    : null;

const productImageSource = (detection: DetectionResult): string | null =>
  detection.reference_image_base64
    ? `data:image/jpeg;base64,${detection.reference_image_base64}`
    : cropSource(detection);

interface SuggestedProduct {
  productId: string;
  name: string;
  inventoryCount: number | null;
  representativeDetection: DetectionResult;
}

const candidateScore = (detection: DetectionResult, productId: string): number => {
  const candidate = detection.candidates.find((item) => item.product_id === productId);
  return (
    candidate?.final_score ??
    candidate?.image_similarity_score ??
    detection.final_score ??
    detection.image_similarity_score ??
    0
  );
};

const buildSuggestedProduct = (
  detections: DetectionResult[],
  decisions: Record<string, DetectionDecisionState>,
): SuggestedProduct | null => {
  const suggested = detections.flatMap((detection) => {
    const state = decisions[detection.detection_id];
    if (
      detection.status !== "uncertain" ||
      !state?.selectedProductId ||
      state.decision !== "unknown"
    ) {
      return [];
    }
    return [{ detection, productId: state.selectedProductId }];
  });
  const productIds = new Set(suggested.map((item) => item.productId));
  if (productIds.size !== 1) {
    return null;
  }
  const productId = suggested[0]?.productId;
  if (!productId) {
    return null;
  }
  const representative = suggested.reduce((best, current) =>
    candidateScore(current.detection, productId) > candidateScore(best.detection, productId)
      ? current
      : best,
  );
  const candidate = representative.detection.candidates.find(
    (item) => item.product_id === productId,
  );
  return {
    productId,
    name:
      representative.detection.product_id === productId && representative.detection.name
        ? representative.detection.name
        : candidate?.name ?? candidate?.product_name ?? productId,
    inventoryCount:
      representative.detection.product_id === productId
        ? representative.detection.inventory_count
        : candidate?.inventory_count ?? null,
    representativeDetection: representative.detection,
  };
};

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
  const quantityInputRef = React.useRef<HTMLInputElement | null>(null);
  const suggestionActionRef = React.useRef<HTMLButtonElement | null>(null);
  const confirmActionRef = React.useRef<HTMLButtonElement | null>(null);
  const focusedRecognitionRef = React.useRef<number | null>(null);
  const focusedSuggestionRef = React.useRef<number | null>(null);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const { groups } = groupInventoryDetections(detections, decisions);
  const activeGroups = groups.filter((group) => !group.skipped);
  const group = activeGroups.length === 1 ? activeGroups[0] : null;
  const suggestion = group ? null : buildSuggestedProduct(detections, decisions);
  const displayedProduct = group ?? suggestion;
  const quantity = group ? quantities[group.productId] ?? "1" : "1";
  const quantityValid = group ? isValidInventoryQuantity(quantity) : false;
  const canConfirm = Boolean(group && quantityValid && !isConfirming && !committed);
  const productImageUrl = displayedProduct
    ? productImageSource(displayedProduct.representativeDetection)
    : null;

  React.useEffect(() => {
    if (
      isProcessing ||
      committed ||
      !group ||
      focusedRecognitionRef.current === recognitionVersion
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select();
      focusedRecognitionRef.current = recognitionVersion;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [committed, group, isProcessing, recognitionVersion]);

  React.useEffect(() => {
    if (
      isProcessing ||
      committed ||
      !suggestion ||
      focusedSuggestionRef.current === recognitionVersion
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      suggestionActionRef.current?.focus();
      focusedSuggestionRef.current = recognitionVersion;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [committed, isProcessing, recognitionVersion, suggestion]);

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
    <aside className="flex h-full min-h-0 flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {actionOptions.map((option) => (
          <Button
            key={option.value}
            variant="outline"
            disabled={committed || isConfirming}
            className={cn(
              "h-11",
              inventoryAction === option.value &&
                "border-slate-950 bg-slate-950 text-white hover:bg-slate-800",
            )}
            onClick={() => onInventoryActionChange(option.value)}
          >
            <span className="text-base font-bold">{option.shortcut}</span>
            {option.label}
          </Button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
        {isProcessing ? (
          <div className="flex h-full min-h-[32rem] flex-col items-center justify-center gap-3 text-slate-600">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <p className="text-sm font-medium">Đang nhận diện sản phẩm...</p>
          </div>
        ) : displayedProduct ? (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-50 p-3">
              {productImageUrl ? (
                <img
                  src={productImageUrl}
                  alt={`Ảnh sản phẩm ${displayedProduct.name}`}
                  className="max-h-full max-w-full rounded-lg object-contain"
                />
              ) : (
                <div className="flex h-full min-h-64 w-full items-center justify-center text-slate-400">
                  <ImageOff className="h-10 w-10" />
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-slate-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-lg font-semibold text-slate-950">
                      {displayedProduct.name}
                    </p>
                    {suggestion ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        Cần xác nhận
                      </span>
                    ) : null}
                  </div>
                  <p className="truncate text-sm font-medium text-slate-500">
                    {displayedProduct.productId}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-slate-500">Tồn kho hiện tại</p>
                  <p className="text-lg font-bold text-slate-950">
                    {displayedProduct.inventoryCount ?? "-"}
                  </p>
                </div>
              </div>

              {suggestion ? (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">
                    Hệ thống đã tìm thấy mã hàng này nhưng cần bạn kiểm tra trước khi cập nhật kho.
                  </p>
                  <Button
                    ref={suggestionActionRef}
                    className="h-12 w-full"
                    onClick={() => onAcceptSuggestion(suggestion.productId)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Dùng mã hàng này
                  </Button>
                  <p className="text-center text-xs text-slate-400">
                    Nhấn phím xác nhận (↵) để tiếp tục
                  </p>
                </div>
              ) : group ? (
                <>
                  <div className="grid grid-cols-[minmax(0,1fr)_110px] items-end gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500">
                        {inventoryAction === "stock_in" ? "Số lượng nhập" : "Số lượng xuất"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Nhập số rồi nhấn phím xác nhận (↵)
                      </p>
                    </div>
                    <Input
                      ref={quantityInputRef}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={quantity}
                      disabled={committed || isConfirming}
                      aria-label={`Số lượng ${group.productId}`}
                      className={cn(
                        "h-12 text-center text-xl font-bold",
                        !quantityValid && "border-red-400",
                      )}
                      onFocus={(event) => event.currentTarget.select()}
                      onChange={(event) =>
                        onQuantityChange(group.productId, event.target.value.replace(/\D/g, ""))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          requestConfirmation();
                        }
                      }}
                    />
                  </div>

                  <Button className="h-11 w-full" disabled={!canConfirm} onClick={requestConfirmation}>
                    <PackageCheck className="h-4 w-4" />
                    Xác nhận
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        ) : activeGroups.length > 1 ? (
          <div className="flex h-full min-h-[32rem] items-center justify-center p-6 text-center">
            <div className="max-w-sm">
              <p className="text-lg font-semibold text-slate-950">Ảnh có nhiều sản phẩm</p>
              <p className="mt-2 text-sm text-slate-500">
                Chỉ đặt một sản phẩm trong vùng chụp rồi chụp lại để cập nhật kho chính xác.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-[32rem] items-center justify-center p-6 text-center">
            <div className="max-w-sm">
              <ImageOff className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mt-3 text-sm font-medium text-slate-700">
                {recognitionAttempted
                  ? "Không tìm thấy sản phẩm. Nhấn phím xác nhận (↵) để chụp lại."
                  : "Đặt một sản phẩm lên bàn rồi nhấn phím xác nhận (↵) để chụp."}
              </p>
            </div>
          </div>
        )}
      </div>

      {committed ? (
        <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          {confirmMessage ?? "Đã cập nhật kho."}
        </div>
      ) : errorMessage ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <Dialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!isConfirming) {
            setConfirmOpen(open);
          }
        }}
      >
        <DialogContent
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            window.requestAnimationFrame(() => confirmActionRef.current?.focus());
          }}
        >
          <DialogHeader>
            <DialogTitle>Xác nhận cập nhật kho</DialogTitle>
            <DialogDescription>Kiểm tra mã hàng và số lượng trước khi ghi nhận.</DialogDescription>
          </DialogHeader>

          {group ? (
            <div className="my-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="text-lg font-semibold text-slate-950">{group.name}</p>
              <p className="text-sm text-slate-500">{group.productId}</p>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-md bg-white p-3">
                  <p className="text-xs text-slate-500">Thao tác</p>
                  <p className="mt-1 font-semibold text-slate-950">
                    {inventoryAction === "stock_in" ? "Nhập kho" : "Xuất kho"}
                  </p>
                </div>
                <div className="rounded-md bg-white p-3">
                  <p className="text-xs text-slate-500">Số lượng</p>
                  <p className="mt-1 text-xl font-bold text-slate-950">{quantity}</p>
                </div>
              </div>
            </div>
          ) : null}

          {errorMessage ? (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" disabled={isConfirming} onClick={() => setConfirmOpen(false)}>
              Quay lại
            </Button>
            <Button
              ref={confirmActionRef}
              autoFocus
              disabled={!canConfirm}
              onClick={onConfirm}
            >
              {isConfirming ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
              {isConfirming ? "Đang cập nhật..." : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
};
