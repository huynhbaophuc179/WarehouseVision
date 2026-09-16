import { AlertTriangle, CheckCircle2, ImageOff, Loader2, PackageCheck } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ScannerDecisionViewState } from "@/lib/scannerDecisionState";
import { cn } from "@/lib/utils";
import type { InventoryAction } from "@/types/api";

interface ScannerDecisionCardProps {
  state: ScannerDecisionViewState;
  inventoryAction: InventoryAction;
  isConfirming: boolean;
  confirmMessage: string | null;
  errorMessage: string | null;
  quantityInputRef: React.RefObject<HTMLInputElement>;
  suggestionActionRef: React.RefObject<HTMLButtonElement>;
  onInventoryActionChange: (action: InventoryAction) => void;
  onAcceptSuggestion: (productId: string) => void;
  onQuantityChange: (productId: string, quantity: string) => void;
  onRequestConfirmation: () => void;
}

const inventoryActions = [
  { value: "stock_in", symbol: "+", label: "Nhập kho" },
  { value: "stock_out", symbol: "−", label: "Xuất kho" },
] as const;

const productFromState = (state: ScannerDecisionViewState) => {
  switch (state.kind) {
    case "singleGroup":
      return state.group;
    case "singleSuggestion":
      return state.suggestion;
    case "committed":
      return state.product;
    default:
      return null;
  }
};

const retakeCopy = (
  reason: Extract<ScannerDecisionViewState, { kind: "retakeRequired" }>["reason"],
): { title: string; description: string } => {
  if (reason === "multipleProducts") {
    return {
      title: "Ảnh có nhiều sản phẩm",
      description: "Chỉ đặt một sản phẩm trong vùng chụp rồi chụp lại.",
    };
  }
  if (reason === "multipleSuggestions") {
    return {
      title: "Có nhiều vùng cần kiểm tra",
      description: "Đặt một sản phẩm rõ ràng trong vùng chụp rồi chụp lại.",
    };
  }
  return {
    title: "Không tìm thấy sản phẩm",
    description: "Kiểm tra vị trí sản phẩm rồi chụp lại.",
  };
};

export const ScannerDecisionCard = ({
  state,
  inventoryAction,
  isConfirming,
  confirmMessage,
  errorMessage,
  quantityInputRef,
  suggestionActionRef,
  onInventoryActionChange,
  onAcceptSuggestion,
  onQuantityChange,
  onRequestConfirmation,
}: ScannerDecisionCardProps): JSX.Element => {
  const product = productFromState(state);
  const detection = product?.representativeDetection;
  const encodedImage = detection?.reference_image_base64 ?? detection?.crop_preview_base64;
  const thumbnailUrl = encodedImage ? `data:image/jpeg;base64,${encodedImage}` : null;
  const locked = state.kind === "committed" || isConfirming;
  const retakeMessage = state.kind === "retakeRequired" ? retakeCopy(state.reason) : null;

  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface p-3">
      <div className="grid grid-cols-2 gap-2">
        {inventoryActions.map((action) => (
          <Button
            key={action.value}
            variant="outline"
            disabled={locked}
            aria-pressed={inventoryAction === action.value}
            className={cn(
              "h-11",
              inventoryAction === action.value &&
                "border-primary bg-action text-action-content hover:bg-action-hover",
            )}
            onClick={() => onInventoryActionChange(action.value)}
          >
            <span className="text-base font-bold">{action.symbol}</span>
            {action.label}
          </Button>
        ))}
      </div>

      {state.kind === "processing" ? (
        <div className="flex items-center gap-3 rounded-md bg-subtle p-4 text-secondary">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-sm font-medium">Đang nhận diện sản phẩm...</p>
        </div>
      ) : product ? (
        <>
          <div className="flex items-center gap-3 rounded-md bg-subtle p-3">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-line bg-surface">
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt={`Ảnh sản phẩm ${product.name}`}
                  className="h-full w-full object-contain"
                />
              ) : (
                <ImageOff className="h-6 w-6 text-faint" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-content">{product.name}</p>
              <p className="truncate text-sm font-medium text-muted">{product.productId}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-xs text-muted">Tồn kho hiện tại</p>
              <p className="text-lg font-bold text-content">{product.inventoryCount ?? "-"}</p>
            </div>
          </div>

          {state.kind === "singleSuggestion" ? (
            <div className="space-y-2">
              <p className="text-sm text-secondary">Kiểm tra mã hàng trước khi nhập số lượng.</p>
              <Button
                ref={suggestionActionRef}
                className="h-11 w-full"
                onClick={() => onAcceptSuggestion(state.suggestion.productId)}
              >
                <CheckCircle2 className="h-4 w-4" />
                Dùng mã hàng này
              </Button>
            </div>
          ) : state.kind === "singleGroup" ? (
            <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
              <Button
                className="h-12"
                disabled={!state.quantityValid || locked}
                onClick={onRequestConfirmation}
              >
                <PackageCheck className="h-4 w-4" />
                Xác nhận
              </Button>
              <Input
                ref={quantityInputRef}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={state.quantity}
                disabled={locked}
                aria-label={`Số lượng ${state.group.productId}`}
                className={cn(
                  "h-12 text-center text-xl font-bold",
                  !state.quantityValid && "border-danger",
                )}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) =>
                  onQuantityChange(state.group.productId, event.target.value.replace(/\D/g, ""))
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onRequestConfirmation();
                  }
                }}
              />
            </div>
          ) : null}
        </>
      ) : state.kind === "idle" ? (
        <div className="rounded-md bg-subtle p-4 text-center text-sm font-medium text-secondary">
          Đặt một sản phẩm lên bàn rồi nhấn phím xác nhận (↵) để chụp.
        </div>
      ) : retakeMessage ? (
        <div className="flex gap-3 rounded-md border border-warning-border bg-warning-surface p-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold text-warning">{retakeMessage.title}</p>
            <p className="mt-1 text-sm text-warning">{retakeMessage.description}</p>
          </div>
        </div>
      ) : null}

      {state.kind === "committed" ? (
        <div className="flex items-center gap-2 rounded-md border border-success-border bg-success-surface px-3 py-2 text-sm font-medium text-success">
          <CheckCircle2 className="h-4 w-4" />
          {confirmMessage ?? "Đã cập nhật kho."}
        </div>
      ) : errorMessage ? (
        <div className="rounded-md border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
};
