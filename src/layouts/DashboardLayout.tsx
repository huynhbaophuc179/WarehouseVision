import * as React from "react";
import { Layout } from "antd";
import { TopNavigation } from "@/components/TopNavigation";
import type { DashboardView } from "@/types/navigation";

export interface DashboardLayoutProps {
  activeView: DashboardView;
  children: React.ReactNode;
  settings: React.ReactNode;
  onOpenSettings: () => void;
  onViewChange: (view: DashboardView) => void;
}

export const DashboardLayout = ({
  activeView,
  children,
  settings,
  onOpenSettings,
  onViewChange,
}: DashboardLayoutProps): JSX.Element => {
  return (
    <Layout className="h-screen text-content">
      <TopNavigation
        activeView={activeView}
        onOpenSettings={onOpenSettings}
        onViewChange={onViewChange}
      />
      <Layout.Content className={`min-h-0 flex-1 overflow-hidden ${activeView === "scanner" ? "" : "p-4"}`}>
        <div className="h-full min-h-0 overflow-y-auto">{children}</div>
      </Layout.Content>
      {settings}
    </Layout>
  );
};
