import { Button } from "antd";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { ScannerActionButton } from "@/components/scanner-action-button";
import { ScannerKeycap } from "@/components/scanner-keycap";
import { ScannerProductRow } from "@/components/scanner-product-row";
import { ScannerReviewCanvas, type ScannerReviewBox } from "@/components/scanner-review-canvas";
import "@/styles/scanner-layout.css";

export type ScannerReviewItem = {
  id: string;
  name: string;
  code?: string;
  category?: string;
  imageUrl?: string;
  quantity: number;
  reviewed?: boolean;
  unknown?: boolean;
};

export interface ScannerReviewLayoutProps {
  items: ScannerReviewItem[];
  activeItemId: string;
  activeObjectId?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  boxes: ScannerReviewBox[];
  onSelectItem: (id: string) => void;
  onPreviousGroup: () => void;
  onNextGroup: () => void;
  onPreviousObject: () => void;
  onNextObject: () => void;
  onEdit: () => void;
  onReview: () => void;
  onReviewAll: () => void;
  onRetake: () => void;
  sampleCaption?: string;
  headerAction?: ReactNode;
}

export function ScannerReviewLayout({
  items, activeItemId, activeObjectId, imageUrl, imageWidth, imageHeight, boxes,
  onSelectItem, onPreviousGroup, onNextGroup, onPreviousObject, onNextObject,
  onEdit, onReview, onReviewAll, onRetake, sampleCaption, headerAction,
}: ScannerReviewLayoutProps) {
  const activeItem = items.find((item) => item.id === activeItemId);
  const reviewedCount = items.filter((item) => item.reviewed).length;
  const quantity = items.reduce((total, item) => total + item.quantity, 0);

  return (
    <section className="scanner-theme scanner-review-layout" aria-label="Rà soát kết quả nhận diện">
      <header className="scanner-review-header">
        <h1>Đối chiếu ảnh và mặt hàng</h1>
        {headerAction}
      </header>

      <div className="scanner-review-body">
        <ScannerReviewCanvas
          activeItemName={activeItem?.name}
          activeItemId={activeItemId}
          activeObjectId={activeObjectId}
          imageUrl={imageUrl}
          imageWidth={imageWidth}
          imageHeight={imageHeight}
          boxes={boxes}
          onPreviousObject={onPreviousObject}
          onNextObject={onNextObject}
          sampleCaption={sampleCaption}
        />

        <section className="scanner-review-panel" aria-label="Danh sách mã hàng">
          <header className="scanner-review-panel-header">
            <div className="scanner-review-summary">
              <h2>{items.length} mã hàng · {quantity} sản phẩm</h2>
              <p aria-live="polite">{reviewedCount} / {items.length} đã duyệt</p>
            </div>
            <div className="scanner-review-group-navigation">
              <Button htmlType="button" onClick={onPreviousGroup} disabled={items.length < 2}
                aria-label="Mã hàng trước, phím 8" aria-keyshortcuts="8">
                <ScannerKeycap>8</ScannerKeycap><ArrowUp aria-hidden="true" size={20} />
              </Button>
              <Button htmlType="button" onClick={onNextGroup} disabled={items.length < 2}
                aria-label="Mã hàng sau, phím 2" aria-keyshortcuts="2">
                <ScannerKeycap>2</ScannerKeycap><ArrowDown aria-hidden="true" size={20} />
              </Button>
            </div>
          </header>

          <ul className="scanner-review-items">
            {items.map((item) => (
              <li key={item.id}>
                <ScannerProductRow
                  name={item.name} code={item.code} category={item.category}
                  imageUrl={item.imageUrl} quantity={item.quantity}
                  selected={item.id === activeItemId} reviewed={item.reviewed}
                  unknown={item.unknown} onClick={() => onSelectItem(item.id)}
                />
              </li>
            ))}
            {items.length === 0 && <li className="scanner-review-empty">Chưa có sản phẩm để rà soát.</li>}
          </ul>

          <div className="scanner-review-panel-actions">
            <ScannerActionButton tier="secondary" shortcut="5" onClick={onEdit}
              disabled={!activeItem} aria-keyshortcuts="5">Chỉnh sửa</ScannerActionButton>
            <ScannerActionButton tier="primary" shortcut="↵" onClick={onReview}
              disabled={!activeItem || activeItem.reviewed} aria-label="Duyệt mã hàng, phím xác nhận"
              aria-keyshortcuts="Enter">Duyệt mã hàng</ScannerActionButton>
          </div>
        </section>
      </div>

      <footer className="scanner-review-footer">
        <ScannerActionButton tier="normal" shortcut="0" onClick={onRetake}
          aria-keyshortcuts="0">Chụp lại</ScannerActionButton>
        <ScannerActionButton tier="primary" shortcut="9" onClick={onReviewAll}
          disabled={items.length === 0} aria-keyshortcuts="9">Duyệt tất cả</ScannerActionButton>
      </footer>
    </section>
  );
}
