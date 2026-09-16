import { Table } from "antd";
import type { TableProps } from "antd";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import type { ProductCategory } from "@/types/api";
import { TableActionMenu } from "@/components/table-action-menu";

export type CategoryTableRow = ProductCategory | {
  id: "unclassified";
  name: string;
  product_count: number;
};

interface CategoryManagementTableProps {
  rows: CategoryTableRow[];
  loading: boolean;
  filtered: boolean;
  deleteArmedId: number | null;
  deleting: boolean;
  deletingId?: number;
  onEdit: (category: ProductCategory) => void;
  onDelete: (categoryId: number) => void;
}

export const CategoryManagementTable = ({
  rows, loading, filtered, deleteArmedId, deleting, deletingId, onEdit, onDelete,
}: CategoryManagementTableProps): JSX.Element => {
  const columns: TableProps<CategoryTableRow>["columns"] = [
    {
      title: "Phân loại",
      dataIndex: "name",
      key: "name",
      render: (name: string, category) => (
        <div>
          <p className="management-cell-name">{name}</p>
          {category.id === "unclassified" ? (
            <p className="management-cell-secondary">Các mã hàng chưa được xếp nhóm</p>
          ) : null}
        </div>
      ),
    },
    {
      title: "Số mã hàng",
      dataIndex: "product_count",
      key: "product_count",
      align: "right",
      width: 150,
      render: (count: number) => <span className="management-number">{count.toLocaleString("vi-VN")}</span>,
    },
    {
      title: "Thao tác",
      key: "actions",
      align: "right",
      width: 120,
      render: (_, category) => {
        if (category.id === "unclassified") {
          return <span className="management-cell-secondary">Mặc định</span>;
        }
        const armed = deleteArmedId === category.id;
        return (
          <TableActionMenu label={`Thao tác phân loại ${category.name}`} disabled={deleting} actions={[
            { key: "edit", label: "Đổi tên", icon: <Pencil size={16} aria-hidden="true" />, onSelect: () => onEdit(category) },
            {
              key: "delete", label: armed ? `Xác nhận xóa ${category.name}` : "Xóa phân loại",
              danger: true, keepOpen: !armed, disabled: deleting,
              icon: deleting && deletingId === category.id
                ? <Loader2 size={16} aria-hidden="true" className="animate-spin" />
                : <Trash2 size={16} aria-hidden="true" />,
              onSelect: () => onDelete(category.id),
            },
          ]} />
        );
      },
    },
  ];
  return (
    <Table<CategoryTableRow>
      className="management-table"
      size="small"
      pagination={false}
      rowKey="id"
      rowClassName={(category) => category.id === "unclassified" ? "management-row-unclassified" : ""}
      scroll={{ x: 580 }}
      loading={loading}
      dataSource={rows}
      columns={columns}
      locale={{ emptyText: filtered ? "Không tìm thấy phân loại phù hợp." : "Chưa có phân loại." }}
    />
  );
};
