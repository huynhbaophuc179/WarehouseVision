import { BackButton } from "@/components/ui/back-button";
import { Input } from "@/components/ui/input";
import { useEffect, useId, useRef } from "react";
import { AlertTriangle, CheckCircle2, CornerDownLeft, PackagePlus, PackageMinus } from "lucide-react";
import type { Product } from "@/types/api";
import { ScannerActionButton } from "./scanner-action-button";
import { ScannerDialog } from "./scanner-dialog";
import { ScannerProductPicker } from "./scanner-product-picker";
import { ScannerReceiptPanel, ScannerReceiptTable, type ScannerReceiptItem } from "./scanner-receipt-panel";
import "@/styles/scanner-workflow.css";

export { PAGE_SIZE } from "./scanner-product-picker";

export interface ScannerWorkflowOverlaysProps {
  overlay: "edit" | "quantity" | "classify" | "action" | "receipt" | "submitting" | "success" | "uncertain" | null;
  groupName: string;
  quantityDraft: string;
  onQuantityChange: (value: string) => void;
  onSaveQuantity: () => void;
  onEditQuantity: () => void;
  onClassify: () => void;
  products: Product[];
  productsLoading: boolean;
  productsError?: string;
  productPage: number;
  onProductPage: (page: number) => void;
  productSearch: string;
  onProductSearch: (value: string) => void;
  onSelectProduct: (product: Product) => void;
  onSelectAction: (action: "stock_in" | "stock_out") => void;
  receipt: { action: "stock_in" | "stock_out"; items: ScannerReceiptItem[] } | null;
  onConfirm: () => void;
  onBack: () => void;
  onNewScan: () => void;
  message?: string | null;
}

const titles = {
  edit: "Chỉnh sửa nhóm hàng", quantity: "Sửa số lượng", classify: "Phân loại hàng",
  action: "Chọn thao tác kho", receipt: "Kiểm tra phiếu", submitting: "Đang xác nhận phiếu",
  success: "Đã ghi kho", uncertain: "Chưa xác định kết quả",
};

export function ScannerWorkflowOverlays(props: ScannerWorkflowOverlaysProps) {
  const { overlay, receipt, onBack, message } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const quantityId = useId();
  useEffect(() => {
    if (overlay === "quantity") {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [overlay]);
  const validQuantity = /^\d+$/.test(props.quantityDraft)
    && Number.isSafeInteger(Number(props.quantityDraft)) && Number(props.quantityDraft) > 0;
  const locked = overlay === "submitting" || overlay === "success" || overlay === "uncertain";
  const completed = overlay === "success" || overlay === "uncertain";
  return <ScannerDialog open={overlay !== null} title={overlay ? titles[overlay] : "Thao tác hàng"}
    onAfterOpen={() => { if (overlay === "quantity") { inputRef.current?.focus(); inputRef.current?.select(); } }}
    dismissible={!locked} onOpenChange={(open) => { if (!open && !locked) onBack(); }}>
    {(overlay === "edit" || overlay === "quantity" || overlay === "action") &&
      <section className="scanner-workflow">
        <header><h2>{titles[overlay]}</h2><p>{overlay === "action" ? "Chọn nhập hoặc xuất kho để xem phiếu trước khi xác nhận." : props.groupName}</p></header>
        {overlay === "edit" && <>
          <ScannerActionButton shortcut="1" tier="secondary" onClick={props.onEditQuantity}>Sửa số lượng</ScannerActionButton>
          <ScannerActionButton shortcut="2" tier="secondary" onClick={props.onClassify}>Phân loại hàng</ScannerActionButton>
        </>}
        {overlay === "quantity" && <>
          <label htmlFor={quantityId}>Số lượng</label>
          <Input ref={inputRef} id={quantityId} className="scanner-quantity-input" inputMode="numeric"
            value={props.quantityDraft} onChange={(event) => props.onQuantityChange(event.target.value)}
            aria-invalid={!validQuantity} aria-describedby={`${quantityId}-hint`} autoComplete="off" />
          <p id={`${quantityId}-hint`} className="scanner-workflow__hint">Nhập số nguyên từ 1 trở lên. Bật khóa số để nhập 0 trong số lượng; tắt khóa số rồi nhấn 0 để hủy.</p>
          {!validQuantity && <p className="scanner-workflow__error" role="status">Số lượng phải là số nguyên dương trong giới hạn cho phép.</p>}
        </>}
        {overlay === "action" && <div className="scanner-stock-actions">
          <ScannerActionButton shortcut="1" tier="primary" className="scanner-stock-choice"
            aria-keyshortcuts="1" onClick={() => props.onSelectAction("stock_in")}>
            <PackagePlus size={36} aria-hidden="true" />
            <span>Nhập kho</span>
          </ScannerActionButton>
          <ScannerActionButton shortcut="2" tier="primary" className="scanner-stock-choice scanner-stock-choice--out"
            aria-keyshortcuts="2" onClick={() => props.onSelectAction("stock_out")}>
            <PackageMinus size={36} aria-hidden="true" />
            <span>Xuất kho</span>
          </ScannerActionButton>
        </div>}
        {message && <p className="scanner-workflow__error" role="alert">{message}</p>}
        <footer className={overlay === "quantity" ? "scanner-workflow__actions" : undefined}>
          {overlay === "quantity"
            ? <ScannerActionButton shortcut="0" tier="secondary" onClick={onBack}>Hủy</ScannerActionButton>
            : <BackButton aria-keyshortcuts="0" onClick={onBack} />}
          {overlay === "quantity" && <ScannerActionButton shortcut={<CornerDownLeft size={20} aria-hidden="true" />}
            tier="primary" disabled={!validQuantity} onClick={() => { if (validQuantity) props.onSaveQuantity(); }}>Lưu số lượng</ScannerActionButton>}
        </footer>
      </section>}
    {overlay === "classify" && <ScannerProductPicker products={props.products} loading={props.productsLoading}
      error={props.productsError} page={props.productPage} search={props.productSearch} onSearch={props.onProductSearch}
      onPage={props.onProductPage} onSelect={props.onSelectProduct} onBack={onBack} />}
    {(overlay === "receipt" || overlay === "submitting") && receipt && <>
      {message && <p className="scanner-workflow__notice" role="alert">{message}</p>}
      <ScannerReceiptPanel action={receipt.action} items={receipt.items} onBack={onBack}
        onConfirm={props.onConfirm} pending={overlay === "submitting"} />
    </>}
    {completed && <section className="scanner-workflow scanner-workflow--result">
      <header className="scanner-workflow__result-heading">
        {overlay === "success" ? <CheckCircle2 size={32} aria-hidden="true" /> : <AlertTriangle size={32} aria-hidden="true" />}
        <h2>{titles[overlay]}</h2>
      </header>
      <p role={overlay === "uncertain" ? "alert" : "status"} className="scanner-workflow__message">
        {message || (overlay === "success" ? "Yêu cầu đã được xác nhận." : "Chưa thể xác định yêu cầu đã ghi kho hay chưa.")}
      </p>
      {overlay === "uncertain" && <p>Giữ thông tin phiếu để đối chiếu và liên hệ người phụ trách kho trước khi thao tác tiếp. Không gửi lại phiếu hoặc tạo lại giao dịch này.</p>}
      {receipt && <>
        <h3>{receipt.action === "stock_in" ? "Thông tin phiếu nhập kho" : "Thông tin phiếu xuất kho"}</h3>
        <div className="scanner-receipt__table-scroll" role="region" tabIndex={0} aria-label="Thông tin phiếu đã gửi">
          <ScannerReceiptTable items={receipt.items} />
        </div>
      </>}
      {overlay === "success"
        ? <ScannerActionButton shortcut={<CornerDownLeft size={20} aria-hidden="true" />} tier="primary" onClick={props.onNewScan}>Quét lượt mới</ScannerActionButton>
        : <BackButton aria-keyshortcuts="0" disabled onClick={onBack} />}
    </section>}
  </ScannerDialog>;
}
