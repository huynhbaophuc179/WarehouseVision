import { useEffect, useRef, type RefObject } from "react";
import { scannerKey, scannerQuantityKey } from "@/lib/scanner-keymap";
import type { ScannerCaptureHandle } from "@/components/LiveScanner";
import type { Product } from "@/types/api";
import type { ScannerWorkflow } from "./use-scanner-workflow";

export function useScannerKeyboard(workflow: ScannerWorkflow, capture: RefObject<ScannerCaptureHandle>,
  products: Product[], disabled: boolean) {
  const latest = useRef({ workflow, products, disabled });
  latest.current = { workflow, products, disabled };
  useEffect(() => {
    const held = new Set<string>();
    const release = (event: KeyboardEvent) => held.delete(event.code || event.key);
    const clear = () => held.clear();
    const keydown = (event: KeyboardEvent) => {
      const { workflow: flow, products: catalog, disabled: inactive } = latest.current;
      if (inactive) return;
      const key = scannerKey(event);
      if (!key) return;
      const state = flow.current.current;
      const target = event.target instanceof HTMLElement ? event.target : null;
      if ((target?.closest("nav") || target?.closest("header")) && !target?.closest(".scanner-theme")) return;
      if (target?.id === "scanner-product-search") {
        if (key !== "Enter") return;
        event.preventDefault(); event.stopImmediatePropagation();
        const choice = document.querySelector<HTMLButtonElement>(".scanner-product-choice");
        if (choice) choice.focus();
        else target.blur();
        return;
      }
      const quantityAction = state.overlay === "quantity"
        ? scannerQuantityKey(key, event.code, event.getModifierState("NumLock")) : null;
      if (quantityAction === "input") return;
      event.preventDefault(); event.stopImmediatePropagation();
      const physical = event.code || event.key;
      if (event.repeat || held.has(physical)) return;
      held.add(physical);
      if (quantityAction) {
        if (quantityAction === "save") flow.saveQuantity();
        if (quantityAction === "cancel") flow.back();
        return;
      }
      if (["submitting", "uncertain"].includes(state.overlay ?? "")) return;
      if (state.overlay === "success") { if (key === "Enter" || key === "0") flow.reset(); return; }
      if (key === "0") {
        if (state.phase === "camera" && !state.overlay) capture.current?.retryCamera();
        flow.back(); return;
      }
      if (state.overlay === "edit") {
        if (key === "1") flow.editQuantity();
        if (key === "2") flow.classify();
      } else if (state.overlay === "classify") {
        if (key === "7") flow.patch({ productPage: Math.max(0, state.productPage - 1) });
        else if (key === "9") flow.patch({ productPage: Math.min(Math.max(0, Math.ceil(catalog.length / 6) - 1), state.productPage + 1) });
        else if (key === "8") document.getElementById("scanner-product-search")?.focus();
        else if (/^[1-6]$/.test(key)) {
          const product = catalog[state.productPage * 6 + Number(key) - 1];
          if (product) flow.assign(product);
        }
      } else if (state.overlay === "action") {
        if (key === "1") flow.chooseAction("stock_in");
        if (key === "2") flow.chooseAction("stock_out");
      } else if (state.overlay === "receipt") {
        if (key === "Enter") void flow.submit();
      } else if (state.phase === "review") {
        if (key === "8" || key === "2") flow.moveGroup(key === "8" ? -1 : 1);
        if (key === "4" || key === "6") flow.moveObject(key === "4" ? -1 : 1);
        if (key === "5") flow.edit();
        if (key === "9" || key === "Enter") flow.review(key === "9");
      } else if (state.phase === "camera") {
        if (key === "1") capture.current?.openUpload();
        if (key === "2") capture.current?.retryCamera();
        if (key === "Enter") capture.current?.capture();
      } else if (state.phase === "preview" && key === "Enter") void flow.recognize();
    };
    window.addEventListener("keydown", keydown, true);
    window.addEventListener("keyup", release, true);
    window.addEventListener("blur", clear);
    return () => { window.removeEventListener("keydown", keydown, true);
      window.removeEventListener("keyup", release, true); window.removeEventListener("blur", clear); };
  }, [capture]);
}
