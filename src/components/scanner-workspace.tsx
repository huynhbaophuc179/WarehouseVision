import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { LiveScanner, type ScannerCaptureHandle } from "./LiveScanner";
import { ScannerReviewLayout } from "./scanner-review-layout";
import { ScannerWorkflowOverlays } from "./scanner-workflow-overlays";
import { FloatingNumpad } from "./FloatingNumpad";
import { useScannerWorkflow } from "@/hooks/use-scanner-workflow";
import { useScannerKeyboard } from "@/hooks/use-scanner-keyboard";
import { fetchProducts } from "@/lib/api";
import type { Product, ScannerSettings } from "@/types/api";
import "@/styles/scanner-tokens.css";

export function ScannerWorkspace({ settings, keyboardDisabled, onNavigationLock }: {
  settings: ScannerSettings; keyboardDisabled: boolean; onNavigationLock: (locked: boolean) => void;
}) {
  const catalogRef = useRef<Product[]>([]);
  const flow = useScannerWorkflow(settings, () => catalogRef.current, onNavigationLock);
  const { state } = flow;
  const catalog = useQuery({ queryKey: ["scanner-products", settings.apiBaseUrl, state.productSearch],
    queryFn: () => fetchProducts(settings.apiBaseUrl, state.productSearch, 500), staleTime: 30_000 });
  catalogRef.current = catalog.data ?? [];
  const capture = useRef<ScannerCaptureHandle>(null);
  const [image, setImage] = useState<{ file: File; url: string } | null>(null);
  useEffect(() => {
    if (!state.file) { setImage(null); return; }
    const url = URL.createObjectURL(state.file);
    setImage({ file: state.file, url });
    return () => URL.revokeObjectURL(url);
  }, [state.file]);
  const products = !catalog.isFetching && !catalog.isError ? catalog.data ?? [] : [];
  useScannerKeyboard(flow, capture, products, keyboardDisabled);
  const imageUrl = image?.file === state.file ? image?.url ?? null : null;
  const group = state.groups.find(item => item.id === state.activeId);
  const boxes = state.groups.flatMap(item => item.detectionIds.flatMap(id => {
    const detection = state.detections.find(entry => entry.detection_id === id);
    return detection?.box.length === 4 ? [{ id, groupId: item.id, box: detection.box as [number, number, number, number] }] : [];
  }));
  return <div className="scanner-theme" style={{ height: "100%", minHeight: 0, position: "relative" }}>
    {state.phase === "review" ? <ScannerReviewLayout
      items={state.groups.map(item => ({ ...item, unknown: !item.productId }))}
      activeItemId={state.activeId} activeObjectId={group?.detectionIds[state.objectIndex]}
      imageUrl={imageUrl ?? undefined} boxes={boxes} onSelectItem={flow.selectGroup}
      onPreviousGroup={() => flow.moveGroup(-1)} onNextGroup={() => flow.moveGroup(1)}
      onPreviousObject={() => flow.moveObject(-1)} onNextObject={() => flow.moveObject(1)}
      onEdit={flow.edit} onReview={() => flow.review()} onReviewAll={() => flow.review(true)} onRetake={flow.reset}
      headerAction={state.message && !state.overlay ? <span role="alert">{state.message}</span> : undefined}
    /> : <LiveScanner ref={capture} imageUrl={imageUrl} isProcessing={state.phase === "processing"}
      onFileSelected={flow.selectFile} onRecognize={file => void flow.recognize(file)}
      onAnalyze={() => void flow.recognize()} onReset={flow.reset} errorMessage={state.message} />}
    <ScannerWorkflowOverlays overlay={state.overlay} groupName={group?.name ?? "Sản phẩm"}
      quantityDraft={state.quantityDraft} onQuantityChange={value => flow.patch({ quantityDraft: value })}
      onSaveQuantity={flow.saveQuantity} onEditQuantity={flow.editQuantity} onClassify={flow.classify}
      products={products} productsLoading={catalog.isFetching} productsError={catalog.isError ? "Không tải được danh sách mã hàng. Kiểm tra kết nối rồi mở lại phân loại." : undefined}
      productPage={state.productPage} onProductPage={page => flow.patch({ productPage: page })}
      productSearch={state.productSearch} onProductSearch={value => flow.patch({ productSearch: value, productPage: 0 })}
      onSelectProduct={flow.assign} onSelectAction={flow.chooseAction} receipt={state.receipt}
      onConfirm={() => void flow.submit()} onBack={flow.back} onNewScan={flow.reset} message={state.message} />
    {!keyboardDisabled && <FloatingNumpad />}
  </div>;
}
