import * as React from "react";
import { SettingsSheet } from "./SettingsSheet";
import { ScannerWorkspace } from "./scanner-workspace";
import { defaultApiBaseUrl } from "@/lib/api";
import { DashboardLayout } from "@/layouts/DashboardLayout";
import type { ScannerSettings } from "@/types/api";
import type { DashboardView } from "@/types/navigation";

const CategoryManagementPage = React.lazy(() => import("./CategoryManagementPage").then(module => ({ default: module.CategoryManagementPage })));
const ProductManagementPage = React.lazy(() => import("./ProductManagementPage").then(module => ({ default: module.ProductManagementPage })));
const ReviewPage = React.lazy(() => import("./ReviewPage").then(module => ({ default: module.ReviewPage })));

const managementPages = {
  products: ProductManagementPage,
  categories: CategoryManagementPage,
  review: ReviewPage,
};

export const Dashboard = (): JSX.Element => {
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [activeView, setActiveView] = React.useState<DashboardView>("scanner");
  const [settings, setSettings] = React.useState<ScannerSettings>({
    apiBaseUrl: defaultApiBaseUrl, confidenceThreshold: 0.75, topK: 5,
  });
  const navigationLocked = React.useRef(false);
  const onNavigationLock = React.useCallback((locked: boolean) => { navigationLocked.current = locked; }, []);
  const ManagementPage = activeView === "scanner" ? null : managementPages[activeView];
  const page = ManagementPage
    ? <ManagementPage apiBaseUrl={settings.apiBaseUrl} />
    : (
      <ScannerWorkspace
        key={`${settings.apiBaseUrl}:${settings.confidenceThreshold}:${settings.topK}`}
        settings={settings}
        keyboardDisabled={settingsOpen}
        onNavigationLock={onNavigationLock}
      />
    );

  return (
    <DashboardLayout
      activeView={activeView}
      onViewChange={view => { if (!navigationLocked.current) setActiveView(view); }}
      onOpenSettings={() => { if (!navigationLocked.current) setSettingsOpen(true); }}
      settings={
        <SettingsSheet open={settingsOpen} settings={settings}
          onOpenChange={setSettingsOpen} onSettingsChange={setSettings} />
      }
    >
      <React.Suspense fallback={<p role="status" className="p-6">Đang tải giao diện…</p>}>
        {page}
      </React.Suspense>
    </DashboardLayout>
  );
};
