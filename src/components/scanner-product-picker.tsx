import { BackButton } from "@/components/ui/back-button";
import { Input } from "@/components/ui/input";
import { Button } from "antd";
import { useState } from "react";
import { Image as ImageIcon, Tag } from "lucide-react";
import type { Product } from "@/types/api";
import { ScannerActionButton } from "./scanner-action-button";
import { ScannerKeycap } from "./scanner-keycap";

export const PAGE_SIZE = 6;

interface ScannerProductPickerProps {
  products: Product[];
  loading: boolean;
  error?: string;
  page: number;
  search: string;
  onSearch: (value: string) => void;
  onPage: (page: number) => void;
  onSelect: (product: Product) => void;
  onBack: () => void;
}

function ProductChoice({ product, shortcut, onSelect }: {
  product: Product; shortcut: number; onSelect: () => void;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const image = product.thumbnail_base64
    ? `data:image/jpeg;base64,${product.thumbnail_base64}` : undefined;
  return <Button htmlType="button" className="scanner-product-choice" onClick={onSelect}>
    <ScannerKeycap>{shortcut}</ScannerKeycap>
    <span className="scanner-product-row__image">
      {image && failedImage !== image
        ? <img src={image} alt="" onError={() => setFailedImage(image)} />
        : <ImageIcon size={28} aria-hidden="true" />}
    </span>
    <span className="scanner-product-row__details">
      <span className="scanner-product-row__heading">
        <span className="scanner-product-row__name" title={product.name}>{product.name}</span>
        <span className="scanner-product-row__code" title={product.product_id}>{product.product_id}</span>
      </span>
      <span className="scanner-product-row__category">
        <Tag size={16} aria-hidden="true" /><span>{product.category || "Chưa có danh mục"}</span>
      </span>
    </span>
  </Button>;
}

export function ScannerProductPicker({
  products, loading, error, page, search, onSearch, onPage, onSelect, onBack,
}: ScannerProductPickerProps) {
  const pageCount = Math.max(1, Math.ceil(products.length / PAGE_SIZE));
  const pageValid = Number.isInteger(page) && page >= 0 && page < pageCount;
  const available = !loading && !error && pageValid;
  const visible = available ? products.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : [];
  return <section className="scanner-workflow" aria-busy={loading}>
    <header><h2>Phân loại hàng</h2></header>
    <label className="scanner-product-search" htmlFor="scanner-product-search">
      <span><ScannerKeycap>8</ScannerKeycap> Tìm mã hoặc tên hàng</span>
      <Input id="scanner-product-search" type="search" value={search}
        onChange={(event) => onSearch(event.target.value)} autoComplete="off" />
    </label>
    <p className="scanner-workflow__hint">Nhấn phím xác nhận sau khi nhập để chọn hàng bằng các phím 1–6.</p>
    {loading && <p role="status">Đang tải danh sách hàng…</p>}
    {error && <p className="scanner-workflow__error" role="alert">{error}</p>}
    {!loading && !error && products.length === 0 && <p role="status">Không tìm thấy mã hàng phù hợp.</p>}
    {!loading && !error && !pageValid && <p role="status">Trang hàng này không còn trong danh sách. Tìm kiếm để chọn lại.</p>}
    <div className="scanner-product-picker">
      {visible.map((product, index) => <ProductChoice key={product.product_id} product={product}
        shortcut={index + 1} onSelect={() => onSelect(product)} />)}
    </div>
    {products.length >= 500 && <p className="scanner-workflow__hint">Đang hiển thị 500 mã hàng. Tìm kiếm để thu hẹp kết quả.</p>}
    <nav className="scanner-product-pages" aria-label="Trang danh sách hàng">
      <ScannerActionButton shortcut="7" tier="secondary" disabled={!available || page === 0}
        onClick={() => { if (available && page > 0) onPage(page - 1); }}>Trang trước</ScannerActionButton>
      <span role="status">Trang {pageValid ? page + 1 : "—"}/{pageCount}</span>
      <ScannerActionButton shortcut="9" tier="secondary" disabled={!available || page + 1 >= pageCount}
        onClick={() => { if (available && page + 1 < pageCount) onPage(page + 1); }}>Trang sau</ScannerActionButton>
    </nav>
    <BackButton aria-keyshortcuts="0" onClick={onBack} />
  </section>;
}
