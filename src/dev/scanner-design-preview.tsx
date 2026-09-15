import * as React from "react";
import { ScannerReviewLayout } from "@/components/scanner-review-layout";
import { ScannerDialog } from "@/components/scanner-dialog";
import { ScannerReceiptPanel } from "@/components/scanner-receipt-panel";
import { ScannerActionButton } from "@/components/scanner-action-button";
import { referenceBoxes, referenceImageUrl, referenceItems } from "./scanner-reference-data";
import "@/styles/scanner-tokens.css";

export default function ScannerDesignPreview(): JSX.Element {
  const [items, setItems] = React.useState(referenceItems);
  const [activeId, setActiveId] = React.useState(referenceItems[0].id);
  const [objectIndex, setObjectIndex] = React.useState(0);
  const [modal, setModal] = React.useState<"receipt" | "quantity" | null>(null);
  const [quantity, setQuantity] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const active = items.find((item) => item.id === activeId) ?? items[0];
  const groupBoxes = referenceBoxes.filter((box) => box.groupId === active.id);
  const selectItem = (id: string): void => { setActiveId(id); setObjectIndex(0); };
  const moveGroup = (step: number): void => {
    selectItem(items[Math.max(0, Math.min(items.length - 1, items.indexOf(active) + step))].id);
  };
  const validQuantity = /^\d+$/.test(quantity) && Number.isSafeInteger(Number(quantity)) && Number(quantity) >= 1;
  return <div style={{ height: "100dvh" }}>
    <ScannerReviewLayout items={items} activeItemId={active.id} activeObjectId={groupBoxes[objectIndex]?.id}
      imageUrl={referenceImageUrl} imageWidth={1000} imageHeight={700} boxes={referenceBoxes} sampleCaption="Ảnh minh họa"
      headerAction={<span style={{ fontSize: 14, color: "#57606A" }}>Bản đối chiếu · Dữ liệu mẫu</span>}
      onSelectItem={selectItem} onPreviousGroup={() => moveGroup(-1)} onNextGroup={() => moveGroup(1)}
      onPreviousObject={() => setObjectIndex((index) => Math.max(0, index - 1))}
      onNextObject={() => setObjectIndex((index) => Math.min(groupBoxes.length - 1, index + 1))}
      onEdit={() => { setQuantity(String(active.quantity)); setModal("quantity"); }}
      onReview={() => {
        setItems((current) => current.map((item) => item.id === active.id ? { ...item, reviewed: true } : item));
        const nextUnchecked = items.find((item) => item.id !== active.id && !item.reviewed);
        if (nextUnchecked) selectItem(nextUnchecked.id);
        else setModal("receipt");
      }}
      onReviewAll={() => { setItems((current) => current.map((item) => ({ ...item, reviewed: true }))); setModal("receipt"); }}
      onRetake={() => { setItems(referenceItems); selectItem(referenceItems[0].id); setNotice(""); }} />
    <ScannerDialog open={modal === "receipt"} onOpenChange={(open) => { if (!open) setModal(null); }} title="Phiếu nhập kho mẫu">
      <ScannerReceiptPanel action="stock_in" items={items.map((item) => ({ ...item, code: item.code ?? "" }))}
        onBack={() => setModal(null)} onConfirm={() => { setModal(null); setNotice("Đã đóng phiếu mẫu. Không có dữ liệu gửi tới kho."); }}
        confirmationLabel="Đóng phiếu mẫu" />
    </ScannerDialog>
    <ScannerDialog open={modal === "quantity"} onOpenChange={(open) => { if (!open) setModal(null); }} title="Sửa số lượng mẫu">
      <div style={{ padding: 32, maxWidth: 600, margin: "auto" }}>
        <h2 style={{ fontSize: 24, fontWeight: 600 }}>{active.name}</h2>
        <label htmlFor="reference-quantity" style={{ display: "block", marginTop: 24 }}>Số lượng</label>
        <input id="reference-quantity" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)}
          style={{ width: "100%", fontSize: 36, border: "1px solid #B7BFC7", borderRadius: 8, padding: 16, marginBottom: 24 }} />
        <div style={{ display: "flex", gap: 16 }}>
          <ScannerActionButton tier="normal" shortcut="0" onClick={() => setModal(null)}>Hủy</ScannerActionButton>
          <ScannerActionButton shortcut="↵" disabled={!validQuantity} onClick={() => {
            setItems((current) => current.map((item) => item.id === active.id ? { ...item, quantity: Number(quantity), reviewed: false } : item)); setModal(null);
          }}>Lưu số lượng</ScannerActionButton>
        </div>
      </div>
    </ScannerDialog>
    {notice && <div className="scanner-theme" role="status" style={{ position: "fixed", bottom: 12, left: "50%", transform: "translateX(-50%)", padding: "8px 16px", background: "white", border: "1px solid #B7BFC7", borderRadius: 8 }}>{notice}</div>}
  </div>;
}
