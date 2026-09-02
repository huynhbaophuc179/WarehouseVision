import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  ImageOff,
  Loader2,
  PlusCircle,
  Search,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  createProductWithImage,
  deleteReviewSession,
  fetchProducts,
  fetchReviewSession,
  fetchReviewSessions,
  updateDetectionReview,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  DetectionReviewResponse,
  DetectionReviewUpdateRequest,
  Product,
  RecognitionSessionDetail,
  RecognitionSessionSummary,
} from "@/types/api";

export interface ReviewPageProps {
  apiBaseUrl: string;
}

type ReviewDecision = "existing" | "new" | "skip";
const detailGridClass = "grid grid-cols-[84px_minmax(260px,1fr)_150px_220px_360px_80px]";

interface ReviewDraft {
  decision: ReviewDecision;
  productId: string;
  newProductId: string;
  newProductName: string;
  newInventoryCount: number;
}

const pageSize = 12;

const imageSrc = (base64?: string | null, mimeType = "image/jpeg"): string | null =>
  base64 ? `data:${mimeType};base64,${base64}` : null;

const base64ToFile = (base64: string, filename: string, mimeType: string): File => {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new File([bytes], filename, { type: mimeType });
};

const formatDateTime = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
  });
};

const sessionStatusLabel = (status: string): string => {
  const labels: Record<string, string> = {
    open: "Đang mở",
    reviewed: "Đã xử lý",
    closed: "Đã đóng",
  };
  return labels[status] ?? status;
};

const sessionStatusTone = (session: RecognitionSessionSummary): "success" | "warning" | "secondary" => {
  if ((session.pending_count ?? 0) > 0) {
    return "warning";
  }
  if ((session.detection_count ?? 0) > 0) {
    return "success";
  }
  return "secondary";
};

const reviewDecisionLabel = (decision: string): string => {
  const labels: Record<string, string> = {
    accepted: "Đã nhận",
    corrected_product: "Đã nhận",
    manually_added: "Đã thêm",
    unknown: "Sản phẩm mới",
    needs_review: "Cần xử lý",
    ignored: "Đã bỏ qua",
    not_product: "Không nhận",
    rejected_detection: "Không nhận",
    wrong_sku: "Sai mã",
  };
  return labels[decision] ?? decision;
};

const reviewStatusTone = (decision: string): "success" | "warning" | "destructive" | "secondary" => {
  if (decision === "accepted" || decision === "corrected_product" || decision === "manually_added") {
    return "success";
  }
  if (decision === "not_product" || decision === "rejected_detection") {
    return "destructive";
  }
  if (decision === "ignored" || decision === "needs_review") {
    return "warning";
  }
  return "secondary";
};

const predictedName = (detection: DetectionReviewResponse): string => {
  const candidate = detection.candidates[0];
  if (detection.confirmed_product_id) {
    return detection.confirmed_product_id;
  }
  if (detection.predicted_product_id) {
    return detection.predicted_product_id;
  }
  if (candidate?.product_id) {
    return candidate.product_id;
  }
  return "Chưa xác định";
};

const draftFromDetection = (detection: DetectionReviewResponse): ReviewDraft => {
  if (detection.user_decision === "ignored" || detection.user_decision === "not_product" || detection.user_decision === "rejected_detection") {
    return {
      decision: "skip",
      productId: "",
      newProductId: "",
      newProductName: "",
      newInventoryCount: 0,
    };
  }
  if (detection.user_decision === "unknown" || detection.user_decision === "wrong_sku") {
    return {
      decision: "new",
      productId: "",
      newProductId: "",
      newProductName: "",
      newInventoryCount: 0,
    };
  }
  return {
    decision: "existing",
    productId:
      detection.confirmed_product_id ??
      detection.predicted_product_id ??
      detection.candidates[0]?.product_id ??
      "",
    newProductId: "",
    newProductName: "",
    newInventoryCount: 0,
  };
};

const existingProductPayload = (productId: string): DetectionReviewUpdateRequest => ({
  user_decision: "corrected_product",
  confirmed_product_id: productId,
  add_as_reference: true,
  reference_quality_status: "approved",
  use_for_yolo_training: false,
});

const skipPayload = (): DetectionReviewUpdateRequest => ({
  user_decision: "ignored",
  confirmed_product_id: null,
  add_as_reference: false,
  use_for_yolo_training: false,
});

const newProductReviewPayload = (productId: string): DetectionReviewUpdateRequest => ({
  user_decision: "corrected_product",
  confirmed_product_id: productId,
  add_as_reference: false,
  use_for_yolo_training: false,
});

const filterSessions = (sessions: RecognitionSessionSummary[], search: string): RecognitionSessionSummary[] => {
  const query = search.trim().toLowerCase();
  if (!query) {
    return sessions;
  }
  return sessions.filter((session) =>
    [`${session.id}`, session.status, session.mode, session.model_version ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(query),
  );
};

export const ReviewPage = ({ apiBaseUrl }: ReviewPageProps): JSX.Element => {
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");
  const [selectedSessionId, setSelectedSessionId] = React.useState<number | null>(null);
  const [sessionPage, setSessionPage] = React.useState(1);
  const [drafts, setDrafts] = React.useState<Record<number, ReviewDraft>>({});
  const [notice, setNotice] = React.useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = React.useState(false);
  const [confirmNewReviewId, setConfirmNewReviewId] = React.useState<number | null>(null);
  const deferredSearch = React.useDeferredValue(search);

  const sessionsQuery = useQuery<RecognitionSessionSummary[], Error>({
    queryKey: ["review-sessions", apiBaseUrl],
    queryFn: () => fetchReviewSessions(apiBaseUrl, 1000),
    staleTime: 15_000,
  });

  const visibleSessions = React.useMemo(
    () => filterSessions(sessionsQuery.data ?? [], deferredSearch),
    [deferredSearch, sessionsQuery.data],
  );
  const totalPages = Math.max(1, Math.ceil(visibleSessions.length / pageSize));
  const pagedSessions = visibleSessions.slice((sessionPage - 1) * pageSize, sessionPage * pageSize);

  React.useEffect(() => {
    setSessionPage(1);
  }, [deferredSearch]);

  const sessionQuery = useQuery<RecognitionSessionDetail, Error>({
    queryKey: ["review-session", apiBaseUrl, selectedSessionId],
    queryFn: () => fetchReviewSession(apiBaseUrl, selectedSessionId ?? 0),
    enabled: selectedSessionId !== null,
  });

  const productsQuery = useQuery<Product[], Error>({
    queryKey: ["products", apiBaseUrl, "review-picker"],
    queryFn: () => fetchProducts(apiBaseUrl, "", 500),
    staleTime: 30_000,
  });

  React.useEffect(() => {
    const detections = sessionQuery.data?.detections ?? [];
    setDrafts(
      detections.reduce<Record<number, ReviewDraft>>((accumulator, detection) => {
        accumulator[detection.id] = draftFromDetection(detection);
        return accumulator;
      }, {}),
    );
    setDeleteArmed(false);
    setNotice(null);
    setConfirmNewReviewId(null);
  }, [sessionQuery.data]);

  const updateMutation = useMutation({
    mutationFn: ({ reviewId, payload }: { reviewId: number; payload: DetectionReviewUpdateRequest }) =>
      updateDetectionReview(apiBaseUrl, reviewId, payload),
    onSuccess: async () => {
      setNotice("Đã lưu quyết định vật thể.");
      setConfirmNewReviewId(null);
      await queryClient.invalidateQueries({ queryKey: ["review-session", apiBaseUrl, selectedSessionId] });
      await queryClient.invalidateQueries({ queryKey: ["review-sessions", apiBaseUrl] });
      await queryClient.invalidateQueries({ queryKey: ["products", apiBaseUrl] });
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async ({ detection, draft }: { detection: DetectionReviewResponse; draft: ReviewDraft }) => {
      if (!detection.crop_preview_base64) {
        throw new Error("Vật thể này chưa có ảnh cắt để tạo sản phẩm mới.");
      }
      const file = base64ToFile(detection.crop_preview_base64, `review-${detection.id}.jpg`, "image/jpeg");
      await createProductWithImage(apiBaseUrl, {
        productId: draft.newProductId.trim(),
        name: draft.newProductName.trim(),
        inventoryCount: draft.newInventoryCount,
        file,
      });
      return updateDetectionReview(apiBaseUrl, detection.id, newProductReviewPayload(draft.newProductId.trim()));
    },
    onSuccess: async () => {
      setNotice("Đã tạo sản phẩm mới và lưu ảnh tham chiếu.");
      setConfirmNewReviewId(null);
      await queryClient.invalidateQueries({ queryKey: ["review-session", apiBaseUrl, selectedSessionId] });
      await queryClient.invalidateQueries({ queryKey: ["review-sessions", apiBaseUrl] });
      await queryClient.invalidateQueries({ queryKey: ["products", apiBaseUrl] });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: number) => deleteReviewSession(apiBaseUrl, sessionId),
    onSuccess: async () => {
      setNotice("Đã xóa phiên.");
      setSelectedSessionId(null);
      await queryClient.invalidateQueries({ queryKey: ["review-sessions", apiBaseUrl] });
    },
  });

  const selectedSession = sessionQuery.data;
  const sessionImage = imageSrc(
    selectedSession?.original_image_base64,
    selectedSession?.preview_image_mime_type ?? selectedSession?.original_image_mime_type ?? "image/jpeg",
  );

  const updateDraft = (reviewId: number, patch: Partial<ReviewDraft>): void => {
    setDrafts((current) => ({
      ...current,
      [reviewId]: {
        ...(current[reviewId] ?? {
          decision: "existing",
          productId: "",
          newProductId: "",
          newProductName: "",
          newInventoryCount: 0,
        }),
        ...patch,
      },
    }));
    if (patch.decision !== undefined || patch.newProductId !== undefined || patch.newProductName !== undefined) {
      setConfirmNewReviewId(null);
    }
  };

  const saveReview = (detection: DetectionReviewResponse): void => {
    const draft = drafts[detection.id] ?? draftFromDetection(detection);
    if (draft.decision === "skip") {
      updateMutation.mutate({ reviewId: detection.id, payload: skipPayload() });
      return;
    }
    if (draft.decision === "existing") {
      if (!draft.productId) {
        setNotice("Cần chọn sản phẩm có sẵn trước khi lưu.");
        return;
      }
      updateMutation.mutate({ reviewId: detection.id, payload: existingProductPayload(draft.productId) });
      return;
    }
    if (!draft.newProductId.trim() || !draft.newProductName.trim()) {
      setNotice("Cần nhập mã và tên sản phẩm mới trước khi tạo.");
      return;
    }
    if (confirmNewReviewId !== detection.id) {
      setConfirmNewReviewId(detection.id);
      return;
    }
    createProductMutation.mutate({ detection, draft });
  };

  const handleDeleteSelectedSession = (): void => {
    if (!selectedSessionId) {
      return;
    }
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    deleteSessionMutation.mutate(selectedSessionId);
  };

  const renderError = (): JSX.Element | null => {
    const message =
      sessionsQuery.error?.message ||
      sessionQuery.error?.message ||
      productsQuery.error?.message ||
      updateMutation.error?.message ||
      createProductMutation.error?.message ||
      deleteSessionMutation.error?.message;
    if (!message) {
      return null;
    }
    return <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{message}</div>;
  };

  if (selectedSessionId !== null) {
    return (
      <section className="flex h-full min-h-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setSelectedSessionId(null)}>
              <ArrowLeft className="h-4 w-4" />
              Danh sách
            </Button>
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight text-slate-950">
                Phiên {selectedSession ? `#${selectedSession.id}` : ""}
              </h2>
              <p className="text-xs text-slate-500">Xử lý ảnh chưa xác định.</p>
            </div>
          </div>
          <Button
            variant={deleteArmed ? "destructive" : "outline"}
            size="sm"
            disabled={deleteSessionMutation.isPending}
            onClick={handleDeleteSelectedSession}
          >
            {deleteSessionMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {deleteArmed ? "Bấm lại để xóa" : "Xóa phiên"}
          </Button>
        </div>

        {notice && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
        {renderError()}

        {sessionQuery.isLoading ? (
          <div className="grid gap-3 lg:grid-cols-[280px_1fr]">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-72 w-full" />
          </div>
        ) : selectedSession ? (
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div className="flex min-h-0 flex-col gap-3">
              <Card>
                <CardContent className="p-3">
                  <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                    {sessionImage ? (
                      <img src={sessionImage} alt={`Phiên ${selectedSession.id}`} className="h-full w-full object-cover" />
                    ) : (
                      <ImageOff className="h-8 w-8 text-slate-400" />
                    )}
                  </div>
                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-semibold text-slate-950">Phiên #{selectedSession.id}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(selectedSession.created_at)}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-slate-200 bg-slate-50">
                <CardContent className="space-y-3 p-3 text-sm text-slate-700">
                  <p className="font-semibold text-slate-950">Cách xử lý</p>
                  <div className="space-y-2 text-xs leading-5">
                    <p>
                      <span className="font-semibold text-emerald-700">Đúng, có sẵn:</span> lưu ảnh cắt vào mã hàng đã chọn để lần sau nhận diện ổn hơn.
                    </p>
                    <p>
                      <span className="font-semibold text-blue-700">Đúng, chưa có:</span> tạo mã hàng mới từ ảnh cắt hiện tại, bước này cần xác nhận trước khi lưu.
                    </p>
                    <p>
                      <span className="font-semibold text-slate-700">Bỏ qua:</span> không lưu ảnh cắt này cho mã hàng.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="min-h-0 overflow-hidden">
              <CardContent className="flex h-full min-h-0 flex-col p-3">
                <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
                  <div className="min-w-[1180px]">
                    <div className={cn(detailGridClass, "sticky top-0 z-10 items-center border-b border-slate-200 bg-slate-50")}>
                      <div className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Ảnh</div>
                      <div className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Vật thể</div>
                      <div className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Trạng thái</div>
                      <div className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Quyết định</div>
                      <div className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Mã hàng</div>
                      <div className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Lưu</div>
                    </div>

                    {selectedSession.detections.length === 0 ? (
                      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                        Phiên này chưa có vật thể.
                      </div>
                    ) : (
                      selectedSession.detections.map((detection) => {
                        const draft = drafts[detection.id] ?? draftFromDetection(detection);
                        const crop = imageSrc(detection.crop_preview_base64);
                        const saving =
                          updateMutation.isPending ||
                          (createProductMutation.isPending && confirmNewReviewId === detection.id);
                        const showNewProductConfirm = draft.decision === "new" && confirmNewReviewId === detection.id;

                        return (
                          <div key={detection.id} className="border-b border-slate-200 hover:bg-slate-50">
                            <div className={cn(detailGridClass, "items-start")}>
                              <div className="px-3 py-3">
                                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                                  {crop ? (
                                    <img src={crop} alt={`Vật thể ${detection.detection_index}`} className="h-full w-full object-cover" />
                                  ) : (
                                    <ImageOff className="h-4 w-4 text-slate-400" />
                                  )}
                                </div>
                              </div>
                              <div className="min-w-0 px-3 py-3">
                                <p className="truncate text-sm font-semibold text-slate-950">Vật thể #{detection.detection_index}</p>
                                <p className="truncate text-xs text-slate-500">Hệ thống gợi ý: {predictedName(detection)}</p>
                              </div>
                              <div className="px-3 py-3">
                                <Badge variant={reviewStatusTone(detection.user_decision)}>
                                  {reviewDecisionLabel(detection.user_decision)}
                                </Badge>
                              </div>
                              <div className="px-3 py-3">
                                <select
                                  value={draft.decision}
                                  onChange={(event) =>
                                    updateDraft(detection.id, { decision: event.target.value as ReviewDecision })
                                  }
                                  className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800"
                                >
                                  <option value="existing">Đúng, có sẵn</option>
                                  <option value="new">Đúng, chưa có</option>
                                  <option value="skip">Bỏ qua</option>
                                </select>
                              </div>
                              <div className="space-y-2 px-3 py-3">
                                {draft.decision === "existing" ? (
                                  <select
                                    value={draft.productId}
                                    onChange={(event) => updateDraft(detection.id, { productId: event.target.value })}
                                    className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800"
                                  >
                                    <option value="">Chọn mã hàng có sẵn</option>
                                    {productsQuery.data?.map((product) => (
                                      <option key={product.product_id} value={product.product_id}>
                                        {product.product_id} · {product.name}
                                      </option>
                                    ))}
                                  </select>
                                ) : null}
                                {draft.decision === "new" ? (
                                  <div className="grid gap-2">
                                    <Input
                                      className="h-9"
                                      value={draft.newProductId}
                                      placeholder="Mã hàng mới"
                                      onChange={(event) => updateDraft(detection.id, { newProductId: event.target.value })}
                                    />
                                    <Input
                                      className="h-9"
                                      value={draft.newProductName}
                                      placeholder="Tên mã hàng mới"
                                      onChange={(event) => updateDraft(detection.id, { newProductName: event.target.value })}
                                    />
                                    <Input
                                      className="h-9"
                                      type="number"
                                      min={0}
                                      value={draft.newInventoryCount}
                                      placeholder="Tồn kho ban đầu"
                                      onChange={(event) =>
                                        updateDraft(detection.id, {
                                          newInventoryCount: Number.parseInt(event.target.value || "0", 10),
                                        })
                                      }
                                    />
                                  </div>
                                ) : null}
                                {draft.decision === "skip" ? (
                                  <p className="rounded-md bg-slate-100 px-3 py-2 text-xs text-slate-600">
                                    Không lưu ảnh cắt này cho mã hàng.
                                  </p>
                                ) : null}
                              </div>
                              <div className="px-3 py-3">
                                <div className="flex justify-end">
                                  <Button size="sm" variant="outline" disabled={saving} onClick={() => saveReview(detection)}>
                                    {saving ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : draft.decision === "new" ? (
                                      <PlusCircle className="h-4 w-4" />
                                    ) : (
                                      <CheckCircle2 className="h-4 w-4" />
                                    )}
                                  </Button>
                                </div>
                              </div>
                            </div>
                            {showNewProductConfirm ? (
                              <div className="ml-[84px] mr-3 mb-3 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                                <div className="flex items-center justify-between gap-3">
                                  <p>
                                    Xác nhận tạo mã hàng mới <span className="font-semibold">{draft.newProductId}</span> từ ảnh cắt này?
                                  </p>
                                  <div className="flex gap-2">
                                    <Button size="sm" variant="outline" onClick={() => setConfirmNewReviewId(null)}>
                                      Hủy
                                    </Button>
                                    <Button size="sm" onClick={() => saveReview(detection)} disabled={createProductMutation.isPending}>
                                      {createProductMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                      Xác nhận tạo
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      {notice && <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</div>}
      {renderError()}

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <Input
          value={search}
          className="h-9 bg-white pl-9"
          placeholder="Tìm phiên"
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      <Card className="min-h-0 flex-1 overflow-hidden">
        <CardContent className="h-full overflow-auto p-0">
          {sessionsQuery.isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="min-w-[680px]">
              <div className="sticky top-0 z-10 flex items-center border-b border-slate-200 bg-slate-50">
                <div className="w-24 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Phiên</div>
                <div className="min-w-0 flex-1 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Thời gian</div>
                <div className="w-32 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Trạng thái</div>
                <div className="w-24 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Còn lại</div>
                <div className="w-20 shrink-0 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Mở</div>
              </div>
              {pagedSessions.length === 0 ? (
                <div className="flex h-48 items-center justify-center text-sm text-slate-500">Không có phiên phù hợp.</div>
              ) : (
                pagedSessions.map((session) => (
                  <div key={session.id} className="flex items-center border-b border-slate-200 hover:bg-slate-50">
                    <div className="w-24 shrink-0 px-3 py-3 text-sm font-semibold text-slate-950">#{session.id}</div>
                    <div className="min-w-0 flex-1 px-3 py-3">
                      <p className="truncate text-sm font-medium text-slate-950">{formatDateTime(session.created_at)}</p>
                    </div>
                    <div className="w-32 shrink-0 px-3 py-3">
                      <Badge variant={sessionStatusTone(session)}>{sessionStatusLabel(session.status)}</Badge>
                    </div>
                    <div className="w-24 shrink-0 px-3 py-3 text-sm font-semibold text-slate-950">{session.pending_count ?? 0}</div>
                    <div className="w-20 shrink-0 px-3 py-3">
                      <div className="flex justify-end">
                        <Button size="sm" variant="outline" onClick={() => setSelectedSessionId(session.id)}>
                          Mở
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </CardContent>
        <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2">
          <span className="text-xs text-slate-500">
            Trang {sessionPage}/{totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={sessionPage <= 1}
              onClick={() => setSessionPage((current) => Math.max(1, current - 1))}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={sessionPage >= totalPages}
              onClick={() => setSessionPage((current) => Math.min(totalPages, current + 1))}
            >
              Sau
            </Button>
          </div>
        </div>
      </Card>
    </section>
  );
};
