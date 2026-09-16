import type { DetectionResult, Product } from "../types/api";

// The Node test runner needs explicit extensions for nested TypeScript imports.
// @ts-expect-error TypeScript compilation resolves the same source module.
export { createScannerReceipt, verifyScannerConfirmation } from "./scanner-receipt.ts";
export type { ScannerReceipt } from "./scanner-receipt.ts";

export interface ScannerGroup {
  id: string;
  productId: string | null;
  name: string;
  code?: string;
  category?: string;
  imageUrl?: string;
  quantity: number;
  reviewed: boolean;
  detectionIds: string[];
}

const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const validQuantity = (quantity: number) => Number.isSafeInteger(quantity) && quantity > 0;
const optionalText = (value: unknown) => value == null || typeof value === "string";
const validProduct = (product: Product) => product && nonempty(product.product_id)
  && typeof product.name === "string" && optionalText(product.category) && optionalText(product.thumbnail_base64);
const imageUrl = (encoded?: string | null) => nonempty(encoded)
  ? encoded.startsWith("data:image/") ? encoded : `data:image/jpeg;base64,${encoded}`
  : undefined;

const productMetadata = (product: Product) => ({
  productId: product.product_id,
  name: nonempty(product.name) ? product.name : product.product_id,
  code: product.product_id,
  category: product.category || undefined,
  imageUrl: imageUrl(product.thumbnail_base64),
});

export function createScannerGroups(detections: DetectionResult[], products: Product[]): ScannerGroup[] {
  if (!Array.isArray(detections) || !Array.isArray(products)) throw new Error("Dữ liệu nhận diện không hợp lệ.");
  if (products.some((product) => !validProduct(product))) throw new Error("Dữ liệu sản phẩm không hợp lệ.");
  const catalog = new Map(products.filter((product) => product && nonempty(product.product_id))
    .map((product) => [product.product_id, product]));
  const groups: ScannerGroup[] = [];
  const seen = new Set<string>();
  for (const detection of detections) {
    if (!detection || !nonempty(detection.detection_id) || seen.has(detection.detection_id)) {
      throw new Error("Mã vùng nhận diện thiếu hoặc trùng lặp.");
    }
    if (!Array.isArray(detection.box) || detection.box.length !== 4 || !detection.box.every(Number.isFinite)
      || detection.box[2] <= detection.box[0] || detection.box[3] <= detection.box[1]) {
      throw new Error("Khung vùng nhận diện không hợp lệ.");
    }
    if (!Array.isArray(detection.candidates) || detection.candidates.some((candidate) => !validProduct(candidate))
      || !["recognized", "uncertain", "unknown"].includes(detection.status)
      || !optionalText(detection.name) || !optionalText(detection.product_id)
      || !optionalText(detection.crop_preview_base64) || !optionalText(detection.reference_image_base64)
      || (detection.status === "recognized" && !nonempty(detection.product_id))) {
      throw new Error("Thông tin sản phẩm trong kết quả nhận diện không hợp lệ.");
    }
    seen.add(detection.detection_id);
    const productId = detection.status === "recognized" && nonempty(detection.product_id) ? detection.product_id : null;
    const existing = productId ? groups.find((group) => group.productId === productId) : undefined;
    if (existing) {
      existing.detectionIds.push(detection.detection_id);
      existing.quantity += 1;
      continue;
    }
    const candidate = Array.isArray(detection.candidates)
      ? detection.candidates.find((item) => item?.product_id === productId) : undefined;
    const product = productId ? catalog.get(productId) ?? candidate : undefined;
    groups.push({
      id: `detection:${detection.detection_id}`,
      productId,
      name: productId ? product?.name || detection.name || productId : "Chưa xác định",
      code: productId ?? undefined,
      category: product?.category || undefined,
      imageUrl: productId
        ? imageUrl(product?.thumbnail_base64) ?? imageUrl(detection.reference_image_base64) ?? imageUrl(detection.crop_preview_base64)
        : imageUrl(detection.crop_preview_base64),
      quantity: 1,
      reviewed: false,
      detectionIds: [detection.detection_id],
    });
  }
  return groups;
}

const requireGroup = (groups: ScannerGroup[], id: string) => {
  const group = groups.find((item) => item.id === id);
  if (!group) throw new Error("Không tìm thấy nhóm sản phẩm.");
  return group;
};

export function assignScannerProduct(groups: ScannerGroup[], groupId: string, product: Product): ScannerGroup[] {
  const source = requireGroup(groups, groupId);
  if (!product || !nonempty(product.product_id)) throw new Error("Mã sản phẩm không hợp lệ.");
  const destination = groups.find((group) => group.id !== groupId && group.productId === product.product_id);
  const quantity = source.quantity + (destination?.quantity ?? 0);
  if (!validQuantity(quantity)) throw new Error("Số lượng sau khi gộp không hợp lệ.");
  if (destination) {
    return groups.filter((group) => group.id !== groupId).map((group) => group.id === destination.id
      ? { ...group, ...productMetadata(product), imageUrl: imageUrl(product.thumbnail_base64) ?? group.imageUrl,
        quantity, reviewed: false, detectionIds: [...group.detectionIds, ...source.detectionIds] }
      : group);
  }
  return groups.map((group) => group.id === groupId
    ? { ...group, ...productMetadata(product),
      imageUrl: imageUrl(product.thumbnail_base64) ?? (group.productId === product.product_id ? group.imageUrl : undefined),
      reviewed: false, detectionIds: [...group.detectionIds] }
    : group);
}

export function setScannerQuantity(groups: ScannerGroup[], id: string, value: string): ScannerGroup[] {
  requireGroup(groups, id);
  if (typeof value !== "string" || !/^\d+$/.test(value) || !validQuantity(Number(value))) {
    throw new Error("Số lượng phải là số nguyên an toàn từ 1 trở lên.");
  }
  return groups.map((group) => group.id === id ? { ...group, quantity: Number(value), reviewed: false } : group);
}

export function assignScannerDetection(
  groups: ScannerGroup[], groupId: string, detectionId: string, product: Product,
): ScannerGroup[] {
  const source = requireGroup(groups, groupId);
  if (!source.detectionIds.includes(detectionId)) throw new Error("Không tìm thấy vật thể trong nhóm đã chọn.");
  if (!validProduct(product)) throw new Error("Thông tin sản phẩm không hợp lệ.");
  if (source.productId === product.product_id) return groups;
  if (source.detectionIds.length === 1) return assignScannerProduct(groups, groupId, product);
  if (!validQuantity(source.quantity) || source.quantity <= 1) {
    throw new Error("Cần sửa số lượng nhóm lớn hơn 1 trước khi phân loại riêng vật thể.");
  }
  const destination = groups.find((group) => group.productId === product.product_id);
  const quantity = (destination?.quantity ?? 0) + 1;
  if (!validQuantity(quantity)) throw new Error("Số lượng sau khi gộp không hợp lệ.");
  const result = groups.map((group) => {
    if (group.id === source.id) return { ...group, quantity: group.quantity - 1, reviewed: false,
      detectionIds: group.detectionIds.filter((id) => id !== detectionId) };
    if (group.id === destination?.id) return { ...group, ...productMetadata(product),
      imageUrl: imageUrl(product.thumbnail_base64) ?? group.imageUrl, quantity, reviewed: false,
      detectionIds: [...group.detectionIds, detectionId] };
    return group;
  });
  if (!destination) {
    // The source can retain the moved object's original ID; keep group IDs unique.
    let id = `detection:${detectionId}`;
    while (groups.some((group) => group.id === id)) id += ":split";
    result.push({ id, ...productMetadata(product), quantity: 1, reviewed: false, detectionIds: [detectionId] });
  }
  return result;
}

export function reviewScannerGroup(groups: ScannerGroup[], id: string): ScannerGroup[] {
  const group = requireGroup(groups, id);
  if (!nonempty(group.productId) || !validQuantity(group.quantity)) {
    throw new Error("Cần phân loại sản phẩm và nhập số lượng hợp lệ trước khi duyệt.");
  }
  return groups.map((item) => item.id === id ? { ...item, reviewed: true } : item);
}

export function reviewAllScannerGroups(groups: ScannerGroup[]): ScannerGroup[] {
  return groups.map((group) => ({ ...group, reviewed: nonempty(group.productId) && validQuantity(group.quantity) }));
}
