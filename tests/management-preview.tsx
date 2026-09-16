import "antd/dist/reset.css";
import "@/index.css";
import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CategoryManagementPage } from "/src/components/CategoryManagementPage";
import { ProductManagementPage } from "/src/components/ProductManagementPage";
import { AppearanceProvider, useAppearance } from "/src/providers/appearance-provider";

// The harness renders production components against an isolated read-only fixture API.
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const apiBaseUrl = "http://127.0.0.1:8187/api/v1";

function ManagementPreview(): JSX.Element {
  const [page, setPage] = useState<"products" | "categories">("products");
  const { mode, toggleMode } = useAppearance();
  return (
    <main className="flex h-dvh min-w-0 flex-col bg-canvas text-content">
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-line bg-surface p-3">
        <strong>Dữ liệu kiểm thử</strong>
        <span className="text-sm text-muted">Chỉ xem; thao tác ghi bị chặn.</span>
        <button type="button" onClick={() => setPage("products")} aria-pressed={page === "products"}>Mã hàng</button>
        <button type="button" onClick={() => setPage("categories")} aria-pressed={page === "categories"}>Phân loại</button>
        <button type="button" onClick={toggleMode}>{mode === "light" ? "Chuyển sang tối" : "Chuyển sang sáng"}</button>
      </div>
      <div className="min-h-0 min-w-0 flex-1 p-3">
        {page === "products"
          ? <ProductManagementPage apiBaseUrl={apiBaseUrl} />
          : <CategoryManagementPage apiBaseUrl={apiBaseUrl} />}
      </div>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <AppearanceProvider>
    <QueryClientProvider client={queryClient}><ManagementPreview /></QueryClientProvider>
  </AppearanceProvider>,
);
