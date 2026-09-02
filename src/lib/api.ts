import type {
  DetectionResult,
  DetectionReviewResponse,
  DetectionReviewUpdateRequest,
  InventoryConfirmRequest,
  InventoryConfirmResponse,
  ManualDetectionRequest,
  Product,
  ProductBatchImportResponse,
  ProductCategory,
  ProductCategoryDeleteResponse,
  ProductCategoryListResponse,
  ProductDeleteResponse,
  ProductDetail,
  ProductEmbedding,
  ProductEmbeddingDeleteResponse,
  ProductReferenceCapture,
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

export interface RecognizeImageInput {
  file: File;
  topK: number;
  autoAcceptScoreThreshold: number;
}

export const recognizeImage = async (
  apiBaseUrl: string,
  input: RecognizeImageInput,
): Promise<DetectionResult[]> => {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("top_k", String(input.topK));
  formData.append("auto_accept_score_threshold", String(input.autoAcceptScoreThreshold));
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

export const fetchProductCategories = async (
  apiBaseUrl: string,
): Promise<ProductCategoryListResponse> => {
  const response = await fetch(`${apiBaseUrl}/product-categories`);
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as ProductCategoryListResponse;
};

export const createProductCategory = async (
  apiBaseUrl: string,
  name: string,
): Promise<ProductCategory> => {
  const response = await fetch(`${apiBaseUrl}/product-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as ProductCategory;
};

export const updateProductCategory = async (
  apiBaseUrl: string,
  categoryId: number,
  name: string,
): Promise<ProductCategory> => {
  const response = await fetch(`${apiBaseUrl}/product-categories/${categoryId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as ProductCategory;
};

export const deleteProductCategory = async (
  apiBaseUrl: string,
  categoryId: number,
): Promise<ProductCategoryDeleteResponse> => {
  const response = await fetch(`${apiBaseUrl}/product-categories/${categoryId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as ProductCategoryDeleteResponse;
};

export interface CreateProductWithImageInput {
  productId: string;
  name: string;
  category?: string;
  inventoryCount: number;
  file?: File;
}

export const createProductWithImage = async (
  apiBaseUrl: string,
  input: CreateProductWithImageInput,
): Promise<Product> => {
  const formData = new FormData();
  formData.append("product_id", input.productId);
  formData.append("name", input.name);
  if (input.category?.trim()) {
    formData.append("category", input.category.trim());
  }
  formData.append("inventory_count", String(input.inventoryCount));
  if (input.file) {
    formData.append("file", input.file);
  }
  const response = await fetch(`${apiBaseUrl}/products`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as Product;
};

export interface AddProductEmbeddingInput {
  productId: string;
  file: File;
  useFullImage?: boolean;
}

export const addProductEmbedding = async (
  apiBaseUrl: string,
  input: AddProductEmbeddingInput,
): Promise<ProductEmbedding> => {
  const formData = new FormData();
  formData.append("file", input.file);
  formData.append("use_full_image", String(input.useFullImage ?? true));
  const response = await fetch(`${apiBaseUrl}/products/${encodeURIComponent(input.productId)}/embeddings`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as ProductEmbedding;
};

export interface CaptureProductReferenceInput {
  productId: string;
  file: File;
}

export const captureProductReference = async (
  apiBaseUrl: string,
  input: CaptureProductReferenceInput,
): Promise<ProductReferenceCapture> => {
  const formData = new FormData();
  formData.append("file", input.file);
  const response = await fetch(
    `${apiBaseUrl}/products/${encodeURIComponent(input.productId)}/capture-reference`,
    {
      method: "POST",
      body: formData,
    },
  );
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as ProductReferenceCapture;
};

export interface BatchImportProductsInput {
  csvFile: File;
  imagesZipFile?: File | null;
  dryRun: boolean;
}

export const batchImportProducts = async (
  apiBaseUrl: string,
  input: BatchImportProductsInput,
): Promise<ProductBatchImportResponse> => {
  const formData = new FormData();
  formData.append("danh_sach_san_pham", input.csvFile);
  if (input.imagesZipFile) {
    formData.append("file_anh", input.imagesZipFile);
  }
  formData.append("dry_run", String(input.dryRun));
  const response = await fetch(`${apiBaseUrl}/products/batch-import`, {
    method: "POST",
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as ProductBatchImportResponse;
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

export interface UpdateProductMetadataInput {
  productId: string;
  name: string;
  category?: string | null;
}

export const updateProductMetadata = async (
  apiBaseUrl: string,
  input: UpdateProductMetadataInput,
): Promise<Product> => {
  const response = await fetch(`${apiBaseUrl}/products/${encodeURIComponent(input.productId)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: input.name,
      category: input.category,
    }),
  });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as Product;
};

export const deleteProductEmbedding = async (
  apiBaseUrl: string,
  productId: string,
  embeddingId: number,
): Promise<ProductEmbeddingDeleteResponse> => {
  const response = await fetch(
    `${apiBaseUrl}/products/${encodeURIComponent(productId)}/embeddings/${embeddingId}`,
    { method: "DELETE" },
  );
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  return (await response.json()) as ProductEmbeddingDeleteResponse;
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
  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl}/review/sessions/${sessionId}/manual-detection`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("Không kết nối được API để lưu vùng. Hãy kiểm tra backend đang chạy và cấu hình API URL.");
  }
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
