import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ImageOff, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
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

type ObjectDecision = "existing" | "new" | "reject";

interface ObjectDraft {
  decision: ObjectDecision;
  productId: string;
}

const pageSize = 12;

const imageSrc = (base64?: string | null, mimeType = "image/jpeg"): string | null =>
  base64 ? `data:${mimeType};base64,${base64}` : null;

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

const objectDecisionLabel = (decision: string): string => {
  const labels: Record<string, string> = {
    accepted: "Đã nhận",
    corrected_product: "Đã nhận",
    manually_added: "Đã thêm",
    unknown: "Sản phẩm mới",
    needs_review: "Chờ xử lý",
    ignored: "Chờ xử lý",
    not_product: "Không nhận",
    rejected_detection: "Không nhận",
    wrong_sku: "Sai SKU",
  };
  return labels[decision] ?? decision;
};

const objectStatusTone = (decision: string): "success" | "warning" | "destructive" | "secondary" => {
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

const draftFromDetection = (detection: DetectionReviewResponse): ObjectDraft => {
  if (detection.user_decision === "not_product" || detection.user_decision === "rejected_detection") {
    return { decision: "reject", productId: "" };
  }
  if (detection.user_decision === "unknown" || detection.user_decision === "wrong_sku") {
    return { decision: "new", productId: "" };
  }
  return {
    decision: "existing",
    productId:
      detection.confirmed_product_id ??
      detection.predicted_product_id ??
      detection.candidates[0]?.product_id ??
      "",
  };
};

const updatePayloadFromDraft = (draft: ObjectDraft): DetectionReviewUpdateRequest => {
  if (draft.decision === "reject") {
    return {
      user_decision: "not_product",
      confirmed_product_id: null,
      add_as_reference: false,
      use_for_yolo_training: false,
    };
  }
  if (draft.decision === "new") {
    return {
      user_decision: "unknown",
      confirmed_product_id: null,
      add_as_reference: false,
      use_for_yolo_training: false,
    };
  }
  return {
    user_decision: "corrected_product",
    confirmed_product_id: draft.productId,
    add_as_reference: false,
    use_for_yolo_training: false,
  };
};

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
  const [productSearch, setProductSearch] = React.useState("");
  const [selectedSessionId, setSelectedSessionId] = React.useState<number | null>(null);
  const [sessionPage, setSessionPage] = React.useState(1);
  const [drafts, setDrafts] = React.useState<Record<number, ObjectDraft>>({});
  const [notice, setNotice] = React.useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = React.useState(false);
  const deferredSearch = React.useDeferredValue(search);
  const deferredProductSearch = React.useDeferredValue(productSearch);

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

  React.useEffect(() => {
    if (selectedSessionId || !visibleSessions.length) {
      return;
    }
    setSelectedSessionId(visibleSessions[0].id);
  }, [selectedSessionId, visibleSessions]);

  const sessionQuery = useQuery<RecognitionSessionDetail, Error>({
    queryKey: ["review-session", apiBaseUrl, selectedSessionId],
    queryFn: () => fetchReviewSession(apiBaseUrl, selectedSessionId ?? 0),
    enabled: selectedSessionId !== null,
  });

  const productsQuery = useQuery<Product[], Error>({
    queryKey: ["products", apiBaseUrl, deferredProductSearch],
    queryFn: () => fetchProducts(apiBaseUrl, deferredProductSearch, 150),
    staleTime: 30_000,
  });

  React.useEffect(() => {
    const detections = sessionQuery.data?.detections ?? [];
    setDrafts(
      detections.reduce<Record<number, ObjectDraft>>((accumulator, detection) => {
        accumulator[detection.id] = draftFromDetection(detection);
        return accumulator;
      }, {}),
    );
    setDeleteArmed(false);
    setNotice(null);
  }, [sessionQuery.data]);

  const updateMutation = useMutation({
    mutationFn: ({ reviewId, payload }: { reviewId: number; payload: DetectionReviewUpdateRequest }) =>
      updateDetectionReview(apiBaseUrl, reviewId, payload),
    onSuccess: async () => {
      setNotice("Đã lưu quyết định object.");
      await queryClient.invalidateQueries({ queryKey: ["review-session", apiBaseUrl, selectedSessionId] });
      await queryClient.invalidateQueries({ queryKey: ["review-sessions", apiBaseUrl] });
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

  const stats = {
    total: sessionsQuery.data?.length ?? 0,
    pending: (sessionsQuery.data ?? []).filter((session) => (session.pending_count ?? 0) > 0).length,
    objects: (sessionsQuery.data ?? []).reduce((sum, session) => sum + (session.detection_count ?? 0), 0),
  };

  const updateDraft = (reviewId: number, patch: Partial<ObjectDraft>): void => {
    setDrafts((current) => ({
      ...current,
      [reviewId]: {
        ...(current[reviewId] ?? { decision: "new", productId: "" }),
        ...patch,
      },
    }));
  };

  const saveObject = (detection: DetectionReviewResponse): void => {
    const draft = drafts[detection.id] ?? draftFromDetection(detection);
    if (draft.decision === "existing" && !draft.productId) {
      setNotice("Cần chọn sản phẩm có sẵn trước khi lưu.");
      return;
    }
    updateMutation.mutate({
      reviewId: detection.id,
      payload: updatePayloadFromDraft(draft),
    });
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

  return (
    <section className="flex h-full min-h-0 flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold leading-tight text-slate-950">Quản lý phiên</h2>
          <p className="text-xs text-slate-500">Quản lý phiên nhận diện và xử lý các object trong từng phiên.</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{visibleSessions.length} phiên</Badge>
          <Badge variant="warning">{stats.pending} cần xử lý</Badge>
          <Badge variant="secondary">{stats.objects} object</Badge>
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
                placeholder="Tìm mã phiên, trạng thái hoặc model"
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={sessionsQuery.isFetching}
              onClick={() => queryClient.invalidateQueries({ queryKey: ["review-sessions", apiBaseUrl] })}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", sessionsQuery.isFetching && "animate-spin")} />
              Làm mới
            </Button>
          </div>
        </CardContent>
      </Card>

      {notice && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {notice}
        </div>
      )}
      {(sessionsQuery.error || sessionQuery.error || productsQuery.error || updateMutation.error || deleteSessionMutation.error) && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {sessionsQuery.error?.message ||
            sessionQuery.error?.message ||
            productsQuery.error?.message ||
            updateMutation.error?.message ||
            deleteSessionMutation.error?.message}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <Card className="max-h-[250px] min-h-[180px] overflow-hidden">
          <CardContent className="h-full overflow-auto p-0">
            {sessionsQuery.isLoading ? (
              <div className="space-y-2 p-3">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <div className="min-w-[760px]">
                <div className="flex items-center border-b border-slate-200 bg-slate-50">
                  <div className="w-28 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Phiên
                  </div>
                  <div className="min-w-0 flex-1 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Thời gian
                  </div>
                  <div className="w-32 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Trạng thái
                  </div>
                  <div className="w-28 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Object
                  </div>
                  <div className="w-28 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Còn lại
                  </div>
                </div>
                {pagedSessions.length === 0 ? (
                  <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                    Không có phiên phù hợp.
                  </div>
                ) : (
                  pagedSessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      onClick={() => setSelectedSessionId(session.id)}
                      className={cn(
                        "flex w-full items-center border-b border-slate-200 text-left transition-colors hover:bg-slate-50",
                        selectedSessionId === session.id && "bg-slate-100",
                      )}
                    >
                      <div className="w-28 shrink-0 px-3 py-3 text-sm font-semibold text-slate-950">
                        #{session.id}
                      </div>
                      <div className="min-w-0 flex-1 px-3 py-3">
                        <p className="truncate text-sm font-medium text-slate-950">{formatDateTime(session.created_at)}</p>
                        <p className="truncate text-xs text-slate-500">{session.mode === "operation" ? "Vận hành" : session.mode}</p>
                      </div>
                      <div className="w-32 shrink-0 px-3 py-3">
                        <Badge variant={sessionStatusTone(session)}>{sessionStatusLabel(session.status)}</Badge>
                      </div>
                      <div className="w-28 shrink-0 px-3 py-3 text-sm font-semibold text-slate-950">
                        {session.detection_count ?? 0}
                      </div>
                      <div className="w-28 shrink-0 px-3 py-3 text-sm font-semibold text-slate-950">
                        {session.pending_count ?? 0}
                      </div>
                    </button>
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

        <Card className="min-h-0 flex-1 overflow-hidden">
          <CardContent className="flex h-full min-h-0 flex-col gap-3 p-3">
            {!selectedSessionId ? (
              <div className="flex h-full items-center justify-center text-sm text-slate-500">Chọn một phiên để xem object.</div>
            ) : sessionQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : selectedSession ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <div className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                      {sessionImage ? (
                        <img src={sessionImage} alt={`Phiên ${selectedSession.id}`} className="h-full w-full object-cover" />
                      ) : (
                        <ImageOff className="h-5 w-5 text-slate-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-950">Phiên #{selectedSession.id}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(selectedSession.created_at)}</p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <Badge variant="secondary">{selectedSession.detection_count ?? 0} object</Badge>
                        <Badge variant="success">{selectedSession.reviewed_count ?? 0} đã xử lý</Badge>
                        <Badge variant="warning">{selectedSession.pending_count ?? 0} còn lại</Badge>
                      </div>
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

                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <Input
                    value={productSearch}
                    className="h-9 pl-9"
                    placeholder="Tìm SKU để gán nhanh cho object"
                    onChange={(event) => setProductSearch(event.target.value)}
                  />
                </div>

                <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
                  <div className="min-w-[920px]">
                    <div className="sticky top-0 z-10 flex items-center border-b border-slate-200 bg-slate-50">
                      <div className="w-20 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Ảnh</div>
                      <div className="min-w-0 flex-1 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Object</div>
                      <div className="w-40 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Trạng thái</div>
                      <div className="w-52 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Quyết định</div>
                      <div className="w-64 shrink-0 px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Sản phẩm</div>
                      <div className="w-24 shrink-0 px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Lưu</div>
                    </div>

                    {selectedSession.detections.length === 0 ? (
                      <div className="flex h-40 items-center justify-center text-sm text-slate-500">
                        Phiên này chưa có object.
                      </div>
                    ) : (
                      selectedSession.detections.map((detection) => {
                        const draft = drafts[detection.id] ?? draftFromDetection(detection);
                        const crop = imageSrc(detection.crop_preview_base64);
                        const productDisabled = draft.decision !== "existing";
                        const canSave = draft.decision !== "existing" || Boolean(draft.productId);

                        return (
                          <div key={detection.id} className="flex items-center border-b border-slate-200 hover:bg-slate-50">
                            <div className="w-20 shrink-0 px-3 py-2">
                              <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                                {crop ? (
                                  <img src={crop} alt={`Object ${detection.detection_index}`} className="h-full w-full object-cover" />
                                ) : (
                                  <ImageOff className="h-4 w-4 text-slate-400" />
                                )}
                              </div>
                            </div>
                            <div className="min-w-0 flex-1 px-3 py-2">
                              <p className="truncate text-sm font-semibold text-slate-950">Object #{detection.detection_index}</p>
                              <p className="truncate text-xs text-slate-500">AI gợi ý: {predictedName(detection)}</p>
                            </div>
                            <div className="w-40 shrink-0 px-3 py-2">
                              <Badge variant={objectStatusTone(detection.user_decision)}>
                                {objectDecisionLabel(detection.user_decision)}
                              </Badge>
                            </div>
                            <div className="w-52 shrink-0 px-3 py-2">
                              <select
                                value={draft.decision}
                                onChange={(event) => updateDraft(detection.id, { decision: event.target.value as ObjectDecision })}
                                className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800"
                              >
                                <option value="existing">Sản phẩm có sẵn</option>
                                <option value="new">Sản phẩm chưa có</option>
                                <option value="reject">Không nhận</option>
                              </select>
                            </div>
                            <div className="w-64 shrink-0 px-3 py-2">
                              <select
                                value={draft.productId}
                                disabled={productDisabled}
                                onChange={(event) => updateDraft(detection.id, { productId: event.target.value })}
                                className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                <option value="">Chọn SKU</option>
                                {productsQuery.data?.map((product) => (
                                  <option key={product.product_id} value={product.product_id}>
                                    {product.product_id} · {product.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div className="w-24 shrink-0 px-3 py-2">
                              <div className="flex justify-end">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={!canSave || updateMutation.isPending}
                                  onClick={() => saveObject(detection)}
                                >
                                  {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </section>
  );
};
