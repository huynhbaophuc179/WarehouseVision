import { BackButton } from "@/components/ui/back-button";
import { Loader2, PackageCheck } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { InventoryProductGroup } from "@/lib/inventoryGrouping";
import type { InventoryAction } from "@/types/api";

interface ScannerConfirmDialogProps {
  open: boolean;
  group: InventoryProductGroup | null;
  quantity: string;
  inventoryAction: InventoryAction;
  canConfirm: boolean;
  isConfirming: boolean;
  errorMessage: string | null;
  confirmActionRef: React.RefObject<HTMLButtonElement>;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export const ScannerConfirmDialog = ({
  open,
  group,
  quantity,
  inventoryAction,
  canConfirm,
  isConfirming,
  errorMessage,
  confirmActionRef,
  onOpenChange,
  onConfirm,
}: ScannerConfirmDialogProps): JSX.Element => (
  <Dialog open={open} onOpenChange={(nextOpen) => { if (nextOpen || !isConfirming) onOpenChange(nextOpen); }}>
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
        <div className="my-5 rounded-lg border border-line bg-subtle p-4">
          <p className="text-lg font-semibold text-content">{group.name}</p>
          <p className="text-sm text-muted">{group.productId}</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-md bg-surface p-3">
              <p className="text-xs text-muted">Thao tác</p>
              <p className="mt-1 font-semibold text-content">
                {inventoryAction === "stock_in" ? "Nhập kho" : "Xuất kho"}
              </p>
            </div>
            <div className="rounded-md bg-surface p-3">
              <p className="text-xs text-muted">Số lượng</p>
              <p className="mt-1 text-xl font-bold text-content">{quantity}</p>
            </div>
          </div>
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mb-4 rounded-md border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger">
          {errorMessage}
        </div>
      ) : null}
      <DialogFooter className="items-start sm:justify-between">
        <BackButton disabled={isConfirming} onClick={() => onOpenChange(false)} />
        <Button ref={confirmActionRef} autoFocus disabled={!canConfirm} onClick={onConfirm}>
          {isConfirming ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <PackageCheck className="h-4 w-4" />
          )}
          {isConfirming ? "Đang cập nhật..." : "Xác nhận"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
