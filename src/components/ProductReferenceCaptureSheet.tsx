import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ImageOff, Images, Loader2, Package, Scissors, Trash2, X } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CameraImageCapture } from "@/components/CameraImageCapture";
import {
  ProductImageCropCard,
  type ProductImageEntry,
} from "@/components/ProductImageCropCard";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  addProductEmbedding,
  captureProductReference,
  deleteProductEmbedding,
  fetchProductDetail,
} from "@/lib/api";
import type { Product, ProductDetail, ProductReferenceCapture } from "@/types/api";

export interface ProductReferenceCaptureSheetProps {
  apiBaseUrl: string;
  open: boolean;
  product: Product | null;
  onOpenChange: (open: boolean) => void;
  onCaptured: (result: ProductReferenceCapture) => void;
  onReferencesChanged: (productId: string) => void;
}

const previewSource = (base64: string): string => `data:image/jpeg;base64,${base64}`;

type QueueStatus = "ready" | "uploading" | "error";

interface QueuedReferenceImage extends ProductImageEntry {
  status: QueueStatus;
  errorMessage: string | null;
}

const createImageEntryId = (): string =>
  typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const createQueuedImage = (file: File): QueuedReferenceImage => ({
  id: createImageEntryId(),
  file,
  selectedBox: null,
  croppedFile: null,
  cropPreviewUrl: null,
  status: "ready",
  errorMessage: null,
});

const ReferenceImageThumbnail = ({
  entry,
  index,
  active,
  onSelect,
}: {
  entry: QueuedReferenceImage;
  index: number;
  active: boolean;
  onSelect: () => void;
}): JSX.Element => {
  const [source, setSource] = React.useState<string | null>(null);

  React.useEffect(() => {
    const nextSource = URL.createObjectURL(entry.file);
    setSource(nextSource);
    return () => URL.revokeObjectURL(nextSource);
  }, [entry.file]);

  return (
    <button
      type="button"
      className={`relative h-20 w-24 shrink-0 overflow-hidden rounded-lg border-2 bg-slate-100 text-left transition ${
        active
          ? "border-blue-600 ring-2 ring-blue-100"
          : entry.status === "error"
            ? "border-red-400"
            : "border-slate-200 hover:border-slate-400"
      }`}
      aria-label={`Chọn ảnh ${index + 1}: ${entry.file.name}`}
      onClick={onSelect}
    >
      {source ? <img src={source} alt="" className="h-full w-full object-cover" /> : null}
      <span className="absolute left-1 top-1 rounded bg-slate-950 px-1.5 py-0.5 text-[11px] font-semibold text-white">
        {index + 1}
      </span>
      {entry.croppedFile ? (
        <span className="absolute bottom-1 right-1 rounded bg-amber-500 p-1 text-white" title="Đã cắt ảnh">
          <Scissors className="h-3 w-3" />
        </span>
      ) : null}
      {entry.status === "uploading" ? (
        <span className="absolute inset-0 flex items-center justify-center bg-slate-950/50 text-white">
          <Loader2 className="h-5 w-5 animate-spin" />
        </span>
      ) : null}
    </button>
  );
};

export const ProductReferenceCaptureSheet = ({
  apiBaseUrl,
  open,
  product,
  onOpenChange,
  onCaptured,
  onReferencesChanged,
}: ProductReferenceCaptureSheetProps): JSX.Element => {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = React.useState(false);
  const [queuedImages, setQueuedImages] = React.useState<QueuedReferenceImage[]>([]);
  const [activeImageId, setActiveImageId] = React.useState<string | null>(null);
  const [batchMessage, setBatchMessage] = React.useState<string | null>(null);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [deleteArmedEmbeddingId, setDeleteArmedEmbeddingId] = React.useState<number | null>(null);

  const detailQuery = useQuery<ProductDetail, Error>({
    queryKey: ["product-detail", apiBaseUrl, product?.product_id],
    queryFn: () => fetchProductDetail(apiBaseUrl, product?.product_id ?? ""),
    enabled: open && product !== null,
  });

  const deleteMutation = useMutation({
    mutationFn: (embeddingId: number) => {
      if (!product) {
        throw new Error("Không tìm thấy mã hàng");
      }
      return deleteProductEmbedding(apiBaseUrl, product.product_id, embeddingId);
    },
    onSuccess: async (deleteResult) => {
      setDeleteArmedEmbeddingId(null);
      await queryClient.invalidateQueries({
        queryKey: ["product-detail", apiBaseUrl, deleteResult.product_id],
      });
      onReferencesChanged(deleteResult.product_id);
    },
  });

  React.useEffect(() => {
    setQueuedImages((currentImages) => {
      currentImages.forEach((entry) => {
        if (entry.cropPreviewUrl) {
          URL.revokeObjectURL(entry.cropPreviewUrl);
        }
      });
      return [];
    });
    setActiveImageId(null);
    setBatchMessage(null);
    setErrorMessage(null);
    setUploading(false);
    setDeleteArmedEmbeddingId(null);
  }, [open, product?.product_id]);

  React.useEffect(() => {
    if (queuedImages.length === 0) {
      setActiveImageId(null);
      return;
    }
    if (!activeImageId || !queuedImages.some((entry) => entry.id === activeImageId)) {
      setActiveImageId(queuedImages[0].id);
    }
  }, [activeImageId, queuedImages]);

  const appendFiles = (files: File[]): void => {
    if (files.length === 0) {
      return;
    }
    const newEntries = files.map(createQueuedImage);
    setQueuedImages((currentImages) => [...currentImages, ...newEntries]);
    setActiveImageId((currentId) => currentId ?? newEntries[0].id);
    setBatchMessage(null);
    setErrorMessage(null);
  };

  const handleCropChange = (
    id: string,
    selectedBox: ProductImageEntry["selectedBox"],
    croppedFile: File | null,
    cropPreviewUrl: string | null,
  ): void => {
    setQueuedImages((currentImages) =>
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
          status: "ready",
          errorMessage: null,
        };
      }),
    );
  };

  const deleteQueuedImage = (id: string): void => {
    setQueuedImages((currentImages) => {
      const target = currentImages.find((entry) => entry.id === id);
      if (target?.cropPreviewUrl) {
        URL.revokeObjectURL(target.cropPreviewUrl);
      }
      return currentImages.filter((entry) => entry.id !== id);
    });
  };

  const clearQueuedImages = (): void => {
    setQueuedImages((currentImages) => {
      currentImages.forEach((entry) => {
        if (entry.cropPreviewUrl) {
          URL.revokeObjectURL(entry.cropPreviewUrl);
        }
      });
      return [];
    });
    setBatchMessage(null);
    setErrorMessage(null);
  };

  const saveQueuedImages = async (): Promise<void> => {
    if (!product || queuedImages.length === 0 || uploading) {
      return;
    }

    const snapshot = [...queuedImages];
    const savedIds = new Set<string>();
    const failures = new Map<string, string>();
    setUploading(true);
    setBatchMessage(null);
    setErrorMessage(null);

    for (const entry of snapshot) {
      setQueuedImages((currentImages) =>
        currentImages.map((currentEntry) =>
          currentEntry.id === entry.id
            ? { ...currentEntry, status: "uploading", errorMessage: null }
            : currentEntry,
        ),
      );
      try {
        if (entry.croppedFile) {
          await addProductEmbedding(apiBaseUrl, {
            productId: product.product_id,
            file: entry.croppedFile,
            useFullImage: true,
          });
        } else {
          const captureResult = await captureProductReference(apiBaseUrl, {
            productId: product.product_id,
            file: entry.file,
          });
          onCaptured(captureResult);
        }
        savedIds.add(entry.id);
      } catch (error) {
        failures.set(entry.id, error instanceof Error ? error.message : "Không lưu được ảnh.");
      }
    }

    setQueuedImages((currentImages) =>
      currentImages.flatMap((entry) => {
        if (savedIds.has(entry.id)) {
          if (entry.cropPreviewUrl) {
            URL.revokeObjectURL(entry.cropPreviewUrl);
          }
          return [];
        }
        return [{
          ...entry,
          status: failures.has(entry.id) ? "error" as const : "ready" as const,
          errorMessage: failures.get(entry.id) ?? null,
        }];
      }),
    );

    if (savedIds.size > 0) {
      await queryClient.invalidateQueries({
        queryKey: ["product-detail", apiBaseUrl, product.product_id],
      });
      onReferencesChanged(product.product_id);
    }
    setBatchMessage(
      failures.size === 0
        ? `Đã lưu ${savedIds.size} ảnh cho ${product.product_id}.`
        : `Đã lưu ${savedIds.size} ảnh, còn ${failures.size} ảnh cần kiểm tra.`,
    );
    setUploading(false);
  };

  const referenceCount =
    detailQuery.data?.reference_image_count ??
    product?.reference_image_count ??
    0;

  const handleDelete = (embeddingId: number): void => {
    if (deleteArmedEmbeddingId !== embeddingId) {
      setDeleteArmedEmbeddingId(embeddingId);
      return;
    }
    deleteMutation.mutate(embeddingId);
  };

  const activeImage = queuedImages.find((entry) => entry.id === activeImageId) ?? null;
  const croppedCount = queuedImages.filter((entry) => entry.croppedFile !== null).length;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-w-4xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Ảnh nhận diện</SheetTitle>
          <SheetDescription>Chụp thêm hoặc xoá ảnh không đúng mã hàng.</SheetDescription>
        </SheetHeader>

        {product ? (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm">
                <Package className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-950">{product.name}</p>
                <p className="truncate text-xs font-medium text-slate-500">{product.product_id}</p>
              </div>
              <Badge variant={referenceCount > 0 ? "success" : "warning"}>
                {referenceCount > 0 ? "Đã sẵn sàng" : "Chưa có ảnh"}
              </Badge>
            </div>

            <CameraImageCapture
              disabled={uploading}
              onCapture={(file) => appendFiles([file])}
              onFilesSelected={appendFiles}
            />

            <p className="text-center text-xs text-slate-500">
              Có thể chọn nhiều ảnh cùng lúc. Chọn từng ảnh trong danh sách để cắt đúng vùng sản phẩm rồi lưu cả loạt.
            </p>

            {queuedImages.length > 0 ? (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Images className="h-5 w-5 text-blue-600" />
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{queuedImages.length} ảnh chờ lưu</p>
                      <p className="text-xs text-slate-500">{croppedCount} ảnh đã chọn vùng cắt</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploading}
                    onClick={clearQueuedImages}
                  >
                    <X className="h-4 w-4" />
                    Xoá tất cả
                  </Button>
                </div>

                <div className="flex gap-2 overflow-x-auto pb-1">
                  {queuedImages.map((entry, index) => (
                    <ReferenceImageThumbnail
                      key={entry.id}
                      entry={entry}
                      index={index}
                      active={entry.id === activeImageId}
                      onSelect={() => setActiveImageId(entry.id)}
                    />
                  ))}
                </div>

                {activeImage ? (
                  <div className={uploading ? "pointer-events-none opacity-70" : undefined}>
                    <ProductImageCropCard
                      entry={activeImage}
                      index={queuedImages.findIndex((entry) => entry.id === activeImage.id)}
                      onCropChange={handleCropChange}
                      onDelete={deleteQueuedImage}
                    />
                    {activeImage.errorMessage ? (
                      <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {activeImage.errorMessage}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <Button
                  type="button"
                  className="w-full"
                  disabled={uploading || queuedImages.length === 0}
                  onClick={() => void saveQueuedImages()}
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {uploading ? "Đang lưu ảnh..." : `Lưu tất cả ${queuedImages.length} ảnh`}
                </Button>
              </div>
            ) : null}

            {uploading && (
              <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-700">
                Hệ thống đang xử lý lần lượt từng ảnh.
              </div>
            )}

            {batchMessage && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {batchMessage}
              </div>
            )}

            {(errorMessage || detailQuery.error || deleteMutation.error) && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage ?? detailQuery.error?.message ?? deleteMutation.error?.message}
              </div>
            )}

            <div className="border-t border-slate-200 pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-slate-950">Ảnh đã lưu</h3>
                <span className="text-xs text-slate-500">{referenceCount} ảnh</span>
              </div>

              {detailQuery.isLoading ? (
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="aspect-square w-full" />
                  <Skeleton className="aspect-square w-full" />
                </div>
              ) : detailQuery.data?.embeddings.length ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {detailQuery.data.embeddings.map((embedding, index) => (
                    <div
                      key={embedding.id}
                      className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50"
                    >
                      {embedding.image_preview_base64 ? (
                        <img
                          src={previewSource(embedding.image_preview_base64)}
                          alt={`Ảnh tham chiếu ${index + 1}`}
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
                        disabled={deleteMutation.isPending}
                        title={deleteArmedEmbeddingId === embedding.id ? "Bấm lại để xoá" : "Xoá ảnh"}
                        aria-label={deleteArmedEmbeddingId === embedding.id ? "Xác nhận xoá ảnh" : "Xoá ảnh"}
                        onClick={() => handleDelete(embedding.id)}
                      >
                        {deleteMutation.isPending && deleteMutation.variables === embedding.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                      {deleteArmedEmbeddingId === embedding.id ? (
                        <div className="absolute inset-x-0 bottom-0 bg-red-600/90 px-2 py-1 text-center text-xs font-medium text-white">
                          Bấm lại để xoá
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                  Chưa có ảnh nhận diện.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
};
