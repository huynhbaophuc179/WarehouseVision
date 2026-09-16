import { BackButton } from "@/components/ui/back-button";
import { Table } from "antd";
import { AlertTriangle, CornerDownLeft } from "lucide-react";
import { ScannerActionButton } from "./scanner-action-button";

export interface ScannerReceiptItem {
  id: string;
  name: string;
  code: string;
  quantity: number;
}

export interface ScannerReceiptPanelProps {
  action: "stock_in" | "stock_out";
  items: ScannerReceiptItem[];
  onBack: () => void;
  onConfirm: () => void;
  pending?: boolean;
  confirmationLabel?: string;
}

export function ScannerReceiptPanel({
  action, items, onBack, onConfirm, pending = false, confirmationLabel,
}: ScannerReceiptPanelProps) {
  const stockIn = action === "stock_in";
  const total = items.reduce((sum, item) => sum + item.quantity, 0);
  const valid = items.length > 0 && Number.isSafeInteger(total)
    && items.every((item) => Number.isSafeInteger(item.quantity) && item.quantity > 0);
  return (
    <section className="scanner-receipt" aria-busy={pending}>
      <header className="scanner-receipt__header">
        <h2>{stockIn ? "Phiếu nhập kho" : "Phiếu xuất kho"}</h2>
      </header>
      <div className="scanner-receipt__table-scroll" tabIndex={0} role="region" aria-label="Danh sách hàng trên phiếu">
        <ScannerReceiptTable items={items} />
      </div>
      <div className="scanner-receipt__total"><span>Tổng số lượng</span><strong>{valid ? total.toLocaleString("vi-VN") : "—"}</strong></div>
      {!valid && <div className="scanner-receipt__warning" role="alert">
        <AlertTriangle size={24} aria-hidden="true" />
        <p>Phiếu cần có hàng với số lượng nguyên dương hợp lệ trước khi xác nhận.</p>
      </div>}
      <footer className="scanner-receipt__actions">
        <BackButton aria-keyshortcuts="0" onClick={onBack} disabled={pending} />
        <ScannerActionButton shortcut={<CornerDownLeft size={20} />} tier="primary" onClick={() => { if (valid && !pending) onConfirm(); }} disabled={pending || !valid}>
          {pending ? "Đang xác nhận…" : confirmationLabel ?? (stockIn ? "Xác nhận nhập kho" : "Xác nhận xuất kho")}
        </ScannerActionButton>
      </footer>
    </section>
  );
}

export function ScannerReceiptTable({ items }: { items: ScannerReceiptItem[] }) {
  return <Table<ScannerReceiptItem> className="scanner-receipt__table" rowKey="id"
    dataSource={items} pagination={false} size="middle" tableLayout="fixed"
    locale={{ emptyText: "Chưa có hàng trong phiếu." }}
    columns={[
      { title: "Tên hàng", dataIndex: "name", key: "name", width: "48%" },
      { title: "Mã hàng", dataIndex: "code", key: "code", width: "28%" },
      { title: "Số lượng", dataIndex: "quantity", key: "quantity", align: "right",
        render: (quantity: number) => Number.isSafeInteger(quantity) && quantity > 0 ? quantity.toLocaleString("vi-VN") : "—" },
    ]} />;
}
