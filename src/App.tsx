import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as React from "react";
import { Dashboard } from "@/components/Dashboard";

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
    <QueryClientProvider client={queryClient}>
      <Dashboard />
    </QueryClientProvider>
  </React.StrictMode>
);
