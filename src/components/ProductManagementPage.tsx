import { Boxes, Copy, ImageOff, Package, RefreshCw, Search, Trash2, TriangleAlert } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { deleteProduct, fetchProducts } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Product } from "@/types/api";

export interface ProductManagementPageProps {
  apiBaseUrl: string;
}

type StockFilter = "all" | "available" | "low" | "out";
type ImageFilter = "all" | "with_image" | "without_image" | "pending";
type SortMode = "name" | "stock_desc" | "stock_asc" | "reference_desc";

const pageSize = 10;

const stockFilterOptions: { value: StockFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "available", label: "Còn hàng" },
  { value: "low", label: "Sắp hết" },
  { value: "out", label: "Hết hàng" },
];

const imageFilterOptions: { value: ImageFilter; label: string }[] = [
  { value: "all", label: "Tất cả ảnh" },
  { value: "with_image", label: "Có ảnh" },
  { value: "without_image", label: "Thiếu ảnh" },
  { value: "pending", label: "Chờ duyệt" },
];

const sortOptions: { value: SortMode; label: string }[] = [
  { value: "name", label: "Tên A-Z" },
  { value: "stock_desc", label: "Tồn kho cao" },
  { value: "stock_asc", label: "Tồn kho thấp" },
  { value: "reference_desc", label: "Nhiều ảnh nhất" },
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

const filterProducts = (
  products: Product[],
  stockFilter: StockFilter,
  imageFilter: ImageFilter,
  sortMode: SortMode,
): Product[] => {
  const filtered = products.filter((product) => {
    const stockMatched =
      stockFilter === "all" ||
      (stockFilter === "available" && product.inventory_count > 5) ||
      (stockFilter === "low" && product.inventory_count > 0 && product.inventory_count <= 5) ||
      (stockFilter === "out" && product.inventory_count <= 0);
    const imageMatched =
      imageFilter === "all" ||
      (imageFilter === "with_image" && (product.reference_image_count ?? 0) > 0) ||
      (imageFilter === "without_image" && (product.reference_image_count ?? 0) === 0) ||
      (imageFilter === "pending" && (product.pending_embedding_count ?? 0) > 0);
    return stockMatched && imageMatched;
  });

  return [...filtered].sort((first, second) => {
    if (sortMode === "stock_desc") {
      return second.inventory_count - first.inventory_count;
    }
    if (sortMode === "stock_asc") {
      return first.inventory_count - second.inventory_count;
    }
    if (sortMode === "reference_desc") {
      return (second.reference_image_count ?? 0) - (first.reference_image_count ?? 0);
    }
    return first.name.localeCompare(second.name, "vi");
  });
};

const MetricCard = ({
  title,
  value,
  icon: Icon,
  tone = "default",
}: {
  title: string;
  value: number;
  icon: typeof Boxes;
  tone?: "default" | "warning" | "destructive";
}): JSX.Element => {
  const valueClass =
    tone === "destructive"
      ? "text-red-600"
      : tone === "warning"
        ? "text-amber-600"
        : "text-slate-950";

  return (
    <Card className="h-20">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 p-2 pb-0">
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</CardTitle>
        <Icon className="h-4 w-4 text-slate-400" />
      </CardHeader>
      <CardContent className="p-2 pt-0">
        <div className={cn("text-2xl font-bold leading-none", valueClass)}>{value}</div>
      </CardContent>
    </Card>
  );
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

export const ProductManagementPage = ({ apiBaseUrl }: ProductManagementPageProps): JSX.Element => {
  const [products, setProducts] = React.useState<Product[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [totalPages, setTotalPages] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [stockFilter, setStockFilter] = React.useState<StockFilter>("all");
  const [imageFilter, setImageFilter] = React.useState<ImageFilter>("all");
  const [sortMode, setSortMode] = React.useState<SortMode>("name");
  const [deleteArmedProductId, setDeleteArmedProductId] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const deferredSearch = React.useDeferredValue(search);
  const [refreshToken, setRefreshToken] = React.useState(0);

  const visibleProducts = React.useMemo(
    () => filterProducts(products, stockFilter, imageFilter, sortMode),
    [products, stockFilter, imageFilter, sortMode],
  );

  React.useEffect(() => {
    setTotalPages(Math.max(1, Math.ceil(visibleProducts.length / pageSize)));
    setPage((currentPage) => Math.min(currentPage, Math.max(1, Math.ceil(visibleProducts.length / pageSize))));
  }, [visibleProducts.length]);

  React.useEffect(() => {
    setPage(1);
  }, [deferredSearch, stockFilter, imageFilter, sortMode]);

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

  const pagedProducts = visibleProducts.slice((page - 1) * pageSize, page * pageSize);

  const productStats = {
    total: products.length,
    low: products.filter((product) => product.inventory_count > 0 && product.inventory_count <= 5).length,
    out: products.filter((product) => product.inventory_count <= 0).length,
    missingImage: products.filter((product) => (product.reference_image_count ?? 0) === 0).length,
  };

  const handleDelete = (productId: string): void => {
    if (deleteArmedProductId !== productId) {
      setDeleteArmedProductId(productId);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    deleteProduct(apiBaseUrl, productId)
      .then((result) => {
        setProducts((currentProducts) =>
          currentProducts.filter((product) => product.product_id !== result.product_id),
        );
        setNotice(`Đã xoá ${result.product_id}.`);
        setDeleteArmedProductId(null);
      })
      .catch((error: Error) => setErrorMessage(error.message))
      .finally(() => setLoading(false));
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold leading-tight text-slate-950">Quản lý sản phẩm</h2>
          <p className="text-xs text-slate-500">Tra cứu SKU, kiểm tra tồn kho và quản lý dữ liệu AI.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={loading}
            onClick={() => setRefreshToken((currentToken) => currentToken + 1)}
          >
            <RefreshCw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
            Làm mới
          </Button>
          <Badge variant="secondary">{visibleProducts.length} kết quả</Badge>
        </div>
      </div>

      <div className="flex w-full flex-row flex-nowrap items-stretch gap-4">
        <div className="min-w-0 flex-1">
          <MetricCard title="SKU" value={productStats.total} icon={Boxes} />
        </div>
        <div className="min-w-0 flex-1">
          <MetricCard title="Sắp hết" value={productStats.low} icon={TriangleAlert} tone="warning" />
        </div>
        <div className="min-w-0 flex-1">
          <MetricCard title="Hết hàng" value={productStats.out} icon={Package} tone="destructive" />
        </div>
        <div className="min-w-0 flex-1">
          <MetricCard title="Thiếu ảnh" value={productStats.missingImage} icon={ImageOff} />
        </div>
      </div>

      <Card>
        <CardContent className="p-2">
          <div className="flex flex-row items-center gap-3">
            <div className="relative min-w-[260px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                className="h-9 pl-9"
                placeholder="Tìm mã hoặc tên sản phẩm"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              value={imageFilter}
              className="h-9 w-36 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700"
              onChange={(event) => setImageFilter(event.target.value as ImageFilter)}
            >
              {imageFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              value={sortMode}
              className="h-9 w-36 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-700"
              onChange={(event) => setSortMode(event.target.value as SortMode)}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="flex shrink-0 flex-row items-center gap-2">
              {stockFilterOptions.map((option) => (
                <Button
                  key={option.value}
                  variant={stockFilter === option.value ? "default" : "outline"}
                  size="sm"
                  className="h-9"
                  onClick={() => setStockFilter(option.value)}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {notice && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}
      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="h-full overflow-auto p-0">
          {loading && products.length === 0 ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="min-w-[960px]">
              <div className={cn(productGridClass, "sticky top-0 z-10 border-b border-slate-200 bg-slate-50")}>
                <div className="w-16 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Ảnh</div>
                <div className="min-w-0 flex-1 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Thông tin SKU
                </div>
                <div className="w-36 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Trạng thái
                </div>
                <div className="w-64 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Dữ liệu AI
                </div>
                <div className="w-36 shrink-0 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Thao tác
                </div>
              </div>
              {pagedProducts.length === 0 ? (
                <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                  Không có sản phẩm phù hợp.
                </div>
              ) : (
                pagedProducts.map((product) => {
                  const referenceCount = product.reference_image_count ?? 0;

                  return (
                    <div
                      key={product.product_id}
                      className={cn(productGridClass, "border-b border-slate-200 transition-colors hover:bg-slate-50")}
                    >
                      <div className="w-16 shrink-0 px-3 py-2">
                        <ProductImageCell product={product} />
                      </div>
                      <div className="min-w-0 flex-1 px-3 py-2">
                        <p className="truncate text-sm font-semibold text-slate-950">{product.name}</p>
                        <p className="truncate text-xs font-medium text-slate-500">{product.product_id}</p>
                      </div>
                      <div className="w-36 shrink-0 px-3 py-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={stockTone(product)}>{stockLabel(product)}</Badge>
                          <span className="text-sm font-semibold text-slate-950">{product.inventory_count}</span>
                        </div>
                      </div>
                      <div className="w-64 shrink-0 px-3 py-2">
                        <div className="flex items-center gap-2 text-xs text-slate-600">
                          <span>{product.embedding_count ?? 0} vector</span>
                          <span className="text-slate-300">/</span>
                          {referenceCount > 0 ? (
                            <span>{referenceCount} ảnh</span>
                          ) : (
                            <Badge variant="warning" className="px-2 py-0 text-[11px]">
                              Thiếu ảnh
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="w-36 shrink-0 px-3 py-2">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="icon"
                            aria-label={`Sao chép mã ${product.product_id}`}
                            onClick={() => navigator.clipboard.writeText(product.product_id)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant={deleteArmedProductId === product.product_id ? "destructive" : "outline"}
                            size="icon"
                            aria-label={`Xoá sản phẩm ${product.product_id}`}
                            disabled={loading}
                            onClick={() => handleDelete(product.product_id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Trang {page}/{totalPages} · Hiển thị {pagedProducts.length}/{visibleProducts.length} sản phẩm
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
          >
            Next
          </Button>
        </div>
      </div>
    </section>
  );
};
