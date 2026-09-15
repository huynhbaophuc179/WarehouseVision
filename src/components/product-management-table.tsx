import { Table, type TableProps } from "antd";
import { Camera, Eye, Package } from "lucide-react";
import type { Product } from "@/types/api";
import { TableActionMenu } from "@/components/table-action-menu";

const stockLabel = (count: number): string => {
  if (count <= 0) return "Hết hàng";
  if (count <= 5) return "Sắp hết";
  return "Còn hàng";
};

const ProductImageCell = ({ product }: { product: Product }): JSX.Element => {
  const src = product.thumbnail_base64
    ? `data:image/jpeg;base64,${product.thumbnail_base64}`
    : null;

  return (
    <div
      className="management-thumbnail"
      title={src ? product.name : "Sản phẩm này chưa có ảnh tham chiếu"}
    >
      {src ? (
        <img src={src} alt={product.name} />
      ) : (
        <Package size={16} className="text-faint" aria-label="Chưa có ảnh tham chiếu" />
      )}
    </div>
  );
};

interface ProductManagementTableProps {
  products: Product[];
  loading: boolean;
  emptyText: string;
  onCapture: (product: Product) => void;
  onDetail: (product: Product) => void;
}

export function ProductManagementTable({
  products,
  loading,
  emptyText,
  onCapture,
  onDetail,
}: ProductManagementTableProps): JSX.Element {
  const columns: TableProps<Product>["columns"] = [
    {
      key: "image",
      title: "Ảnh",
      width: 72,
      render: (_, product) => <ProductImageCell product={product} />,
    },
    {
      key: "product",
      title: "Mã hàng",
      render: (_, product) => (
        <div>
          <button
            type="button"
            className="management-cell-name"
            onClick={() => onDetail(product)}
          >
            {product.name}
          </button>
          <span className="management-cell-secondary">{product.product_id}</span>
        </div>
      ),
    },
    {
      key: "category",
      title: "Phân loại",
      width: 150,
      render: (_, product) => product.category?.trim() || "Chưa phân loại",
    },
    {
      key: "inventory",
      title: "Tồn kho",
      width: 112,
      align: "right",
      render: (_, product) => (
        <div>
          <span className="management-number">{product.inventory_count}</span>
          <span className={`management-cell-secondary ${
            product.inventory_count <= 0 ? "text-danger" :
              product.inventory_count <= 5 ? "text-warning" : "text-success"
          }`}>
            {stockLabel(product.inventory_count)}
          </span>
        </div>
      ),
    },
    {
      key: "references",
      title: "Ảnh nhận diện",
      width: 130,
      align: "right",
      render: (_, product) => {
        const count = product.reference_image_count ?? 0;
        return count > 0
          ? <span className="management-number">{count} ảnh</span>
          : <span className="text-muted">Chưa có</span>;
      },
    },
    {
      key: "actions",
      title: "Thao tác",
      width: 116,
      align: "right",
      render: (_, product) => (
        <TableActionMenu label={`Thao tác mã hàng ${product.product_id}`} actions={[
          { key: "capture", label: "Chụp ảnh", icon: <Camera size={16} aria-hidden="true" />, onSelect: () => onCapture(product) },
          { key: "detail", label: "Xem chi tiết", icon: <Eye size={16} aria-hidden="true" />, onSelect: () => onDetail(product) },
        ]} />
      ),
    },
  ];

  return (
    <Table<Product>
      className="management-table"
      size="small"
      rowKey="product_id"
      pagination={false}
      scroll={{ x: 780 }}
      loading={loading}
      dataSource={products}
      columns={columns}
      locale={{ emptyText: loading ? "Đang tải mã hàng…" : emptyText }}
    />
  );
}
