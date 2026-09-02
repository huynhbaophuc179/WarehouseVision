import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageOff, Loader2, Package, Save, Trash2 } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  deleteProduct,
  deleteProductEmbedding,
  fetchProductDetail,
  updateProductMetadata,
} from "@/lib/api";
import type { Product, ProductDetail } from "@/types/api";

export interface ProductDetailSheetProps {
  apiBaseUrl: string;
  open: boolean;
  product: Product | null;
  categoryOptions: string[];
  onOpenChange: (open: boolean) => void;
  onUpdated: (product: Product) => void;
  onDeleted: (productId: string) => void;
  onReferencesChanged: (productId: string) => void;
}

const previewSource = (base64: string): string => `data:image/jpeg;base64,${base64}`;

export const ProductDetailSheet = ({
  apiBaseUrl,
  open,
  product,
  categoryOptions,
  onOpenChange,
  onUpdated,
  onDeleted,
  onReferencesChanged,
}: ProductDetailSheetProps): JSX.Element => {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [notice, setNotice] = React.useState<string | null>(null);
  const [deleteArmedEmbeddingId, setDeleteArmedEmbeddingId] = React.useState<number | null>(null);
  const [deleteProductArmed, setDeleteProductArmed] = React.useState(false);

  const detailQuery = useQuery<ProductDetail, Error>({
    queryKey: ["product-detail", apiBaseUrl, product?.product_id],
    queryFn: () => fetchProductDetail(apiBaseUrl, product?.product_id ?? ""),
    enabled: open && product !== null,
  });

  React.useEffect(() => {
    const detail = detailQuery.data;
    setName(detail?.name ?? product?.name ?? "");
    setCategory(detail?.category ?? product?.category ?? "");
    setNotice(null);
    setDeleteArmedEmbeddingId(null);
    setDeleteProductArmed(false);
  }, [open, product?.product_id, detailQuery.data]);

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!product) {
        throw new Error("Không tìm thấy mã hàng");
      }
      return updateProductMetadata(apiBaseUrl, {
        productId: product.product_id,
        name,
        category,
      });
    },
    onSuccess: async (updatedProduct) => {
      setNotice("Đã lưu thông tin mã hàng.");
      onUpdated(updatedProduct);
      await queryClient.invalidateQueries({
        queryKey: ["product-detail", apiBaseUrl, updatedProduct.product_id],
      });
    },
  });

  const deleteEmbeddingMutation = useMutation({
    mutationFn: (embeddingId: number) => {
      if (!product) {
        throw new Error("Không tìm thấy mã hàng");
      }
      return deleteProductEmbedding(apiBaseUrl, product.product_id, embeddingId);
    },
    onSuccess: async (result) => {
      setDeleteArmedEmbeddingId(null);
      setNotice("Đã xóa ảnh nhận diện.");
      await queryClient.invalidateQueries({
        queryKey: ["product-detail", apiBaseUrl, result.product_id],
      });
      onReferencesChanged(result.product_id);
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: () => {
      if (!product) {
        throw new Error("Không tìm thấy mã hàng");
      }
      return deleteProduct(apiBaseUrl, product.product_id);
    },
    onSuccess: (result) => {
      onDeleted(result.product_id);
      onOpenChange(false);
    },
  });

  const handleSave = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setNotice(null);
    updateMutation.mutate();
  };

  const handleDeleteEmbedding = (embeddingId: number): void => {
    if (deleteArmedEmbeddingId !== embeddingId) {
      setDeleteArmedEmbeddingId(embeddingId);
      return;
    }
    deleteEmbeddingMutation.mutate(embeddingId);
  };

  const errorMessage =
    detailQuery.error?.message ??
    updateMutation.error?.message ??
    deleteEmbeddingMutation.error?.message ??
    deleteProductMutation.error?.message;
  const detail = detailQuery.data;
  const referenceCount = detail?.reference_image_count ?? product?.reference_image_count ?? 0;
  const unchanged =
    name.trim() === (detail?.name ?? product?.name ?? "").trim() &&
    category.trim() === (detail?.category ?? product?.category ?? "").trim();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Chi tiết mã hàng</SheetTitle>
          <SheetDescription>Chỉnh thông tin, phân loại và ảnh nhận diện của mã hàng.</SheetDescription>
        </SheetHeader>

        {product ? (
          <div className="mt-6 space-y-5">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm">
                <Package className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-950">{product.product_id}</p>
                <p className="text-xs text-slate-500">Tồn kho hiện tại: {product.inventory_count}</p>
              </div>
              <Badge variant={referenceCount > 0 ? "success" : "warning"}>
                {referenceCount > 0 ? `${referenceCount} ảnh` : "Chưa có ảnh"}
              </Badge>
            </div>

            {errorMessage ? (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}
            {notice ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                {notice}
              </div>
            ) : null}

            <form className="space-y-4" onSubmit={handleSave}>
              <div className="space-y-2">
                <Label htmlFor="product-detail-name">Tên mã hàng</Label>
                <Input
                  id="product-detail-name"
                  value={name}
                  disabled={detailQuery.isLoading || updateMutation.isPending}
                  onChange={(event) => setName(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product-detail-category">Phân loại</Label>
                <Input
                  id="product-detail-category"
                  list="product-category-options"
                  value={category}
                  placeholder="Chưa phân loại"
                  disabled={detailQuery.isLoading || updateMutation.isPending}
                  onChange={(event) => setCategory(event.target.value)}
                />
                <datalist id="product-category-options">
                  {categoryOptions
                    .filter((option) => option !== "Chưa phân loại")
                    .map((option) => (
                      <option key={option} value={option} />
                    ))}
                </datalist>
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  disabled={detailQuery.isLoading || updateMutation.isPending || !name.trim() || unchanged}
                >
                  {updateMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  Lưu thay đổi
                </Button>
              </div>
            </form>

            <div className="border-t border-slate-200 pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-950">Ảnh nhận diện</h3>
                  <p className="mt-1 text-xs text-slate-500">Xóa ảnh chụp nhầm để tránh nhận diện sai.</p>
                </div>
                <span className="text-xs text-slate-500">{referenceCount} ảnh</span>
              </div>

              {detailQuery.isLoading ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Skeleton className="aspect-square w-full" />
                  <Skeleton className="aspect-square w-full" />
                  <Skeleton className="aspect-square w-full" />
                </div>
              ) : detail?.embeddings.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {detail.embeddings.map((embedding, index) => (
                    <div
                      key={embedding.id}
                      className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                    >
                      {embedding.image_preview_base64 ? (
                        <img
                          src={previewSource(embedding.image_preview_base64)}
                          alt={`Ảnh nhận diện ${index + 1}`}
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-square w-full items-center justify-center text-slate-400">
                          <ImageOff className="h-6 w-6" />
                        </div>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant={deleteArmedEmbeddingId === embedding.id ? "destructive" : "secondary"}
                        className="absolute right-2 top-2 h-8 w-8 shadow-sm"
                        disabled={deleteEmbeddingMutation.isPending}
                        title={deleteArmedEmbeddingId === embedding.id ? "Bấm lại để xác nhận xóa" : "Xóa ảnh"}
                        aria-label={deleteArmedEmbeddingId === embedding.id ? "Xác nhận xóa ảnh" : "Xóa ảnh"}
                        onClick={() => handleDeleteEmbedding(embedding.id)}
                      >
                        {deleteEmbeddingMutation.isPending &&
                        deleteEmbeddingMutation.variables === embedding.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  Chưa có ảnh nhận diện.
                </div>
              )}
            </div>

            <div className="border-t border-red-200 pt-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-3">
                <div>
                  <p className="text-sm font-semibold text-red-800">Xóa mã hàng</p>
                  <p className="mt-1 text-xs text-red-700">Ảnh nhận diện của mã hàng cũng sẽ bị xóa.</p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={deleteProductMutation.isPending}
                  onClick={() => {
                    if (!deleteProductArmed) {
                      setDeleteProductArmed(true);
                      return;
                    }
                    deleteProductMutation.mutate();
                  }}
                >
                  {deleteProductMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {deleteProductArmed ? "Bấm lại để xác nhận" : "Xóa mã hàng"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
