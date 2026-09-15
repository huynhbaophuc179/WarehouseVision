import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { confirmInventory, InventoryRequestError, recognizeImage } from "@/lib/api";
import { assignScannerDetection, createScannerGroups, createScannerReceipt, reviewAllScannerGroups,
  reviewScannerGroup, setScannerQuantity, verifyScannerConfirmation,
  type ScannerGroup, type ScannerReceipt } from "@/lib/scanner-session";
import type { DetectionResult, Product, ScannerSettings } from "@/types/api";

export type ScannerOverlay = "edit" | "quantity" | "classify" | "action" | "receipt" | "submitting" | "success" | "uncertain" | null;
interface ScannerState {
  file: File | null; phase: "camera" | "preview" | "processing" | "review";
  detections: DetectionResult[]; groups: ScannerGroup[]; activeId: string; objectIndex: number;
  overlay: ScannerOverlay; quantityDraft: string; productPage: number; productSearch: string;
  receipt: ScannerReceipt | null; message: string | null;
}
const initialState = (): ScannerState => ({ file: null, phase: "camera", detections: [], groups: [],
  activeId: "", objectIndex: 0, overlay: null, quantityDraft: "", productPage: 0,
  productSearch: "", receipt: null, message: null });

export function useScannerWorkflow(settings: ScannerSettings, getProducts: () => Product[], onNavigationLock: (locked: boolean) => void) {
  const [state, setState] = useState(initialState);
  const current = useRef(state);
  const generation = useRef(0);
  const request = useRef<AbortController | null>(null);
  const recognitionInFlightRef = useRef(false);
  const confirmationInFlightRef = useRef(false);
  const queryClient = useQueryClient();
  const patch = (update: Partial<ScannerState>) => {
    current.current = { ...current.current, ...update };
    setState(current.current);
  };
  useEffect(() => () => { generation.current++; request.current?.abort(); }, []);
  const guarded = (operation: () => void) => {
    try { operation(); } catch (error) { patch({ message: error instanceof Error ? error.message : "Không thực hiện được thao tác." }); }
  };
  const reset = () => {
    if (confirmationInFlightRef.current && current.current.overlay !== "success") return;
    generation.current++; request.current?.abort(); request.current = null;
    recognitionInFlightRef.current = false; confirmationInFlightRef.current = false;
    current.current = initialState(); setState(current.current);
  };
  const selectFile = (file: File) => {
    if (confirmationInFlightRef.current) return;
    reset(); patch({ file, phase: "preview" });
  };
  const recognize = async (file = current.current.file) => {
    if (!file || recognitionInFlightRef.current || confirmationInFlightRef.current) return;
    recognitionInFlightRef.current = true;
    const version = ++generation.current;
    const controller = new AbortController(); request.current = controller;
    patch({ file, phase: "processing", message: null, groups: [], detections: [] });
    const timeout = window.setTimeout(() => controller.abort(), 90_000);
    try {
      const result = await recognizeImage(settings.apiBaseUrl, { file, topK: settings.topK,
        autoAcceptScoreThreshold: settings.confidenceThreshold, signal: controller.signal });
      if (version !== generation.current) return;
      if (!Array.isArray(result)) throw new Error("Phản hồi nhận diện không hợp lệ.");
      const groups = createScannerGroups(result, getProducts());
      patch({ detections: result, groups, activeId: groups[0]?.id ?? "", objectIndex: 0,
        phase: groups.length ? "review" : "preview", message: groups.length ? null : "Không tìm thấy sản phẩm. Hãy sắp xếp lại hoặc chọn ảnh khác." });
    } catch {
      if (version === generation.current) patch({ phase: "preview", message: "Không nhận diện được ảnh. Kiểm tra kết nối hoặc thử ảnh khác." });
    } finally {
      window.clearTimeout(timeout);
      if (version === generation.current) { recognitionInFlightRef.current = false; request.current = null; }
    }
  };
  const selectGroup = (id: string) => patch({ activeId: id, objectIndex: 0, message: null });
  const active = () => current.current.groups.find(group => group.id === current.current.activeId);
  const moveGroup = (step: number) => {
    const { groups, activeId } = current.current;
    const index = Math.max(0, Math.min(groups.length - 1, groups.findIndex(group => group.id === activeId) + step));
    if (groups[index]) selectGroup(groups[index].id);
  };
  const moveObject = (step: number) => patch({ objectIndex: Math.max(0,
    Math.min((active()?.detectionIds.length ?? 1) - 1, current.current.objectIndex + step)) });
  const edit = () => { if (active()) patch({ overlay: "edit", message: null }); };
  const editQuantity = () => patch({ overlay: "quantity", quantityDraft: String(active()?.quantity ?? 1), message: null });
  const classify = () => patch({ overlay: "classify", productPage: 0, productSearch: "", message: null });
  const saveQuantity = () => guarded(() => patch({ groups: setScannerQuantity(current.current.groups,
    current.current.activeId, current.current.quantityDraft), overlay: null, receipt: null, message: null }));
  const assign = (product: Product) => guarded(() => {
    const detectionId = active()?.detectionIds[current.current.objectIndex];
    if (!detectionId) throw new Error("Chưa chọn vật thể để phân loại.");
    const groups = assignScannerDetection(current.current.groups, current.current.activeId, detectionId, product);
    patch({ groups, activeId: groups.find(group => group.productId === product.product_id)?.id ?? groups[0]?.id ?? "",
      objectIndex: 0, overlay: null, receipt: null, message: null });
  });
  const review = (all = false) => guarded(() => {
    if (!active()?.productId && !all) { classify(); return; }
    const groups = all ? reviewAllScannerGroups(current.current.groups)
      : reviewScannerGroup(current.current.groups, current.current.activeId);
    const next = groups.find(group => !group.reviewed || !group.productId);
    patch({ groups, activeId: next?.id ?? current.current.activeId, objectIndex: 0,
      overlay: next ? (next.productId ? null : "classify") : "action",
      productPage: 0, message: null });
  });
  const chooseAction = (action: "stock_in" | "stock_out") => guarded(() => {
    patch({ receipt: createScannerReceipt(current.current.groups, action), overlay: "receipt", message: null });
  });
  const back = () => {
    const overlay = current.current.overlay;
    if (["submitting", "uncertain"].includes(overlay ?? "")) return;
    if (overlay === "receipt") patch({ overlay: "action", receipt: null, message: null });
    else if (overlay) patch({ overlay: null, message: null });
    else reset();
  };
  const submit = async () => {
    if (current.current.overlay !== "receipt" || confirmationInFlightRef.current) return;
    const receipt = current.current.receipt;
    if (!receipt) return;
    // Lock before preparing or sending anything; no retry after an uncertain write.
    confirmationInFlightRef.current = true;
    onNavigationLock(true);
    patch({ overlay: "submitting", message: null });
    const version = generation.current;
    const controller = new AbortController(); request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await confirmInventory(settings.apiBaseUrl, receipt.payload, controller.signal);
      if (version !== generation.current) return;
      verifyScannerConfirmation(response, receipt);
      patch({ overlay: "success", message: response.confirmed_items.map(item =>
        `Giao dịch ${item.transaction_id} · ${item.product_id} · Tồn kho ${item.inventory_count}`).join("\n") });
      onNavigationLock(false);
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["scanner-products"] });
    } catch (error) {
      if (version !== generation.current) return;
      if (error instanceof InventoryRequestError && [400, 404, 422].includes(error.status)) {
        confirmationInFlightRef.current = false;
        onNavigationLock(false);
        patch({ overlay: "receipt", message: "Chưa ghi kho: kiểm tra mã hàng, số lượng và tồn kho hiện tại trước khi xác nhận lại." });
      } else patch({ overlay: "uncertain", message: "Chưa xác định giao dịch đã được ghi hay chưa. Không gửi lại. Giữ phiếu này và nhờ người quản lý đối chiếu trước khi tiếp tục." });
    } finally { window.clearTimeout(timeout); if (version === generation.current) request.current = null; }
  };
  return { state, current, patch, reset, selectFile, recognize, selectGroup, moveGroup, moveObject,
    edit, editQuantity, classify, saveQuantity, assign, review, chooseAction, back, submit };
}
export type ScannerWorkflow = ReturnType<typeof useScannerWorkflow>;
