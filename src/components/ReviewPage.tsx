import { BackButton } from "@/components/ui/back-button";
import { Select, Table } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ImageOff,
  Loader2,
  Plus,
  PlusCircle,
  Trash2,
} from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ReviewSessionList } from "@/components/review-session-list";
import type { ReviewSessionListState } from "@/components/review-session-list";
import { DEFAULT_SESSION_FILTERS } from "@/lib/review-session-filters";
import {
  createProductWithImage,
  deleteReviewSession,
  fetchProducts,
  fetchReviewSession,
  fetchReviewSessions,
  updateDetectionReview,
} from "@/lib/api";
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

const MissingBoxPage = React.lazy(() => import("./MissingBoxPage").then((module) => ({ default: module.MissingBoxPage })));

type ReviewDecision = "existing" | "new" | "skip";

interface ReviewDraft {
  decision: ReviewDecision;
  productId: string;
  newProductId: string;
  newProductName: string;
  newInventoryCount: number;
}

const imageSrc = (
  base64?: string | null,
  mimeType = "image/jpeg",
): string | null => (base64 ? `data:${mimeType};base64,${base64}` : null);

const base64ToFile = (
  base64: string,
  filename: string,
  mimeType: string,
): File => {
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

const reviewStatusTone = (
  decision: string,
): "success" | "warning" | "destructive" | "secondary" => {
  if (
    decision === "accepted" ||
    decision === "corrected_product" ||
    decision === "manually_added"
  ) {
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

const draftFromDetection = (
  detection: DetectionReviewResponse,
): ReviewDraft => {
  if (
    detection.user_decision === "ignored" ||
    detection.user_decision === "not_product" ||
    detection.user_decision === "rejected_detection"
  ) {
    return {
      decision: "skip",
      productId: "",
      newProductId: "",
      newProductName: "",
      newInventoryCount: 0,
    };
  }
  if (
    detection.user_decision === "unknown" ||
    detection.user_decision === "wrong_sku"
  ) {
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

const existingProductPayload = (
  productId: string,
): DetectionReviewUpdateRequest => ({
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

const newProductReviewPayload = (
  productId: string,
): DetectionReviewUpdateRequest => ({
  user_decision: "corrected_product",
  confirmed_product_id: productId,
  add_as_reference: false,
  use_for_yolo_training: false,
});

export const ReviewPage = ({ apiBaseUrl }: ReviewPageProps): JSX.Element => {
  const queryClient = useQueryClient();
  const [listState, setListState] = React.useState<ReviewSessionListState>({
    filters: DEFAULT_SESSION_FILTERS, page: 1, pageSize: 20,
  });
  const [selectedSessionId, setSelectedSessionId] = React.useState<
    number | null
  >(null);
  const [missingBoxSessionId, setMissingBoxSessionId] = React.useState<number | null>(null);
  const [drafts, setDrafts] = React.useState<Record<number, ReviewDraft>>({});
  const [notice, setNotice] = React.useState<string | null>(null);
  const [deleteArmed, setDeleteArmed] = React.useState(false);
  const [confirmNewReviewId, setConfirmNewReviewId] = React.useState<
    number | null
  >(null);

  const sessionsQuery = useQuery<RecognitionSessionSummary[], Error>({
    queryKey: ["review-sessions", apiBaseUrl],
    queryFn: () => fetchReviewSessions(apiBaseUrl, 1000),
    staleTime: 15_000,
  });

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
      detections.reduce<Record<number, ReviewDraft>>(
        (accumulator, detection) => {
          accumulator[detection.id] = draftFromDetection(detection);
          return accumulator;
        },
        {},
      ),
    );
    setDeleteArmed(false);
    setNotice(null);
    setConfirmNewReviewId(null);
  }, [sessionQuery.data]);

  const updateMutation = useMutation({
    mutationFn: ({
      reviewId,
      payload,
    }: {
      reviewId: number;
      payload: DetectionReviewUpdateRequest;
    }) => updateDetectionReview(apiBaseUrl, reviewId, payload),
    onSuccess: async () => {
      setNotice("Đã lưu quyết định vật thể.");
      setConfirmNewReviewId(null);
      await queryClient.invalidateQueries({
        queryKey: ["review-session", apiBaseUrl, selectedSessionId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["review-sessions", apiBaseUrl],
      });
      await queryClient.invalidateQueries({
        queryKey: ["products", apiBaseUrl],
      });
    },
  });

  const createProductMutation = useMutation({
    mutationFn: async ({
      detection,
      draft,
    }: {
      detection: DetectionReviewResponse;
      draft: ReviewDraft;
    }) => {
      if (!detection.crop_preview_base64) {
        throw new Error("Vật thể này chưa có ảnh cắt để tạo sản phẩm mới.");
      }
      const file = base64ToFile(
        detection.crop_preview_base64,
        `review-${detection.id}.jpg`,
        "image/jpeg",
      );
      await createProductWithImage(apiBaseUrl, {
        productId: draft.newProductId.trim(),
        name: draft.newProductName.trim(),
        inventoryCount: draft.newInventoryCount,
        file,
      });
      return updateDetectionReview(
        apiBaseUrl,
        detection.id,
        newProductReviewPayload(draft.newProductId.trim()),
      );
    },
    onSuccess: async () => {
      setNotice("Đã tạo sản phẩm mới và lưu ảnh tham chiếu.");
      setConfirmNewReviewId(null);
      await queryClient.invalidateQueries({
        queryKey: ["review-session", apiBaseUrl, selectedSessionId],
      });
      await queryClient.invalidateQueries({
        queryKey: ["review-sessions", apiBaseUrl],
      });
      await queryClient.invalidateQueries({
        queryKey: ["products", apiBaseUrl],
      });
    },
  });

  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: number) =>
      deleteReviewSession(apiBaseUrl, sessionId),
    onSuccess: async () => {
      setNotice("Đã xóa phiên.");
      setSelectedSessionId(null);
      await queryClient.invalidateQueries({
        queryKey: ["review-sessions", apiBaseUrl],
      });
    },
  });

  const selectedSession = sessionQuery.data;
  const sessionImage = imageSrc(
    selectedSession?.original_image_base64,
    selectedSession?.preview_image_mime_type ??
      selectedSession?.original_image_mime_type ??
      "image/jpeg",
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
    if (
      patch.decision !== undefined ||
      patch.newProductId !== undefined ||
      patch.newProductName !== undefined
    ) {
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
      updateMutation.mutate({
        reviewId: detection.id,
        payload: existingProductPayload(draft.productId),
      });
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

  const errorMessage =
      sessionsQuery.error?.message ||
      sessionQuery.error?.message ||
      productsQuery.error?.message ||
      updateMutation.error?.message ||
      createProductMutation.error?.message ||
      deleteSessionMutation.error?.message;

  const renderError = (): JSX.Element | null => {
    if (!errorMessage) {
      return null;
    }
    return (
      <div className="rounded-md border border-danger-border bg-danger-surface px-3 py-2 text-sm text-danger">
        {errorMessage}
      </div>
    );
  };

  if (missingBoxSessionId !== null) {
    return (
      <React.Suspense fallback={<p role="status" className="p-6">Đang tải giao diện…</p>}>
        <MissingBoxPage key={missingBoxSessionId} apiBaseUrl={apiBaseUrl} sessionId={missingBoxSessionId}
          backLabel={selectedSessionId !== null ? "Quay lại chi tiết phiên" : "Quay lại danh sách phiên"}
          onBack={() => setMissingBoxSessionId(null)} />
      </React.Suspense>
    );
  }

  if (selectedSessionId !== null) {
    return (
      <section className="flex h-full min-h-0 flex-col gap-3 p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <BackButton aria-label="Quay lại danh sách phiên" onClick={() => setSelectedSessionId(null)} />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-tight text-content">
                Phiên {selectedSession ? `#${selectedSession.id}` : ""}
              </h2>
              <p className="text-xs text-muted">Xử lý ảnh chưa xác định.</p>
            </div>
          </div>
          <Button
            variant={deleteArmed ? "destructive" : "outline"}
            size="sm"
            disabled={deleteSessionMutation.isPending}
            onClick={handleDeleteSelectedSession}
          >
            {deleteSessionMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            {deleteArmed ? "Bấm lại để xóa" : "Xóa phiên"}
          </Button>
        </div>

        {notice && (
          <div className="rounded-md border border-success-border bg-success-surface px-3 py-2 text-sm text-success">
            {notice}
          </div>
        )}
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
                  <div className="flex h-40 items-center justify-center overflow-hidden rounded-lg border border-line bg-subtle">
                    {sessionImage ? (
                      <img
                        src={sessionImage}
                        alt={`Phiên ${selectedSession.id}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <ImageOff className="h-8 w-8 text-faint" />
                    )}
                  </div>
                  <div className="mt-3 space-y-1">
                    <p className="text-sm font-semibold text-content">
                      Phiên #{selectedSession.id}
                    </p>
                    <p className="text-xs text-muted">
                      {formatDateTime(selectedSession.created_at)}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-line bg-subtle">
                <CardContent className="space-y-3 p-3 text-sm text-secondary">
                  <p className="font-semibold text-content">Cách xử lý</p>
                  <div className="space-y-2 text-xs leading-5">
                    <p>
                      <span className="font-semibold text-success">
                        Đúng, có sẵn:
                      </span>{" "}
                      lưu ảnh cắt vào mã hàng đã chọn để lần sau nhận diện ổn
                      hơn.
                    </p>
                    <p>
                      <span className="font-semibold text-info">
                        Đúng, chưa có:
                      </span>{" "}
                      tạo mã hàng mới từ ảnh cắt hiện tại, bước này cần xác nhận
                      trước khi lưu.
                    </p>
                    <p>
                      <span className="font-semibold text-secondary">
                        Bỏ qua:
                      </span>{" "}
                      không lưu ảnh cắt này cho mã hàng.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card className="min-h-0 overflow-hidden">
              <CardContent className="flex h-full min-h-0 flex-col p-3">
                <div className="mb-3 flex justify-end">
                  <Button variant="success"
                    disabled={updateMutation.isPending || createProductMutation.isPending || deleteSessionMutation.isPending}
                    onClick={() => { setDeleteArmed(false); setMissingBoxSessionId(selectedSession.id); }}>
                    <Plus size={16} aria-hidden="true" />
                    Bổ sung
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-line">
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="key"
                    scroll={{ x: 1180 }}
                    expandable={{
                      showExpandColumn: false,
                      expandedRowKeys:
                        confirmNewReviewId === null ? [] : [confirmNewReviewId],
                      expandedRowRender: (record) => record.confirmation,
                    }}
                    locale={{ emptyText: "Phiên này chưa có vật thể." }}
                    dataSource={selectedSession.detections.map((detection) => {
                      const draft =
                        drafts[detection.id] ?? draftFromDetection(detection);
                      const crop = imageSrc(detection.crop_preview_base64);
                      const saving =
                        updateMutation.isPending ||
                        (createProductMutation.isPending &&
                          confirmNewReviewId === detection.id);
                      const showNewProductConfirm =
                        draft.decision === "new" &&
                        confirmNewReviewId === detection.id;
                      return {
                        key: detection.id,
                        confirmation: showNewProductConfirm ? (
                          <div className="ml-[84px] mr-3 mb-3 rounded-md border border-info-border bg-info-surface p-3 text-sm text-info">
                            <div className="flex items-center justify-between gap-3">
                              <p>
                                Xác nhận tạo mã hàng mới{" "}
                                <span className="font-semibold">
                                  {draft.newProductId}
                                </span>{" "}
                                từ ảnh cắt này?
                              </p>
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setConfirmNewReviewId(null)}
                                >
                                  Hủy
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => saveReview(detection)}
                                  disabled={createProductMutation.isPending}
                                >
                                  {createProductMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : null}
                                  Xác nhận tạo
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : null,
                        cell0: (
                          <div className="px-3 py-3">
                            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-md border border-line bg-subtle">
                              {crop ? (
                                <img
                                  src={crop}
                                  alt={`Vật thể ${detection.detection_index}`}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <ImageOff className="h-4 w-4 text-faint" />
                              )}
                            </div>
                          </div>
                        ),
                        cell1: (
                          <div className="min-w-0 px-3 py-3">
                            <p className="truncate text-sm font-semibold text-content">
                              Vật thể #{detection.detection_index}
                            </p>
                            <p className="truncate text-xs text-muted">
                              Hệ thống gợi ý: {predictedName(detection)}
                            </p>
                          </div>
                        ),
                        cell2: (
                          <div className="px-3 py-3">
                            <Badge
                              variant={reviewStatusTone(
                                detection.user_decision,
                              )}
                            >
                              {reviewDecisionLabel(detection.user_decision)}
                            </Badge>
                          </div>
                        ),
                        cell3: (
                          <div className="px-3 py-3">
                            <Select<ReviewDecision>
                suffixIcon={<span aria-hidden="true">⌄</span>}
                menuItemSelectedIcon={<span aria-hidden="true">✓</span>}
                              aria-label={`Quyết định vật thể ${detection.detection_index}`}
                              value={draft.decision}
                              onChange={(decision) =>
                                updateDraft(detection.id, { decision })
                              }
                              className="h-9 w-full"
                              options={[
                                { value: "existing", label: "Đúng, có sẵn" },
                                { value: "new", label: "Đúng, chưa có" },
                                { value: "skip", label: "Bỏ qua" },
                              ]}
                            />
                          </div>
                        ),
                        cell4: (
                          <div className="space-y-2 px-3 py-3">
                            {draft.decision === "existing" ? (
                              <Select
                suffixIcon={<span aria-hidden="true">⌄</span>}
                menuItemSelectedIcon={<span aria-hidden="true">✓</span>}
                                aria-label={`Mã hàng vật thể ${detection.detection_index}`}
                                value={draft.productId}
                                onChange={(productId) =>
                                  updateDraft(detection.id, { productId })
                                }
                                className="h-9 w-full"
                                showSearch={{ optionFilterProp: "label" }}
                                options={[
                                  { value: "", label: "Chọn mã hàng có sẵn" },
                                  ...(productsQuery.data ?? []).map(
                                    (product) => ({
                                      value: product.product_id,
                                      label: `${product.product_id} · ${product.name}`,
                                    }),
                                  ),
                                ]}
                              />
                            ) : null}
                            {draft.decision === "new" ? (
                              <div className="grid gap-2">
                                <Label htmlFor={`review-product-id-${detection.id}`}>
                                  Mã hàng
                                </Label>
                                <Input
                                  id={`review-product-id-${detection.id}`}
                                  className="h-9"
                                  value={draft.newProductId}
                                  placeholder="Mã hàng mới"
                                  onChange={(event) =>
                                    updateDraft(detection.id, {
                                      newProductId: event.target.value,
                                    })
                                  }
                                />
                                <Label htmlFor={`review-product-name-${detection.id}`}>
                                  Tên mã hàng
                                </Label>
                                <Input
                                  id={`review-product-name-${detection.id}`}
                                  className="h-9"
                                  value={draft.newProductName}
                                  placeholder="Tên mã hàng mới"
                                  onChange={(event) =>
                                    updateDraft(detection.id, {
                                      newProductName: event.target.value,
                                    })
                                  }
                                />
                                <Label htmlFor={`review-product-stock-${detection.id}`}>
                                  Tồn kho ban đầu
                                </Label>
                                <Input
                                  id={`review-product-stock-${detection.id}`}
                                  className="h-9"
                                  type="number"
                                  min={0}
                                  value={draft.newInventoryCount}
                                  placeholder="Tồn kho ban đầu"
                                  onChange={(event) =>
                                    updateDraft(detection.id, {
                                      newInventoryCount: Number.parseInt(
                                        event.target.value || "0",
                                        10,
                                      ),
                                    })
                                  }
                                />
                              </div>
                            ) : null}
                            {draft.decision === "skip" ? (
                              <p className="rounded-md bg-inset px-3 py-2 text-xs text-secondary">
                                Không lưu ảnh cắt này cho mã hàng.
                              </p>
                            ) : null}
                          </div>
                        ),
                        cell5: (
                          <div className="px-3 py-3">
                            <div className="flex justify-end">
                              <Button
                                aria-label={`Lưu rà soát vật thể ${detection.detection_index}`}
                                size="sm"
                                variant="outline"
                                disabled={saving}
                                onClick={() => saveReview(detection)}
                              >
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
                        ),
                      };
                    })}
                    columns={[
                      {
                        title: "Ảnh",
                        dataIndex: "cell0",
                        key: "cell0",
                        width: 90,
                      },
                      {
                        title: "Vật thể",
                        dataIndex: "cell1",
                        key: "cell1",
                        width: 260,
                      },
                      {
                        title: "Trạng thái",
                        dataIndex: "cell2",
                        key: "cell2",
                        width: 150,
                      },
                      {
                        title: "Quyết định",
                        dataIndex: "cell3",
                        key: "cell3",
                        width: 220,
                      },
                      {
                        title: "Mã hàng",
                        dataIndex: "cell4",
                        key: "cell4",
                        width: 360,
                      },
                      {
                        title: "Lưu",
                        dataIndex: "cell5",
                        key: "cell5",
                        width: 80,
                      },
                    ]}
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <ReviewSessionList apiBaseUrl={apiBaseUrl} sessions={sessionsQuery.data ?? []} loading={sessionsQuery.isLoading}
      error={errorMessage} notice={notice} state={listState} onChange={setListState}
      onOpen={setSelectedSessionId} onAddMissingBox={setMissingBoxSessionId} />
  );
};
