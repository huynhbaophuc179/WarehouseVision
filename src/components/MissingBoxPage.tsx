import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Loader2, Search, Trash2 } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { MissingBoxCanvas, type DisplayBox, type ExistingDisplayBox } from "@/components/MissingBoxCanvas";
import {
  addManualDetection,
  deleteReviewDetection,
  fetchProducts,
  fetchReviewSession,
  fetchReviewSessions,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  DetectionReviewResponse,
  ManualDetectionRequest,
  Product,
  RecognitionSessionDetail,
  RecognitionSessionSummary,
} from "@/types/api";

export interface MissingBoxPageProps {
  apiBaseUrl: string;
}

interface Size {
  width: number;
  height: number;
}

const formatSessionLabel = (session: RecognitionSessionSummary): string => {
  const createdAt = new Date(session.created_at);
  const dateText = Number.isNaN(createdAt.getTime())
    ? session.created_at
    : createdAt.toLocaleString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit",
        day: "2-digit",
        month: "2-digit",
      });
  return `Phiên #${session.id} · ${dateText}`;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const normalizeDisplayBox = (box: DisplayBox): DisplayBox => ({
  x1: Math.min(box.x1, box.x2),
  y1: Math.min(box.y1, box.y2),
  x2: Math.max(box.x1, box.x2),
  y2: Math.max(box.y1, box.y2),
});

const convertDisplayBoxToOriginal = (box: DisplayBox, displaySize: Size, originalSize: Size): number[] => {
  const normalized = normalizeDisplayBox(box);
  const scaleX = originalSize.width / displaySize.width;
  const scaleY = originalSize.height / displaySize.height;
  return [
    clamp(normalized.x1 * scaleX, 0, originalSize.width),
    clamp(normalized.y1 * scaleY, 0, originalSize.height),
    clamp(normalized.x2 * scaleX, 0, originalSize.width),
    clamp(normalized.y2 * scaleY, 0, originalSize.height),
  ];
};

const reviewBoxToDisplayBox = (
  box: number[] | null,
  originalSize: Size,
  displaySize: Size,
): DisplayBox | null => {
  if (!box || box.length < 4 || originalSize.width <= 0 || originalSize.height <= 0) {
    return null;
  }
  return {
    x1: (box[0] / originalSize.width) * displaySize.width,
    y1: (box[1] / originalSize.height) * displaySize.height,
    x2: (box[2] / originalSize.width) * displaySize.width,
    y2: (box[3] / originalSize.height) * displaySize.height,
  };
};

const buildImageDataUrl = (base64: string | null, mimeType: string | null): string | null =>
  base64 ? `data:${mimeType || "image/jpeg"};base64,${base64}` : null;

const createCropPreview = async (
  imageUrl: string,
  box: DisplayBox,
  displaySize: Size,
): Promise<string> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const normalized = normalizeDisplayBox(box);
      const width = Math.max(1, Math.round(normalized.x2 - normalized.x1));
      const height = Math.max(1, Math.round(normalized.y2 - normalized.y1));
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = displaySize.width;
      sourceCanvas.height = displaySize.height;
      const sourceContext = sourceCanvas.getContext("2d");
      const cropCanvas = document.createElement("canvas");
      cropCanvas.width = width;
      cropCanvas.height = height;
      const cropContext = cropCanvas.getContext("2d");
      if (!sourceContext || !cropContext) {
        reject(new Error("Không tạo được ảnh cắt."));
        return;
      }
      sourceContext.drawImage(image, 0, 0, displaySize.width, displaySize.height);
      cropContext.drawImage(
        sourceCanvas,
        Math.round(normalized.x1),
        Math.round(normalized.y1),
        width,
        height,
        0,
        0,
        width,
        height,
      );
      resolve(cropCanvas.toDataURL("image/jpeg", 0.92));
    };
    image.onerror = () => reject(new Error("Không đọc được ảnh để cắt."));
    image.src = imageUrl;
  });

const validateOriginalBox = (box: number[], originalSize: Size): string | null => {
  const [x1, y1, x2, y2] = box;
  if (x2 <= x1 || y2 <= y1) {
    return "Vùng chọn chưa hợp lệ.";
  }
  if (x2 - x1 < 10 || y2 - y1 < 10) {
    return "Vùng chọn quá nhỏ.";
  }
  if (x1 < 0 || y1 < 0 || x2 > originalSize.width || y2 > originalSize.height) {
    return "Vùng chọn nằm ngoài ảnh.";
  }
  return null;
};

const manualDetections = (session: RecognitionSessionDetail | undefined): DetectionReviewResponse[] =>
  session?.detections.filter((detection) => detection.user_decision === "manually_added") ?? [];

const fitDisplaySize = (previewSize: Size, maxWidth: number, maxHeight: number): Size => {
  const sourceWidth = Math.max(1, previewSize.width);
  const sourceHeight = Math.max(1, previewSize.height);
  const widthScale = maxWidth / sourceWidth;
  const heightScale = maxHeight / sourceHeight;
  const scale = Math.min(1, widthScale, heightScale);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
};

export const MissingBoxPage = ({ apiBaseUrl }: MissingBoxPageProps): JSX.Element => {
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = React.useState<number | null>(null);
  const [selectedBox, setSelectedBox] = React.useState<DisplayBox | null>(null);
  const [cropPreviewUrl, setCropPreviewUrl] = React.useState<string | null>(null);
  const [productSearch, setProductSearch] = React.useState("");
  const [selectedProductId, setSelectedProductId] = React.useState("");
  const [externalProductId, setExternalProductId] = React.useState("");
  const [statusMessage, setStatusMessage] = React.useState<string | null>(null);

  const sessionsQuery = useQuery<RecognitionSessionSummary[], Error>({
    queryKey: ["review-sessions", apiBaseUrl],
    queryFn: () => fetchReviewSessions(apiBaseUrl, 500),
    staleTime: 15_000,
  });

  React.useEffect(() => {
    if (selectedSessionId || !sessionsQuery.data?.length) {
      return;
    }
    setSelectedSessionId(sessionsQuery.data[0].id);
  }, [selectedSessionId, sessionsQuery.data]);

  const sessionQuery = useQuery<RecognitionSessionDetail, Error>({
    queryKey: ["review-session", apiBaseUrl, selectedSessionId],
    queryFn: () => fetchReviewSession(apiBaseUrl, selectedSessionId ?? 0),
    enabled: selectedSessionId !== null,
  });

  const productsQuery = useQuery<Product[], Error>({
    queryKey: ["products", apiBaseUrl, productSearch],
    queryFn: () => fetchProducts(apiBaseUrl, productSearch, 100),
    staleTime: 30_000,
  });

  const addMutation = useMutation({
    mutationFn: (payload: ManualDetectionRequest) => {
      if (!selectedSessionId) {
        throw new Error("Chưa chọn phiên nhận diện.");
      }
      return addManualDetection(apiBaseUrl, selectedSessionId, payload);
    },
    onSuccess: async () => {
      setSelectedBox(null);
      setCropPreviewUrl(null);
      setStatusMessage("Đã lưu vùng vào dữ liệu huấn luyện AI.");
      await queryClient.invalidateQueries({ queryKey: ["review-session", apiBaseUrl, selectedSessionId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (reviewId: number) => deleteReviewDetection(apiBaseUrl, reviewId),
    onSuccess: async () => {
      setStatusMessage("Đã xóa vùng đã lưu.");
      await queryClient.invalidateQueries({ queryKey: ["review-session", apiBaseUrl, selectedSessionId] });
    },
  });

  const session = sessionQuery.data;
  const originalSize: Size = {
    width: session?.original_image_width ?? session?.preview_image_width ?? 1,
    height: session?.original_image_height ?? session?.preview_image_height ?? 1,
  };
  const previewSize: Size = {
    width: session?.preview_image_width ?? originalSize.width,
    height: session?.preview_image_height ?? originalSize.height,
  };
  const displaySize = fitDisplaySize(previewSize, 900, 560);
  const imageUrl = buildImageDataUrl(session?.original_image_base64 ?? null, session?.preview_image_mime_type ?? session?.original_image_mime_type ?? null);
  const existingBoxes: ExistingDisplayBox[] =
    session?.detections
      .filter((detection) => detection.user_decision !== "manually_added")
      .flatMap((detection, index) => {
        const box = reviewBoxToDisplayBox(detection.corrected_box ?? detection.original_box, originalSize, displaySize);
        return box ? [{ ...box, label: String(index + 1) }] : [];
      }) ?? [];
  const correctedBox = selectedBox ? convertDisplayBoxToOriginal(selectedBox, displaySize, originalSize) : null;
  const validationMessage = correctedBox ? validateOriginalBox(correctedBox, originalSize) : null;
  const savedBoxes = manualDetections(session);

  React.useEffect(() => {
    setSelectedBox(null);
    setCropPreviewUrl(null);
    setSelectedProductId("");
    setExternalProductId("");
    setStatusMessage(null);
  }, [selectedSessionId]);

  React.useEffect(() => {
    if (!selectedBox || !imageUrl) {
      setCropPreviewUrl(null);
      return;
    }
    let cancelled = false;
    createCropPreview(imageUrl, selectedBox, displaySize)
      .then((preview) => {
        if (!cancelled) {
          setCropPreviewUrl(preview);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCropPreviewUrl(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [displaySize.height, displaySize.width, imageUrl, selectedBox]);

  const handleBoxChange = (box: DisplayBox | null): void => {
    setSelectedBox(box);
    setStatusMessage(null);
  };

  const handleSave = (): void => {
    if (!selectedBox || !correctedBox || validationMessage) {
      return;
    }
    addMutation.mutate({
      corrected_box: correctedBox,
      confirmed_product_id: selectedProductId || null,
      external_product_id: externalProductId.trim() || null,
      user_decision: "manually_added",
      displayed_box: [selectedBox.x1, selectedBox.y1, selectedBox.x2, selectedBox.y2],
      display_size: [displaySize.width, displaySize.height],
      source: "human_missing_box",
    });
  };

  return (
    <section className="space-y-4 pb-6">
      <div className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:grid-cols-[minmax(0,1fr)_420px] md:items-center">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Vẽ vùng sản phẩm bị thiếu</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
            Chọn phiên nhận diện, kéo chuột trực tiếp trên ảnh rồi lưu vùng còn thiếu vào dữ liệu huấn luyện AI.
          </p>
        </div>
        <div className="w-full">
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Phiên nhận diện
          </label>
          {sessionsQuery.isLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            <select
              value={selectedSessionId ?? ""}
              onChange={(event) => setSelectedSessionId(Number(event.target.value))}
              className="h-12 w-full rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
            >
              {sessionsQuery.data?.map((sessionItem) => (
                <option key={sessionItem.id} value={sessionItem.id}>
                  {formatSessionLabel(sessionItem)}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {sessionsQuery.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Không tải được danh sách phiên: {sessionsQuery.error.message}
        </div>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-950">Ảnh cần bổ sung vùng</h3>
              <p className="text-sm text-slate-500">Kéo một vùng quanh sản phẩm mà AI còn bỏ sót.</p>
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-3 w-5 rounded-sm border-2 border-dashed border-blue-600" />
                AI đã nhận diện
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-3 w-5 rounded-sm border-2 border-emerald-600" />
                Vùng mới
              </span>
            </div>
          </div>
          {sessionQuery.isLoading ? (
            <Skeleton className="h-[560px] w-full" />
          ) : sessionQuery.error ? (
            <div className="flex h-[420px] items-center justify-center rounded-lg border border-red-200 bg-red-50 text-sm text-red-700">
              Không tải được phiên: {sessionQuery.error.message}
            </div>
          ) : (
            <MissingBoxCanvas
              imageBase64={session?.original_image_base64 ?? null}
              mimeType={session?.preview_image_mime_type ?? session?.original_image_mime_type ?? null}
              width={displaySize.width}
              height={displaySize.height}
              existingBoxes={existingBoxes}
              selectedBox={selectedBox}
              onSelectedBoxChange={handleBoxChange}
            />
          )}
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-0">
          <Card className="overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle>Vùng vừa chọn</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!selectedBox ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                  Chưa chọn vùng. Hãy kéo chuột trên ảnh để khoanh vùng sản phẩm bị thiếu.
                </div>
              ) : (
                <>
                  {cropPreviewUrl ? (
                    <img
                      src={cropPreviewUrl}
                      alt="Ảnh cắt vùng vừa chọn"
                      className="aspect-video w-full rounded-lg border border-slate-200 object-contain"
                    />
                  ) : (
                    <Skeleton className="h-40 w-full" />
                  )}
                  <div className="rounded-md bg-slate-50 p-3 text-xs text-slate-600">
                    Tọa độ ảnh gốc: {correctedBox?.map((value) => Math.round(value)).join(", ")}
                  </div>
                  {validationMessage && (
                    <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span>{validationMessage}</span>
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Gán sản phẩm có sẵn</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                      <Input
                        value={productSearch}
                        onChange={(event) => setProductSearch(event.target.value)}
                        placeholder="Tìm mã hoặc tên sản phẩm"
                        className="pl-9"
                      />
                    </div>
                    <select
                      value={selectedProductId}
                      onChange={(event) => setSelectedProductId(event.target.value)}
                      className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-slate-400"
                    >
                      <option value="">Không gán sản phẩm</option>
                      {productsQuery.data?.map((product) => (
                        <option key={product.product_id} value={product.product_id}>
                          {product.product_id} · {product.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-700">Mã ngoài hệ thống</label>
                    <Input
                      value={externalProductId}
                      onChange={(event) => setExternalProductId(event.target.value)}
                      placeholder="Nhập nếu chưa có SKU trong hệ thống"
                    />
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={!selectedBox || Boolean(validationMessage) || addMutation.isPending}
                    onClick={handleSave}
                  >
                    {addMutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    Lưu vùng vừa chọn
                  </Button>
                </>
              )}
              {statusMessage && (
                <div className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{statusMessage}</span>
                </div>
              )}
              {addMutation.error && (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {addMutation.error.message}
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <Card className="min-h-0">
        <CardHeader className="flex-row items-center justify-between pb-3">
          <div>
            <CardTitle>Vùng đã lưu</CardTitle>
            <p className="mt-1 text-sm text-slate-500">Các vùng người dùng đã bổ sung cho phiên đang chọn.</p>
          </div>
          <Badge variant="secondary">{savedBoxes.length} vùng</Badge>
        </CardHeader>
        <CardContent>
          {savedBoxes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              Chưa có vùng nào được lưu cho phiên này.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {savedBoxes.map((detection) => {
                const title = detection.confirmed_product_id || detection.predicted_product_id || `Vùng #${detection.detection_index}`;
                return (
                  <div
                    key={detection.id}
                    className={cn(
                      "overflow-hidden rounded-lg border border-slate-200 bg-white",
                      deleteMutation.isPending && "opacity-70",
                    )}
                  >
                    {detection.crop_preview_base64 ? (
                      <img
                        src={buildImageDataUrl(detection.crop_preview_base64, "image/jpeg") ?? ""}
                        alt={title}
                        className="h-32 w-full bg-slate-100 object-cover"
                      />
                    ) : (
                      <div className="flex h-32 items-center justify-center bg-slate-100 text-xs text-slate-500">
                        Không có ảnh cắt
                      </div>
                    )}
                    <div className="flex items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">{title}</p>
                        <p className="text-xs text-slate-500">#{detection.detection_index}</p>
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        disabled={deleteMutation.isPending}
                        onClick={() => deleteMutation.mutate(detection.id)}
                        aria-label="Xóa vùng đã lưu"
                      >
                        <Trash2 className="h-4 w-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {deleteMutation.error && (
            <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {deleteMutation.error.message}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
};
