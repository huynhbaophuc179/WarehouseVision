import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { Dashboard } from "@/components/Dashboard";
import { AppearanceProvider } from "@/providers/appearance-provider";

const ScannerDesignPreview = import.meta.env.DEV
  ? React.lazy(() => import("@/dev/scanner-design-preview"))
  : null;
const showDesignPreview = import.meta.env.DEV && window.location.hash === "#/doi-chieu-giao-dien";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const App = (): JSX.Element => (
  <React.StrictMode>
    <AppearanceProvider>
      <QueryClientProvider client={queryClient}>
        {showDesignPreview && ScannerDesignPreview ? (
          <React.Suspense fallback={<p>Đang mở bản đối chiếu…</p>}>
            <ScannerDesignPreview />
          </React.Suspense>
        ) : <Dashboard />}
      </QueryClientProvider>
    </AppearanceProvider>
  </React.StrictMode>
);
