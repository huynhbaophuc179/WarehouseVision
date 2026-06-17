import type {
  DetectionResult,
  DetectionReviewResponse,
  DetectionReviewUpdateRequest,
  InventoryConfirmRequest,
  InventoryConfirmResponse,
  ManualDetectionRequest,
  Product,
  ProductDeleteResponse,
  ProductDetail,
  RecognitionSessionDeleteResponse,
  RecognitionSessionDetail,
  RecognitionSessionSummary,
  ReviewDetectionDeleteResponse,
} from "@/types/api";

export const defaultApiBaseUrl =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api/v1";

const parseError = async (response: Response): Promise<string> => {
  const text = await response.text();
  if (!text) {
    return `HTTP ${response.status}`;
  }
  try {
    const data = JSON.parse(text) as { detail?: string };
    return data.detail ?? text;
  } catch {
    return text;
  }
};

export const recognizeImage = async (apiBaseUrl: string, file: File): Promise<DetectionResult[]> => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${apiBaseUrl}/recognize`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as DetectionResult[];
};

export const fetchProducts = async (
  apiBaseUrl: string,
  search = "",
  limit = 100,
): Promise<Product[]> => {
  const params = new URLSearchParams();
  if (search.trim()) {
    params.set("search", search.trim());
  }
  params.set("limit", String(limit));
  const response = await fetch(`${apiBaseUrl}/products?${params.toString()}`);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as Product[];
};

export const fetchProductDetail = async (
  apiBaseUrl: string,
  productId: string,
): Promise<ProductDetail> => {
  const response = await fetch(`${apiBaseUrl}/products/${encodeURIComponent(productId)}`);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as ProductDetail;
};

export const deleteProduct = async (
  apiBaseUrl: string,
  productId: string,
): Promise<ProductDeleteResponse> => {
  const response = await fetch(`${apiBaseUrl}/products/${encodeURIComponent(productId)}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as ProductDeleteResponse;
};

export const confirmInventory = async (
  apiBaseUrl: string,
  payload: InventoryConfirmRequest,
): Promise<InventoryConfirmResponse> => {
  const response = await fetch(`${apiBaseUrl}/inventory/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as InventoryConfirmResponse;
};

export const fetchReviewSessions = async (
  apiBaseUrl: string,
  limit = 200,
): Promise<RecognitionSessionSummary[]> => {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  const response = await fetch(`${apiBaseUrl}/review/sessions?${params.toString()}`);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as RecognitionSessionSummary[];
};

export const fetchReviewSession = async (
  apiBaseUrl: string,
  sessionId: number,
): Promise<RecognitionSessionDetail> => {
  const response = await fetch(`${apiBaseUrl}/review/sessions/${sessionId}`);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as RecognitionSessionDetail;
};

export const updateDetectionReview = async (
  apiBaseUrl: string,
  reviewId: number,
  payload: DetectionReviewUpdateRequest,
): Promise<DetectionReviewResponse> => {
  const response = await fetch(`${apiBaseUrl}/review/detections/${reviewId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as DetectionReviewResponse;
};

export const deleteReviewSession = async (
  apiBaseUrl: string,
  sessionId: number,
): Promise<RecognitionSessionDeleteResponse> => {
  const response = await fetch(`${apiBaseUrl}/review/sessions/${sessionId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as RecognitionSessionDeleteResponse;
};

export const addManualDetection = async (
  apiBaseUrl: string,
  sessionId: number,
  payload: ManualDetectionRequest,
): Promise<RecognitionSessionDetail["detections"][number]> => {
  const response = await fetch(`${apiBaseUrl}/review/sessions/${sessionId}/manual-detection`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as RecognitionSessionDetail["detections"][number];
};

export const deleteReviewDetection = async (
  apiBaseUrl: string,
  reviewId: number,
): Promise<ReviewDetectionDeleteResponse> => {
  const response = await fetch(`${apiBaseUrl}/review/detections/${reviewId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as ReviewDetectionDeleteResponse;
};
