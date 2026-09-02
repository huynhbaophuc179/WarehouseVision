import {
  Boxes,
  Camera,
  Eye,
  FileDown,
  Image,
  Loader2,
  Package,
  Plus,
  Search,
  Tags,
  UploadCloud,
  X,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CameraImageCapture } from "@/components/CameraImageCapture";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductImageCropCard, type ProductImageEntry } from "@/components/ProductImageCropCard";
import { ProductDetailSheet } from "@/components/ProductDetailSheet";
import { ProductReferenceCaptureSheet } from "@/components/ProductReferenceCaptureSheet";
import {
  addProductEmbedding,
  batchImportProducts,
  createProductWithImage,
  fetchProductCategories,
  fetchProducts,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  Product,
  ProductBatchImportResponse,
  ProductBatchImportRow,
  ProductReferenceCapture,
} from "@/types/api";

export interface ProductManagementPageProps {
  apiBaseUrl: string;
}

type ImageFilter = "all" | "missing" | "with_image";
type StockFilter = "all" | "available" | "low" | "empty";

const pageSize = 20;

interface NewProductFormState {
  productId: string;
  name: string;
  category: string;
  inventoryCount: string;
  useFullImage: boolean;
}

const imageFilterOptions: { value: ImageFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "missing", label: "Chưa có ảnh" },
  { value: "with_image", label: "Đã có ảnh" },
];

const stockFilterOptions: { value: StockFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "available", label: "Còn hàng" },
  { value: "low", label: "Sắp hết" },
  { value: "empty", label: "Hết hàng" },
];

const imageSrc = (base64?: string | null): string | null =>
  base64 ? `data:image/jpeg;base64,${base64}` : null;

const productGridClass = "flex items-center";

const stockTone = (product: Product): "success" | "warning" | "destructive" => {
  if (product.inventory_count <= 0) {
    return "destructive";
  }
  if (product.inventory_count <= 5) {
    return "warning";
  }
  return "success";
};

const stockLabel = (product: Product): string => {
  if (product.inventory_count <= 0) {
    return "Hết hàng";
  }
  if (product.inventory_count <= 5) {
    return "Sắp hết";
  }
  return "Còn hàng";
};

const importStatusLabel = (status: ProductBatchImportRow["status"]): string => {
  if (status === "created") {
    return "Tạo mới";
  }
  if (status === "updated") {
    return "Cập nhật";
  }
  if (status === "failed") {
    return "Lỗi";
  }
  return status;
};

const importStatusTone = (
  status: ProductBatchImportRow["status"],
): "success" | "warning" | "destructive" | "secondary" => {
  if (status === "created") {
    return "success";
  }
  if (status === "updated") {
    return "warning";
  }
  if (status === "failed") {
    return "destructive";
  }
  return "secondary";
};

const filterProducts = (
  products: Product[],
  imageFilter: ImageFilter,
  categoryFilter: string,
  stockFilter: StockFilter,
): Product[] => {
  const filtered = products.filter((product) => {
    const imageMatched =
      imageFilter === "all" ||
      (imageFilter === "with_image" && (product.reference_image_count ?? 0) > 0) ||
      (imageFilter === "missing" && (product.reference_image_count ?? 0) === 0);
    const categoryMatched =
      categoryFilter === "all" || (product.category?.trim() || "Chưa phân loại") === categoryFilter;
    const stockMatched =
      stockFilter === "all" ||
      (stockFilter === "available" && product.inventory_count > 5) ||
      (stockFilter === "low" && product.inventory_count > 0 && product.inventory_count <= 5) ||
      (stockFilter === "empty" && product.inventory_count <= 0);
    return imageMatched && categoryMatched && stockMatched;
  });

  return [...filtered].sort((first, second) => {
    const nameDifference = first.name.localeCompare(second.name, "vi", {
      sensitivity: "base",
    });
    return nameDifference || first.product_id.localeCompare(second.product_id, "vi");
  });
};

const ProductImageCell = ({ product }: { product: Product }): JSX.Element => {
  const src = imageSrc(product.thumbnail_base64);

  return (
    <div
      className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50"
      title={src ? product.name : "Sản phẩm này chưa có ảnh tham chiếu"}
    >
      {src ? (
        <img src={src} alt={product.name} className="h-10 w-10 rounded-md object-cover" />
      ) : (
        <Package className="h-4 w-4 text-slate-400" />
      )}
    </div>
  );
};

const createImageEntryId = (): string =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createImageEntry = (file: File): ProductImageEntry => ({
  id: createImageEntryId(),
  file,
  selectedBox: null,
  croppedFile: null,
  cropPreviewUrl: null,
});

export const ProductManagementPage = ({ apiBaseUrl }: ProductManagementPageProps): JSX.Element => {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [imageFilter, setImageFilter] = React.useState<ImageFilter>("all");
  const [stockFilter, setStockFilter] = React.useState<StockFilter>("all");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [categoryOptions, setCategoryOptions] = React.useState<string[]>([]);
  const [createSheetOpen, setCreateSheetOpen] = React.useState(false);
  const [importSheetOpen, setImportSheetOpen] = React.useState(false);
  const [captureProduct, setCaptureProduct] = React.useState<Product | null>(null);
  const [detailProduct, setDetailProduct] = React.useState<Product | null>(null);
  const [newProduct, setNewProduct] = React.useState<NewProductFormState>({
    productId: "",
    name: "",
    category: "",
    inventoryCount: "0",
    useFullImage: true,
  });
  const [newProductImages, setNewProductImages] = React.useState<ProductImageEntry[]>([]);
  const [createErrorMessage, setCreateErrorMessage] = React.useState<string | null>(null);
  const [batchCsvFile, setBatchCsvFile] = React.useState<File | null>(null);
  const [batchImporting, setBatchImporting] = React.useState(false);
  const [batchImportResult, setBatchImportResult] = React.useState<ProductBatchImportResponse | null>(null);
  const [batchImportError, setBatchImportError] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const deferredSearch = React.useDeferredValue(search);
  const [refreshToken, setRefreshToken] = React.useState(0);

  const visibleProducts = React.useMemo(
    () => filterProducts(products, imageFilter, categoryFilter, stockFilter),
    [products, imageFilter, categoryFilter, stockFilter],
  );

  const categoryCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    products.forEach((product) => {
      const category = product.category?.trim() || "Chưa phân loại";
      counts.set(category, (counts.get(category) ?? 0) + 1);
    });
    return counts;
  }, [products]);

  const imageCounts = React.useMemo(
    () => ({
      all: products.length,
      missing: products.filter((product) => (product.reference_image_count ?? 0) === 0).length,
      with_image: products.filter((product) => (product.reference_image_count ?? 0) > 0).length,
    }),
    [products],
  );

  const stockCounts = React.useMemo(
    () => ({
      all: products.length,
      available: products.filter((product) => product.inventory_count > 5).length,
      low: products.filter(
        (product) => product.inventory_count > 0 && product.inventory_count <= 5,
      ).length,
      empty: products.filter((product) => product.inventory_count <= 0).length,
    }),
    [products],
  );

  React.useEffect(() => {
    setTotalPages(Math.max(1, Math.ceil(visibleProducts.length / pageSize)));
    setPage((currentPage) => Math.min(currentPage, Math.max(1, Math.ceil(visibleProducts.length / pageSize))));
  }, [visibleProducts.length]);

  React.useEffect(() => {
    setPage(1);
  }, [deferredSearch, imageFilter, categoryFilter, stockFilter]);

  React.useEffect(() => {
    let active = true;
    setLoading(true);
    setErrorMessage(null);
    fetchProducts(apiBaseUrl, deferredSearch, 500)
      .then((result) => {
        if (!active) {
          return;
        }
        setProducts(result);
      })
      .catch((error: Error) => {
        if (!active) {
          return;
        }
        setErrorMessage(error.message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [apiBaseUrl, deferredSearch, refreshToken]);

  React.useEffect(() => {
    let active = true;
    fetchProductCategories(apiBaseUrl)
      .then((result) => {
        if (!active) {
          return;
        }
        setCategoryOptions([
          "Chưa phân loại",
          ...result.categories.map((category) => category.name),
        ]);
      })
      .catch((error: Error) => {
        if (active) {
          setErrorMessage(error.message);
        }
      });

    return () => {
      active = false;
    };
  }, [apiBaseUrl, refreshToken]);

  const pagedProducts = visibleProducts.slice((page - 1) * pageSize, page * pageSize);

  const resetCreateForm = (): void => {
    newProductImages.forEach((entry) => {
      if (entry.cropPreviewUrl) {
        URL.revokeObjectURL(entry.cropPreviewUrl);
      }
    });
    setNewProduct({
      productId: "",
      name: "",
      category: "",
      inventoryCount: "0",
      useFullImage: true,
    });
    setNewProductImages([]);
    setCreateErrorMessage(null);
  };

  const appendNewProductImages = (files: File[]): void => {
    if (files.length === 0) {
      return;
    }
    setNewProductImages((currentImages) => [
      ...currentImages,
      ...files.map(createImageEntry),
    ]);
  };

  const clearNewProductImages = (): void => {
    setNewProductImages((currentImages) => {
      currentImages.forEach((entry) => {
        if (entry.cropPreviewUrl) {
          URL.revokeObjectURL(entry.cropPreviewUrl);
        }
      });
      return [];
    });
  };

  const handleImageCropChange = (
    id: string,
    selectedBox: ProductImageEntry["selectedBox"],
    croppedFile: File | null,
    cropPreviewUrl: string | null,
  ): void => {
    setNewProductImages((currentImages) =>
      currentImages.map((entry) => {
        if (entry.id !== id) {
          return entry;
        }
        if (entry.cropPreviewUrl && entry.cropPreviewUrl !== cropPreviewUrl) {
          URL.revokeObjectURL(entry.cropPreviewUrl);
        }
        return {
          ...entry,
          selectedBox,
          croppedFile,
          cropPreviewUrl,
        };
      }),
    );
  };

  const handleDeleteNewProductImage = (id: string): void => {
    setNewProductImages((currentImages) => {
      const target = currentImages.find((entry) => entry.id === id);
      if (target?.cropPreviewUrl) {
        URL.revokeObjectURL(target.cropPreviewUrl);
      }
      return currentImages.filter((entry) => entry.id !== id);
    });
  };

  const handleCreateProduct = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const productId = newProduct.productId.trim();
    const productName = newProduct.name.trim();
    const inventoryCount = Math.max(0, Number.parseInt(newProduct.inventoryCount || "0", 10) || 0);
    const [primaryImage, ...additionalImages] = newProductImages;

    if (!productId || !productName) {
      setCreateErrorMessage("Cần nhập mã sản phẩm và tên sản phẩm.");
      return;
    }
    setCreating(true);
    setCreateErrorMessage(null);
    setNotice(null);
    createProductWithImage(apiBaseUrl, {
      productId,
      name: productName,
      category: newProduct.category.trim() || undefined,
      inventoryCount,
      file: primaryImage ? primaryImage.croppedFile ?? primaryImage.file : undefined,
    })
      .then(async (createdProduct) => {
        for (const imageEntry of additionalImages) {
          await addProductEmbedding(apiBaseUrl, {
            productId,
            file: imageEntry.croppedFile ?? imageEntry.file,
            useFullImage: imageEntry.croppedFile ? true : newProduct.useFullImage,
          });
        }
        setNotice(primaryImage
          ? newProductImages.length > 1
            ? `Đã thêm ${productId} với ${newProductImages.length} ảnh tham chiếu.`
            : `Đã thêm ${productId}.`
          : `Đã tạo mã ${productId}. Hãy chụp ảnh để hệ thống nhận biết sản phẩm.`,
        );
        resetCreateForm();
        setCreateSheetOpen(false);
        if (!primaryImage) {
          setCaptureProduct({
            ...createdProduct,
            embedding_count: 0,
            approved_embedding_count: 0,
            pending_embedding_count: 0,
            reference_image_count: 0,
            thumbnail_base64: null,
          });
        }
        setRefreshToken((currentToken) => currentToken + 1);
      })
      .catch((error: Error) => setCreateErrorMessage(error.message))
      .finally(() => setCreating(false));
  };

  const downloadSampleSpreadsheet = (): void => {
    const link = document.createElement("a");
    link.href = "/mau_nhap_ma_hang.xlsx";
    link.download = "mau_nhap_ma_hang.xlsx";
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const runBatchImport = (dryRun: boolean): void => {
    if (!batchCsvFile) {
      setBatchImportError("Cần chọn tệp bảng tính chứa danh sách mã hàng.");
      return;
    }
    setBatchImporting(true);
    setBatchImportError(null);
    batchImportProducts(apiBaseUrl, {
      csvFile: batchCsvFile,
      dryRun,
    })
      .then((result) => {
        setBatchImportResult(result);
        if (!dryRun) {
          setNotice(
            `Đã nhập ${result.created_count + result.updated_count} mã hàng.`,
          );
          setRefreshToken((currentToken) => currentToken + 1);
        }
      })
      .catch((error: Error) => setBatchImportError(error.message))
      .finally(() => setBatchImporting(false));
  };

  const resetBatchImport = (): void => {
    setBatchCsvFile(null);
    setBatchImportResult(null);
    setBatchImportError(null);
  };

  const handleReferenceCaptured = (result: ProductReferenceCapture): void => {
    setProducts((currentProducts) =>
      currentProducts.map((product) =>
        product.product_id === result.product_id
          ? {
              ...product,
              embedding_count: (product.embedding_count ?? 0) + 1,
              approved_embedding_count: (product.approved_embedding_count ?? 0) + 1,
              reference_image_count: result.reference_image_count,
              thumbnail_base64: result.crop_preview_base64,
            }
          : product,
      ),
    );
    setNotice(`Đã ghi nhận ảnh cho ${result.product_id}.`);
  };

  const handleProductUpdated = (updatedProduct: Product): void => {
    setProducts((currentProducts) =>
      currentProducts.map((product) =>
        product.product_id === updatedProduct.product_id
          ? { ...product, ...updatedProduct }
          : product,
      ),
    );
    setDetailProduct((currentProduct) =>
      currentProduct?.product_id === updatedProduct.product_id
        ? { ...currentProduct, ...updatedProduct }
        : currentProduct,
    );
    setNotice(`Đã cập nhật ${updatedProduct.product_id}.`);
  };

  const handleProductDeleted = (productId: string): void => {
    setProducts((currentProducts) =>
      currentProducts.filter((product) => product.product_id !== productId),
    );
    setDetailProduct(null);
    setNotice(`Đã xóa ${productId}.`);
  };

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex h-12 shrink-0 items-center justify-between bg-blue-600 px-4 text-white">
        <div className="flex min-w-0 items-center gap-3">
          <Boxes className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Danh sách mã hàng</p>
            <p className="text-xs text-blue-100">{products.length} mã trong hệ thống</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="success"
            size="sm"
            className="h-8 border border-emerald-500"
            onClick={() => setCreateSheetOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Thêm mã hàng
          </Button>
          <Button
            variant="success"
            size="sm"
            className="h-8 border border-emerald-500"
            onClick={() => setImportSheetOpen(true)}
          >
            <UploadCloud className="mr-2 h-4 w-4" />
            Nhập danh sách
          </Button>
        </div>
      </div>

      <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
        <SheetContent className="max-w-4xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Thêm mã hàng</SheetTitle>
            <SheetDescription>
              Tạo mã hàng trước, ảnh có thể chụp ngay hoặc bổ sung sau.
            </SheetDescription>
          </SheetHeader>
          <form className="mt-6 space-y-5" onSubmit={handleCreateProduct}>
            {createErrorMessage && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {createErrorMessage}
              </div>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-product-id">Mã hàng</Label>
                <Input
                  id="new-product-id"
                  value={newProduct.productId}
                  placeholder="VD: NUT_XANH_01"
                  onChange={(event) =>
                    setNewProduct((current) => ({ ...current, productId: event.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-product-stock">Tồn kho ban đầu</Label>
                <Input
                  id="new-product-stock"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={newProduct.inventoryCount}
                  onChange={(event) => {
                    const nextValue = event.target.value.replace(/\D/g, "");
                    setNewProduct((current) => ({
                      ...current,
                      inventoryCount: nextValue,
                    }));
                  }}
                />
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="new-product-name">Tên mã hàng</Label>
                <Input
                  id="new-product-name"
                  value={newProduct.name}
                  placeholder="VD: Nút xanh phi 22"
                  onChange={(event) => setNewProduct((current) => ({ ...current, name: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-product-category">Phân loại</Label>
                <Input
                  id="new-product-category"
                  value={newProduct.category}
                  placeholder="VD: Nút nhấn"
                  onChange={(event) =>
                    setNewProduct((current) => ({ ...current, category: event.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ảnh nhận diện</Label>
              <CameraImageCapture
                disabled={creating}
                onCapture={(file) => appendNewProductImages([file])}
                onFilesSelected={appendNewProductImages}
              />
              <p className="text-xs text-slate-500">
                Không bắt buộc. Có thể tạo mã trước rồi chụp ảnh sau; nếu thêm ảnh ngay, mỗi ảnh đều có thể cắt và xoá riêng.
              </p>
            </div>
            {newProductImages.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-950">{newProductImages.length} ảnh đã chọn</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-slate-500"
                    onClick={clearNewProductImages}
                  >
                    <X className="mr-2 h-4 w-4" />
                    Xoá ảnh
                  </Button>
                </div>
                <div className="space-y-3">
                  {newProductImages.map((entry, index) => (
                    <ProductImageCropCard
                      key={entry.id}
                      entry={entry}
                      index={index}
                      onCropChange={handleImageCropChange}
                      onDelete={handleDeleteNewProductImage}
                    />
                  ))}
                </div>
              </div>
            )}
            <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300"
                checked={newProduct.useFullImage}
                onChange={(event) =>
                  setNewProduct((current) => ({ ...current, useFullImage: event.target.checked }))
                }
              />
              <span>
                <span className="block text-sm font-medium text-slate-950">
                  Ảnh đã cắt đúng sản phẩm, không cần hệ thống cắt lại
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  Nên bật khi ảnh tham chiếu chỉ chứa một linh kiện rõ ràng.
                </span>
              </span>
            </label>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={creating}
                onClick={() => {
                  resetCreateForm();
                  setCreateSheetOpen(false);
                }}
              >
                Huỷ
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Lưu linh kiện
              </Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <ProductReferenceCaptureSheet
        apiBaseUrl={apiBaseUrl}
        open={captureProduct !== null}
        product={captureProduct}
        onOpenChange={(open) => {
          if (!open) {
            setCaptureProduct(null);
          }
        }}
        onCaptured={handleReferenceCaptured}
        onReferencesChanged={() => setRefreshToken((currentToken) => currentToken + 1)}
      />

      <ProductDetailSheet
        apiBaseUrl={apiBaseUrl}
        open={detailProduct !== null}
        product={detailProduct}
        categoryOptions={categoryOptions}
        onOpenChange={(open) => {
          if (!open) {
            setDetailProduct(null);
          }
        }}
        onUpdated={handleProductUpdated}
        onDeleted={handleProductDeleted}
        onReferencesChanged={() => setRefreshToken((currentToken) => currentToken + 1)}
      />

      <Sheet open={importSheetOpen} onOpenChange={setImportSheetOpen}>
        <SheetContent className="max-w-3xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Nhập danh sách mã hàng</SheetTitle>
            <SheetDescription>
              Chọn bảng tính của khách. Mã hàng sẽ được gom theo phân loại để chụp ảnh thuận tiện.
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-5">
            {batchImportError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {batchImportError}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={downloadSampleSpreadsheet}>
                <FileDown className="h-4 w-4" />
                Tải bảng tính mẫu
              </Button>
              <Button type="button" variant="ghost" onClick={resetBatchImport} disabled={batchImporting}>
                Xoá tệp đã chọn
              </Button>
            </div>
            <div className="space-y-3">
              <label className="flex cursor-pointer flex-col justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 transition-colors hover:bg-slate-100">
                <span className="text-sm font-semibold text-slate-950">Bảng tính danh sách mã hàng</span>
                <span className="mt-1 text-xs text-slate-500">
                  Đọc Mã hàng, Tên mặt hàng và Nhóm mặt hàng từ bảng tính khách đang dùng.
                </span>
                <span className="mt-3 truncate rounded-md bg-white px-3 py-2 text-sm text-slate-700">
                  {batchCsvFile?.name ?? "Chưa chọn tệp"}
                </span>
                <input
                  type="file"
                  accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(event) => {
                    setBatchCsvFile(event.target.files?.[0] ?? null);
                    setBatchImportResult(null);
                    setBatchImportError(null);
                  }}
                />
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
              <Button type="button" variant="outline" disabled={batchImporting || !batchCsvFile} onClick={() => runBatchImport(true)}>
                {batchImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Kiểm tra trước
              </Button>
              <Button type="button" disabled={batchImporting || !batchCsvFile} onClick={() => runBatchImport(false)}>
                {batchImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Nhập chính thức
              </Button>
            </div>
            {batchImportResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs text-slate-500">Dòng</p>
                      <p className="text-lg font-bold text-slate-950">{batchImportResult.total_rows}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs text-slate-500">Tạo mới</p>
                      <p className="text-lg font-bold text-emerald-700">{batchImportResult.created_count}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs text-slate-500">Cập nhật</p>
                      <p className="text-lg font-bold text-amber-700">{batchImportResult.updated_count}</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs text-slate-500">Lỗi</p>
                      <p className="text-lg font-bold text-red-700">{batchImportResult.failed_count}</p>
                    </CardContent>
                  </Card>
                </div>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <div className="grid grid-cols-[56px_minmax(120px,1fr)_minmax(180px,1.4fr)_minmax(140px,1fr)_110px] border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <div className="px-3 py-2">Dòng</div>
                    <div className="px-3 py-2">Mã</div>
                    <div className="px-3 py-2">Tên</div>
                    <div className="px-3 py-2">Phân loại</div>
                    <div className="px-3 py-2">Trạng thái</div>
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {batchImportResult.rows.map((row) => (
                      <div
                        key={`${row.row_index}-${row.ma_san_pham ?? "empty"}`}
                        className="grid grid-cols-[56px_minmax(120px,1fr)_minmax(180px,1.4fr)_minmax(140px,1fr)_110px] border-b border-slate-100 text-sm last:border-b-0"
                      >
                        <div className="px-3 py-2 text-slate-500">{row.row_index}</div>
                        <div className="truncate px-3 py-2 font-semibold text-slate-950">{row.ma_san_pham ?? "-"}</div>
                        <div className="truncate px-3 py-2 text-slate-700">{row.ten_san_pham ?? "-"}</div>
                        <div className="truncate px-3 py-2 text-slate-600">{row.nhom_mat_hang ?? "Chưa phân loại"}</div>
                        <div className="px-3 py-2">
                          <Badge variant={importStatusTone(row.status)}>{importStatusLabel(row.status)}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-56 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-slate-50 lg:flex">
          <div className="border-b border-slate-200 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
              <Tags className="h-4 w-4" />
              Phân loại
            </div>
            <div className="space-y-0.5">
              <button
                type="button"
                aria-pressed={categoryFilter === "all"}
                onClick={() => setCategoryFilter("all")}
                className={cn(
                  "flex h-8 w-full items-center justify-between rounded px-2 text-left text-sm",
                  categoryFilter === "all"
                    ? "bg-blue-100 font-semibold text-blue-700"
                    : "text-slate-700 hover:bg-slate-200",
                )}
              >
                <span>Tất cả</span>
                <span className="text-xs">{products.length}</span>
              </button>
              {categoryOptions.map((category) => (
                <button
                  key={category}
                  type="button"
                  aria-pressed={categoryFilter === category}
                  onClick={() => setCategoryFilter(category)}
                  className={cn(
                    "flex h-8 w-full items-center justify-between rounded px-2 text-left text-sm",
                    categoryFilter === category
                      ? "bg-blue-100 font-semibold text-blue-700"
                      : "text-slate-700 hover:bg-slate-200",
                  )}
                >
                  <span className="truncate pr-2">{category}</span>
                  <span className="text-xs">{categoryCounts.get(category) ?? 0}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-slate-200 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
              <Package className="h-4 w-4" />
              Tồn kho
            </div>
            <div className="space-y-0.5">
              {stockFilterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={stockFilter === option.value}
                  onClick={() => setStockFilter(option.value)}
                  className={cn(
                    "flex h-8 w-full items-center justify-between rounded px-2 text-left text-sm",
                    stockFilter === option.value
                      ? "bg-blue-100 font-semibold text-blue-700"
                      : "text-slate-700 hover:bg-slate-200",
                  )}
                >
                  <span>{option.label}</span>
                  <span className="text-xs">{stockCounts[option.value]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
              <Image className="h-4 w-4" />
              Ảnh nhận diện
            </div>
            <div className="space-y-0.5">
              {imageFilterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={imageFilter === option.value}
                  onClick={() => setImageFilter(option.value)}
                  className={cn(
                    "flex h-8 w-full items-center justify-between rounded px-2 text-left text-sm",
                    imageFilter === option.value
                      ? "bg-blue-100 font-semibold text-blue-700"
                      : "text-slate-700 hover:bg-slate-200",
                  )}
                >
                  <span>{option.label}</span>
                  <span className="text-xs">{imageCounts[option.value]}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white p-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                className="h-9 border-slate-300 pl-9"
                placeholder="Tìm mã hàng, tên hoặc phân loại"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="hidden text-xs text-slate-500 sm:block">
              {visibleProducts.length} kết quả
            </div>
            <div className="flex gap-2 lg:hidden">
              <select
                value={categoryFilter}
                className="h-9 w-40 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700"
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">Tất cả phân loại</option>
                {categoryOptions.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
              <select
                value={stockFilter}
                className="h-9 w-32 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700"
                onChange={(event) => setStockFilter(event.target.value as StockFilter)}
              >
                {stockFilterOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {notice ? (
            <div className="mx-2 mt-2 rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {notice}
            </div>
          ) : null}
          {errorMessage ? (
            <div className="mx-2 mt-2 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}

          <div className="min-h-0 flex-1 overflow-auto">
            {loading && products.length === 0 ? (
              <div className="space-y-1 p-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="min-w-[760px]">
                <div
                  className={cn(
                    productGridClass,
                    "sticky top-0 z-10 h-9 border-b border-slate-200 bg-blue-50",
                  )}
                >
                  <div className="w-14 shrink-0 px-2 text-xs font-semibold uppercase text-slate-600">
                    Ảnh
                  </div>
                  <div className="min-w-0 flex-1 px-3 text-xs font-semibold uppercase text-slate-600">
                    Mã hàng
                  </div>
                  <div className="w-36 shrink-0 px-2 text-xs font-semibold uppercase text-slate-600">
                    Phân loại
                  </div>
                  <div className="w-32 shrink-0 px-2 text-xs font-semibold uppercase text-slate-600">
                    Tồn kho
                  </div>
                  <div className="w-28 shrink-0 px-2 text-xs font-semibold uppercase text-slate-600">
                    Ảnh nhận diện
                  </div>
                  <div className="w-24 shrink-0 px-3 text-right text-xs font-semibold uppercase text-slate-600">
                    Thao tác
                  </div>
                </div>

                {pagedProducts.length === 0 ? (
                  <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                    Không có mã hàng phù hợp.
                  </div>
                ) : (
                  pagedProducts.map((product) => {
                    const referenceCount = product.reference_image_count ?? 0;
                    const category = product.category?.trim() || "Chưa phân loại";

                    return (
                      <div
                        key={product.product_id}
                        className={cn(
                          productGridClass,
                          "min-h-14 border-b border-slate-200 bg-white transition-colors hover:bg-blue-50/50",
                        )}
                      >
                        <div className="w-14 shrink-0 px-2 py-1.5">
                          <ProductImageCell product={product} />
                        </div>
                        <div className="min-w-0 flex-1 px-3 py-1.5">
                          <p className="truncate text-sm font-semibold text-slate-950">{product.name}</p>
                          <p className="truncate text-xs text-slate-500">{product.product_id}</p>
                        </div>
                        <div className="w-36 shrink-0 truncate px-2 py-1.5 text-sm text-slate-600">
                          {category}
                        </div>
                        <div className="w-32 shrink-0 px-2 py-1.5">
                          <div className="flex items-center gap-2">
                            <Badge variant={stockTone(product)}>{stockLabel(product)}</Badge>
                            <span className="text-sm font-semibold text-slate-950">
                              {product.inventory_count}
                            </span>
                          </div>
                        </div>
                        <div className="w-28 shrink-0 px-2 py-1.5 text-sm text-slate-700">
                          {referenceCount > 0 ? `${referenceCount} ảnh` : "Chưa có"}
                        </div>
                        <div className="w-24 shrink-0 px-3 py-1.5">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant={referenceCount > 0 ? "outline" : "success"}
                              size="icon"
                              className="h-8 w-8"
                              title="Chụp ảnh"
                              aria-label={`Chụp ảnh cho ${product.product_id}`}
                              onClick={() => setCaptureProduct(product)}
                            >
                              <Camera className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-8 w-8 text-blue-700"
                              title="Xem chi tiết"
                              aria-label={`Xem chi tiết ${product.product_id}`}
                              onClick={() => setDetailProduct(product)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div className="flex h-11 shrink-0 items-center justify-between border-t border-slate-200 bg-white px-3">
            <p className="text-xs text-slate-500">
              Trang {page}/{totalPages} · {pagedProducts.length}/{visibleProducts.length} mã hàng
            </p>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
              >
                Trước
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
              >
                Sau
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
