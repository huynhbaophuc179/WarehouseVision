import type { InventoryConfirmRequest, InventoryConfirmResponse } from "../types/api";
import type { ScannerGroup } from "./scanner-session";

export interface ScannerReceipt {
  items: Array<{ id: string; name: string; code: string; quantity: number }>;
  payload: InventoryConfirmRequest;
  action: "stock_in" | "stock_out";
}

export function createScannerReceipt(groups: ScannerGroup[], action: ScannerReceipt["action"]): ScannerReceipt {
  if (action !== "stock_in" && action !== "stock_out") throw new Error("Thao tác kho không hợp lệ.");
  if (!groups.length) throw new Error("Phiếu phải có ít nhất một sản phẩm.");
  const productIds = new Set<string>();
  const detectionIds = new Set<string>();
  const items: ScannerReceipt["items"] = [];
  const confirmed: InventoryConfirmRequest["confirmed_items"] = [];
  for (const group of groups) {
    if (!group.reviewed || typeof group.productId !== "string" || !group.productId.trim()
      || !Number.isSafeInteger(group.quantity) || group.quantity <= 0) {
      throw new Error("Cần phân loại và duyệt tất cả sản phẩm với số lượng hợp lệ.");
    }
    if (productIds.has(group.productId)) throw new Error("Mỗi mã sản phẩm chỉ được xuất hiện một lần trên phiếu.");
    if (!group.detectionIds.length || group.detectionIds.some((id) => {
      if (typeof id !== "string" || !id.trim() || detectionIds.has(id)) return true;
      detectionIds.add(id);
      return false;
    })) throw new Error("Vùng nhận diện trên phiếu thiếu hoặc trùng lặp.");
    productIds.add(group.productId);
    items.push({ id: group.productId, name: group.name, code: group.productId, quantity: group.quantity });
    confirmed.push({ detection_id: group.detectionIds[0], product_id: group.productId, quantity: group.quantity, action });
  }
  // Both visible lines and the request are copied from this one reviewed snapshot.
  return { items, payload: { confirmed_items: confirmed, rejected_items: [] }, action };
}

export function verifyScannerConfirmation(response: InventoryConfirmResponse, receipt: ScannerReceipt): void {
  const fail = () => { throw new Error("Phản hồi ghi kho không đầy đủ hoặc không khớp phiếu. Chưa xác định kết quả."); };
  if (!response || !Array.isArray(response.confirmed_items) || !Array.isArray(response.rejected_items)
    || response.rejected_items.length !== 0 || response.confirmed_items.length !== receipt.items.length) fail();
  const seenProducts = new Set<string>();
  const seenTransactions = new Set<number>();
  for (const item of response.confirmed_items) {
    if (!item) fail();
    const expected = receipt.payload.confirmed_items.find((entry) => entry.product_id === item.product_id);
    if (!expected || seenProducts.has(item.product_id) || seenTransactions.has(item.transaction_id)
      || item.detection_id !== expected?.detection_id || item.quantity !== expected?.quantity
      || item.action !== receipt.action || item.quantity_delta !== (receipt.action === "stock_in" ? item.quantity : -item.quantity)
      || !Number.isSafeInteger(item.transaction_id) || item.transaction_id <= 0
      || !Number.isSafeInteger(item.inventory_count) || item.inventory_count < 0) fail();
    seenProducts.add(item.product_id);
    seenTransactions.add(item.transaction_id);
  }
}
