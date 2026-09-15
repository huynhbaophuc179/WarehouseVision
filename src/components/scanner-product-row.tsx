import { Button } from "antd";
import { useState } from "react";
import { Image as ImageIcon, Tag } from "lucide-react";

export interface ScannerProductRowProps {
  name: string;
  code?: string;
  category?: string;
  imageUrl?: string;
  quantity: number;
  selected?: boolean;
  reviewed?: boolean;
  unknown?: boolean;
  onClick?: () => void;
}

export function ScannerProductRow({
  name, code, category, imageUrl, quantity, selected = false,
  reviewed = false, unknown = false, onClick,
}: ScannerProductRowProps) {
  const [failedImage, setFailedImage] = useState<string>();
  const showImage = Boolean(imageUrl && imageUrl !== failedImage);
  const className = ["scanner-product-row", selected && "scanner-product-row--selected",
    unknown && "scanner-product-row--unknown"].filter(Boolean).join(" ");
  const validQuantity = Number.isSafeInteger(quantity) && quantity > 0;
  const content = (
    <span className="scanner-product-row__content">
      <span className="scanner-product-row__image">
        {showImage ? (
          <img src={imageUrl} alt="" onError={() => setFailedImage(imageUrl)} />
        ) : <ImageIcon size={28} strokeWidth={1.5} aria-hidden="true" />}
      </span>
      <span className="scanner-product-row__details">
        <span className="scanner-product-row__heading">
          <span className="scanner-product-row__name" title={name}>{name}</span>
          {!unknown && code && <span className="scanner-product-row__code" title={code}>{code}</span>}
        </span>
        {!unknown && category && (
          <span className="scanner-product-row__category" title={category}>
            <Tag size={16} aria-hidden="true" /><span>{category}</span>
          </span>
        )}
      </span>
      <span className="scanner-product-row__quantity" aria-label={validQuantity ? `Số lượng ${quantity}` : "Số lượng không hợp lệ"}>
        {validQuantity ? quantity.toLocaleString("vi-VN") : "—"}
      </span>
      {!reviewed && !selected && <span className="scanner-product-row__unchecked" aria-hidden="true" />}
      <span className="sr-only">{unknown ? "Chưa xác định mã hàng" : reviewed ? "Đã duyệt" : "Chưa duyệt"}</span>
    </span>
  );
  return onClick ? (
    <Button htmlType="button" className={className} onClick={onClick} aria-pressed={selected}>{content}</Button>
  ) : <div className={className}>{content}</div>;
}
