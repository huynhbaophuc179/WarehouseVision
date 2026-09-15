import { ProductManagementTable } from "@/components/product-management-table";
import { Button as AntButton, Checkbox, Select, Table } from "antd";
import { ManagementPage } from "@/components/management-page";
import { ManagementFilterField, ManagementFilters } from "@/components/management-filters";
import { ManagementPagination } from "@/components/management-pagination";
import { getPaginationBounds } from "@/lib/management-list";
import {
  FileDown,
  Loader2,
  Plus,
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
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import {
  ProductImageCropCard,
  type ProductImageEntry,
} from "@/components/ProductImageCropCard";
import { ProductDetailSheet } from "@/components/ProductDetailSheet";
import { ProductReferenceCaptureSheet } from "@/components/ProductReferenceCaptureSheet";
import {
  addProductEmbedding,
  batchImportProducts,
  createProductWithImage,
  fetchProductCategories,
  fetchProducts,
} from "@/lib/api";
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
      (imageFilter === "with_image" &&
        (product.reference_image_count ?? 0) > 0) ||
      (imageFilter === "missing" && (product.reference_image_count ?? 0) === 0);
    const categoryMatched =
      categoryFilter === "all" ||
      (product.category?.trim() || "Chưa phân loại") === categoryFilter;
    const stockMatched =
      stockFilter === "all" ||
      (stockFilter === "available" && product.inventory_count > 5) ||
      (stockFilter === "low" &&
        product.inventory_count > 0 &&
        product.inventory_count <= 5) ||
      (stockFilter === "empty" && product.inventory_count <= 0);
    return imageMatched && categoryMatched && stockMatched;
  });

  return [...filtered].sort((first, second) => {
    const nameDifference = first.name.localeCompare(second.name, "vi", {
      sensitivity: "base",
    });
    return (
      nameDifference || first.product_id.localeCompare(second.product_id, "vi")
    );
  });
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

export const ProductManagementPage = ({
  apiBaseUrl,
}: ProductManagementPageProps): JSX.Element => {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const [search, setSearch] = React.useState("");
  const [imageFilter, setImageFilter] = React.useState<ImageFilter>("all");
  const [stockFilter, setStockFilter] = React.useState<StockFilter>("all");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [categoryOptions, setCategoryOptions] = React.useState<string[]>([]);
  const [createSheetOpen, setCreateSheetOpen] = React.useState(false);
  const [importSheetOpen, setImportSheetOpen] = React.useState(false);
  const [captureProduct, setCaptureProduct] = React.useState<Product | null>(
    null,
  );
  const [detailProduct, setDetailProduct] = React.useState<Product | null>(
    null,
  );
  const [newProduct, setNewProduct] = React.useState<NewProductFormState>({
    productId: "",
    name: "",
    category: "",
    inventoryCount: "0",
    useFullImage: true,
  });
  const [newProductImages, setNewProductImages] = React.useState<
    ProductImageEntry[]
  >([]);
  const [createErrorMessage, setCreateErrorMessage] = React.useState<
    string | null
  >(null);
  const [batchCsvFile, setBatchCsvFile] = React.useState<File | null>(null);
  const batchFileInputRef = React.useRef<HTMLInputElement>(null);
  const [batchImporting, setBatchImporting] = React.useState(false);
  const [batchImportResult, setBatchImportResult] =
    React.useState<ProductBatchImportResponse | null>(null);
  const [batchImportError, setBatchImportError] = React.useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const deferredSearch = React.useDeferredValue(search);
  const [refreshToken, setRefreshToken] = React.useState(0);

  const visibleProducts = React.useMemo(
    () => filterProducts(products, imageFilter, categoryFilter, stockFilter),
    [products, imageFilter, categoryFilter, stockFilter],
  );

  const pagination = getPaginationBounds(visibleProducts.length, page, pageSize);

  React.useEffect(() => {
    setPage(pagination.page);
  }, [pagination.page]);

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

  const pagedProducts = visibleProducts.slice(
    Math.max(0, pagination.start - 1),
    pagination.end,
  );
  const hasFilters = Boolean(search) || categoryFilter !== "all" ||
    stockFilter !== "all" || imageFilter !== "all";

  const resetFilters = (): void => {
    setSearch("");
    setCategoryFilter("all");
    setStockFilter("all");
    setImageFilter("all");
    setPage(1);
  };

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

  const handleCreateProduct = (
    event: React.FormEvent<HTMLFormElement>,
  ): void => {
    event.preventDefault();
    const productId = newProduct.productId.trim();
    const productName = newProduct.name.trim();
    const inventoryCount = Math.max(
      0,
      Number.parseInt(newProduct.inventoryCount || "0", 10) || 0,
    );
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
      file: primaryImage
        ? (primaryImage.croppedFile ?? primaryImage.file)
        : undefined,
    })
      .then(async (createdProduct) => {
        for (const imageEntry of additionalImages) {
          await addProductEmbedding(apiBaseUrl, {
            productId,
            file: imageEntry.croppedFile ?? imageEntry.file,
            useFullImage: imageEntry.croppedFile
              ? true
              : newProduct.useFullImage,
          });
        }
        setNotice(
          primaryImage
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
    if (batchFileInputRef.current) {
      batchFileInputRef.current.value = "";
    }
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
              approved_embedding_count:
                (product.approved_embedding_count ?? 0) + 1,
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
    <>
      <ManagementPage
        title="Mã hàng"
        description="Quản lý thông tin, ảnh nhận diện và tồn kho của từng mã hàng."
        actions={
          <>
            <AntButton
              icon={<UploadCloud size={16} />}
              onClick={() => setImportSheetOpen(true)}
            >
              Nhập danh sách
            </AntButton>
            <AntButton
              color="green"
              variant="solid"
              className="app-success-action"
              icon={<Plus size={16} />}
              onClick={() => setCreateSheetOpen(true)}
            >
              Thêm mã hàng
            </AntButton>
          </>
        }
        filters={
          <ManagementFilters
            search={search}
            onSearchChange={setSearch}
            placeholder="Tìm mã hàng, tên hoặc phân loại"
            active={hasFilters}
            onReset={resetFilters}
          >
            <ManagementFilterField label="Phân loại">
              <Select
                aria-label="Lọc phân loại"
                value={categoryFilter}
                onChange={setCategoryFilter}
                options={[
                  { value: "all", label: "Tất cả" },
                  ...categoryOptions.map((category) => ({ value: category, label: category })),
                ]}
              />
            </ManagementFilterField>
            <ManagementFilterField label="Tồn kho">
              <Select<StockFilter>
                aria-label="Lọc tồn kho"
                value={stockFilter}
                onChange={setStockFilter}
                options={stockFilterOptions}
              />
            </ManagementFilterField>
            <ManagementFilterField label="Ảnh nhận diện">
              <Select<ImageFilter>
                aria-label="Lọc ảnh nhận diện"
                value={imageFilter}
                onChange={setImageFilter}
                options={imageFilterOptions}
              />
            </ManagementFilterField>
          </ManagementFilters>
        }
        summary={<span><strong>{visibleProducts.length}</strong> mã hàng</span>}
        notice={notice}
        error={errorMessage}
        pagination={
          <ManagementPagination
            total={visibleProducts.length}
            page={pagination.page}
            pageSize={pageSize}
            onChange={(nextPage, nextPageSize) => {
              setPage(nextPageSize === pageSize ? nextPage : 1);
              setPageSize(nextPageSize);
            }}
          />
        }
      >
        <ProductManagementTable
          products={pagedProducts}
          loading={loading}
          emptyText={hasFilters ? "Không có mã hàng phù hợp với bộ lọc." : "Chưa có mã hàng."}
          onCapture={setCaptureProduct}
          onDetail={setDetailProduct}
        />
      </ManagementPage>

      <Sheet open={createSheetOpen} onOpenChange={setCreateSheetOpen}>
        <SheetContent title="Thêm mã hàng" size={896} className="overflow-y-auto">
          <form className="space-y-5" onSubmit={handleCreateProduct}>
            {createErrorMessage && (
              <div className="rounded-md border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger">
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
                    setNewProduct((current) => ({
                      ...current,
                      productId: event.target.value,
                    }))
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
                  onChange={(event) =>
                    setNewProduct((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-product-category">Phân loại</Label>
                <Input
                  id="new-product-category"
                  value={newProduct.category}
                  placeholder="VD: Nút nhấn"
                  onChange={(event) =>
                    setNewProduct((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ảnh nhận diện (không bắt buộc)</Label>
              <CameraImageCapture
                disabled={creating}
                onCapture={(file) => appendNewProductImages([file])}
                onFilesSelected={appendNewProductImages}
              />
            </div>
            {newProductImages.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-content">
                    {newProductImages.length} ảnh đã chọn
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-muted"
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
            <Checkbox
              className="rounded-lg border border-line bg-surface p-3"
              aria-label="Ảnh đã cắt đúng sản phẩm"
              checked={newProduct.useFullImage}
              onChange={(event) =>
                setNewProduct((current) => ({
                  ...current,
                  useFullImage: event.target.checked,
                }))
              }
            >
              <span>
                <span className="block text-sm font-medium text-content">
                  Ảnh đã cắt đúng sản phẩm
                </span>
                <span className="mt-1 block text-xs text-muted">
                  Bật khi ảnh chỉ có một sản phẩm; hệ thống sẽ không cắt lại.
                </span>
              </span>
            </Checkbox>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
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
                Tạo mã hàng
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
        onReferencesChanged={() =>
          setRefreshToken((currentToken) => currentToken + 1)
        }
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
        onReferencesChanged={() =>
          setRefreshToken((currentToken) => currentToken + 1)
        }
      />

      <Sheet open={importSheetOpen} onOpenChange={setImportSheetOpen}>
        <SheetContent
          title="Nhập danh sách mã hàng"
          description="Chọn bảng tính của khách. Mã hàng sẽ được gom theo phân loại để chụp ảnh thuận tiện."
          size={768}
          className="overflow-y-auto"
        >
          <div className="mt-6 space-y-5">
            {batchImportError && (
              <div className="rounded-md border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger">
                {batchImportError}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={downloadSampleSpreadsheet}
              >
                <FileDown className="h-4 w-4" />
                Tải bảng tính mẫu
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={resetBatchImport}
                disabled={batchImporting}
              >
                Xoá tệp đã chọn
              </Button>
            </div>
            <div className="space-y-3">
              <div className="flex flex-col justify-center rounded-xl border border-dashed border-border bg-subtle p-5">
                <span className="text-sm font-semibold text-content">
                  Bảng tính danh sách mã hàng
                </span>
                <span className="mt-1 text-xs text-muted">
                  Đọc Mã hàng, Tên mặt hàng và Nhóm mặt hàng từ bảng tính khách
                  đang dùng.
                </span>
                <span className="mt-3 truncate rounded-md bg-surface px-3 py-2 text-sm text-secondary">
                  {batchCsvFile?.name ?? "Chưa chọn tệp"}
                </span>
                <AntButton
                  htmlType="button"
                  className="mt-3 self-start"
                  onClick={() => batchFileInputRef.current?.click()}
                >
                  Chọn bảng tính
                </AntButton>
                <input
                  ref={batchFileInputRef}
                  type="file"
                  accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="hidden"
                  onChange={(event) => {
                    setBatchCsvFile(event.target.files?.[0] ?? null);
                    setBatchImportResult(null);
                    setBatchImportError(null);
                  }}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-line pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={batchImporting || !batchCsvFile}
                onClick={() => runBatchImport(true)}
              >
                {batchImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Kiểm tra trước
              </Button>
              <Button
                type="button"
                disabled={batchImporting || !batchCsvFile}
                onClick={() => runBatchImport(false)}
              >
                {batchImporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                Nhập chính thức
              </Button>
            </div>
            {batchImportResult && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs text-muted">Dòng</p>
                      <p className="text-lg font-bold text-content">
                        {batchImportResult.total_rows}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs text-muted">Tạo mới</p>
                      <p className="text-lg font-bold text-success">
                        {batchImportResult.created_count}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs text-muted">Cập nhật</p>
                      <p className="text-lg font-bold text-warning">
                        {batchImportResult.updated_count}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-3">
                      <p className="text-xs text-muted">Lỗi</p>
                      <p className="text-lg font-bold text-danger">
                        {batchImportResult.failed_count}
                      </p>
                    </CardContent>
                  </Card>
                </div>
                <Table<ProductBatchImportRow>
                  size="small"
                  rowKey={(row) =>
                    `${row.row_index}-${row.ma_san_pham ?? "empty"}`
                  }
                  pagination={false}
                  scroll={{ x: 650, y: 320 }}
                  dataSource={batchImportResult.rows}
                  columns={[
                    { title: "Dòng", dataIndex: "row_index", width: 64 },
                    {
                      title: "Mã",
                      dataIndex: "ma_san_pham",
                      render: (value) => value ?? "-",
                    },
                    {
                      title: "Tên",
                      dataIndex: "ten_san_pham",
                      render: (value) => value ?? "-",
                    },
                    {
                      title: "Phân loại",
                      dataIndex: "nhom_mat_hang",
                      render: (value) => value ?? "Chưa phân loại",
                    },
                    {
                      title: "Trạng thái",
                      key: "status",
                      width: 110,
                      render: (_, row) => (
                        <Badge variant={importStatusTone(row.status)}>
                          {importStatusLabel(row.status)}
                        </Badge>
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

    </>
  );
};
