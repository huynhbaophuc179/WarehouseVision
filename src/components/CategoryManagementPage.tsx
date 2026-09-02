import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Boxes, Loader2, Pencil, Plus, Tags, Trash2 } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
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
  const [editingCategory, setEditingCategory] = React.useState<ProductCategory | null>(null);
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
      await queryClient.invalidateQueries({ queryKey: ["product-categories", apiBaseUrl] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (categoryId: number) => deleteProductCategory(apiBaseUrl, categoryId),
    onSuccess: async (result) => {
      setDeleteArmedId(null);
      setNotice(
        result.cleared_product_count > 0
          ? `Đã xóa ${result.name}. ${result.cleared_product_count} mã hàng được chuyển về chưa phân loại.`
          : `Đã xóa ${result.name}.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["product-categories", apiBaseUrl] });
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
  const totalAssignedProducts = categories.reduce(
    (total, category) => total + category.product_count,
    0,
  );
  const errorMessage =
    categoryQuery.error?.message ?? saveMutation.error?.message ?? deleteMutation.error?.message;

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex h-12 shrink-0 items-center justify-between bg-blue-600 px-4 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <Tags className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Quản lý phân loại</p>
            <p className="text-xs text-blue-100">{categories.length} phân loại đang sử dụng</p>
          </div>
        </div>
        <Button
          variant="success"
          size="sm"
          className="h-8 border border-emerald-500"
          onClick={openCreateSheet}
        >
          <Plus className="h-4 w-4" />
          Thêm phân loại
        </Button>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-3 border-b border-slate-200 p-3 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Phân loại</p>
              <p className="mt-1 text-xl font-bold text-slate-950">{categories.length}</p>
            </div>
            <Tags className="h-5 w-5 text-slate-400" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Đã phân loại</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">{totalAssignedProducts}</p>
            </div>
            <Boxes className="h-5 w-5 text-slate-400" />
          </CardContent>
        </Card>
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="flex items-center justify-between p-3">
            <div>
              <p className="text-xs font-medium text-slate-500">Chưa phân loại</p>
              <p className="mt-1 text-xl font-bold text-amber-700">{unclassifiedCount}</p>
            </div>
            <Badge variant={unclassifiedCount > 0 ? "warning" : "success"}>
              {unclassifiedCount > 0 ? "Cần bổ sung" : "Đã hoàn tất"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {notice ? (
        <div className="mx-3 mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      ) : null}
      {errorMessage ? (
        <div className="mx-3 mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="grid grid-cols-[minmax(220px,1fr)_160px_120px] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase text-slate-600">
            <div className="px-4 py-3">Phân loại</div>
            <div className="px-4 py-3 text-center">Số mã hàng</div>
            <div className="px-4 py-3 text-right">Thao tác</div>
          </div>

          {categoryQuery.isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <>
              <div className="grid min-h-14 grid-cols-[minmax(220px,1fr)_160px_120px] items-center border-b border-slate-200 bg-amber-50/50">
                <div className="px-4 py-2">
                  <p className="text-sm font-semibold text-slate-950">Chưa phân loại</p>
                  <p className="text-xs text-slate-500">Các mã hàng chưa được xếp nhóm</p>
                </div>
                <div className="px-4 py-2 text-center text-sm font-semibold text-slate-950">
                  {unclassifiedCount}
                </div>
                <div className="px-4 py-2 text-right text-xs text-slate-400">Mặc định</div>
              </div>

              {categories.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-slate-500">
                  Chưa có phân loại nào.
                </div>
              ) : (
                categories.map((category) => (
                  <div
                    key={category.id}
                    className="grid min-h-14 grid-cols-[minmax(220px,1fr)_160px_120px] items-center border-b border-slate-200 last:border-b-0 hover:bg-slate-50"
                  >
                    <div className="min-w-0 px-4 py-2">
                      <p className="truncate text-sm font-semibold text-slate-950">{category.name}</p>
                    </div>
                    <div className="px-4 py-2 text-center text-sm font-semibold text-slate-950">
                      {category.product_count}
                    </div>
                    <div className="flex justify-end gap-1 px-4 py-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        title="Đổi tên"
                        aria-label={`Đổi tên ${category.name}`}
                        onClick={() => openEditSheet(category)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant={deleteArmedId === category.id ? "destructive" : "outline"}
                        size="icon"
                        className="h-8 w-8"
                        disabled={deleteMutation.isPending}
                        title={deleteArmedId === category.id ? "Bấm lại để xác nhận xóa" : "Xóa phân loại"}
                        aria-label={deleteArmedId === category.id ? `Xác nhận xóa ${category.name}` : `Xóa ${category.name}`}
                        onClick={() => handleDelete(category.id)}
                      >
                        {deleteMutation.isPending && deleteMutation.variables === category.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </>
          )}
        </div>
      </div>

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) {
            setEditingCategory(null);
            setName("");
            saveMutation.reset();
          }
        }}
      >
        <SheetContent className="max-w-md">
          <SheetHeader>
            <SheetTitle>{editingCategory ? "Đổi tên phân loại" : "Thêm phân loại"}</SheetTitle>
            <SheetDescription>
              {editingCategory
                ? "Tên mới sẽ được cập nhật cho tất cả mã hàng trong phân loại này."
                : "Tạo phân loại trước rồi gán mã hàng trong màn chi tiết sản phẩm."}
            </SheetDescription>
          </SheetHeader>
          <form className="mt-6 space-y-4" onSubmit={handleSave}>
            {saveMutation.error ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {saveMutation.error.message}
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="category-name">Tên phân loại</Label>
              <Input
                id="category-name"
                autoFocus
                value={name}
                placeholder="Nhập tên phân loại"
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={!name.trim() || saveMutation.isPending}>
                {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingCategory ? "Lưu thay đổi" : "Tạo phân loại"}
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>
    </section>
  );
};
