import { Button } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import * as React from "react";
import { CategoryForm } from "@/components/category-form";
import { CategoryManagementTable, type CategoryTableRow } from "@/components/category-management-table";
import { ManagementFilters } from "@/components/management-filters";
import { ManagementPage } from "@/components/management-page";
import { ManagementPagination } from "@/components/management-pagination";
import { getPaginationBounds, normalizeListSearch } from "@/lib/management-list";
import {
  createProductCategory,
  deleteProductCategory,
  fetchProductCategories,
  updateProductCategory,
} from "@/lib/api";
import type { ProductCategory } from "@/types/api";

export interface CategoryManagementPageProps {
  apiBaseUrl: string;
}

export const CategoryManagementPage = ({
  apiBaseUrl,
}: CategoryManagementPageProps): JSX.Element => {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [editingCategory, setEditingCategory] =
    React.useState<ProductCategory | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [deleteArmedId, setDeleteArmedId] = React.useState<number | null>(null);

  const categoryQuery = useQuery({
    queryKey: ["product-categories", apiBaseUrl],
    queryFn: () => fetchProductCategories(apiBaseUrl),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      editingCategory
        ? updateProductCategory(apiBaseUrl, editingCategory.id, name)
        : createProductCategory(apiBaseUrl, name),
    onSuccess: async (category) => {
      setNotice(
        editingCategory
          ? `Đã đổi tên phân loại thành ${category.name}.`
          : `Đã tạo phân loại ${category.name}.`,
      );
      setSheetOpen(false);
      setEditingCategory(null);
      setName("");
      await queryClient.invalidateQueries({
        queryKey: ["product-categories", apiBaseUrl],
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (categoryId: number) =>
      deleteProductCategory(apiBaseUrl, categoryId),
    onSuccess: async (result) => {
      setDeleteArmedId(null);
      setNotice(
        result.cleared_product_count > 0
          ? `Đã xóa ${result.name}. ${result.cleared_product_count} mã hàng được chuyển về chưa phân loại.`
          : `Đã xóa ${result.name}.`,
      );
      await queryClient.invalidateQueries({
        queryKey: ["product-categories", apiBaseUrl],
      });
    },
  });

  const openCreateSheet = (): void => {
    setEditingCategory(null);
    setName("");
    setSheetOpen(true);
  };

  const openEditSheet = (category: ProductCategory): void => {
    setEditingCategory(category);
    setName(category.name);
    setSheetOpen(true);
  };

  const handleSave = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }
    setNotice(null);
    saveMutation.mutate();
  };

  const handleDelete = (categoryId: number): void => {
    if (deleteArmedId !== categoryId) {
      setDeleteArmedId(categoryId);
      return;
    }
    setNotice(null);
    deleteMutation.mutate(categoryId);
  };

  const categories = categoryQuery.data?.categories ?? [];
  const unclassifiedCount = categoryQuery.data?.unclassified_product_count ?? 0;
  const allRows: CategoryTableRow[] = [
    { id: "unclassified", name: "Chưa phân loại", product_count: unclassifiedCount },
    ...categories,
  ];
  const normalizedSearch = normalizeListSearch(search);
  const filteredRows = allRows.filter((category) =>
    normalizeListSearch(category.name).includes(normalizedSearch),
  );
  const bounds = getPaginationBounds(filteredRows.length, page, pageSize);
  const pagedRows = filteredRows.slice((bounds.page - 1) * pageSize, bounds.page * pageSize);
  React.useEffect(() => {
    if (page !== bounds.page) setPage(bounds.page);
  }, [page, bounds.page]);
  const changeSearch = (value: string): void => {
    setSearch(value);
    setPage(1);
  };
  const errorMessage =
    categoryQuery.error?.message ??
    saveMutation.error?.message ??
    deleteMutation.error?.message;

  return (
    <>
      <ManagementPage
        title="Phân loại"
        description="Sắp xếp mã hàng theo nhóm và theo dõi số mã hàng trong từng phân loại."
        actions={
          <Button className="app-success-action" color="green" variant="solid" icon={<Plus size={16} aria-hidden="true" />} onClick={openCreateSheet}>
            Thêm phân loại
          </Button>
        }
        filters={
          <ManagementFilters search={search} onSearchChange={changeSearch}
            placeholder="Tìm tên phân loại" active={search.length > 0} onReset={() => changeSearch("")} />
        }
        summary={<><strong>{filteredRows.length.toLocaleString("vi-VN")}</strong> phân loại{normalizedSearch ? ` / ${allRows.length.toLocaleString("vi-VN")}` : ""}</>}
        notice={notice}
        error={errorMessage}
        pagination={
          <ManagementPagination total={filteredRows.length} page={bounds.page} pageSize={pageSize}
            onChange={(nextPage, nextPageSize) => {
              setPage(nextPageSize !== pageSize ? 1 : nextPage);
              setPageSize(nextPageSize);
            }} />
        }
      >
        <CategoryManagementTable rows={pagedRows} loading={categoryQuery.isLoading}
          filtered={Boolean(normalizedSearch)} deleteArmedId={deleteArmedId}
          deleting={deleteMutation.isPending} deletingId={deleteMutation.variables}
          onEdit={openEditSheet} onDelete={handleDelete} />
      </ManagementPage>
      <CategoryForm open={sheetOpen} editing={Boolean(editingCategory)} name={name}
        pending={saveMutation.isPending} error={saveMutation.error?.message}
        onNameChange={setName} onSubmit={handleSave} onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setEditingCategory(null);
            setName("");
            saveMutation.reset();
          }
        }} />
    </>
  );
};
