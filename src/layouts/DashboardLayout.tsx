import * as React from "react";
import { Sidebar } from "@/components/Sidebar";
import { TopHeader } from "@/components/TopHeader";
import type { DashboardView } from "@/types/navigation";

export interface DashboardLayoutProps {
  activeView: DashboardView;
  leftPane: React.ReactNode;
  rightPane: React.ReactNode;
  fullPane?: React.ReactNode;
  settings: React.ReactNode;
  onOpenSettings: () => void;
  onViewChange: (view: DashboardView) => void;
}

export const DashboardLayout = ({
  activeView,
  leftPane,
  rightPane,
  fullPane,
  settings,
  onOpenSettings,
  onViewChange,
}: DashboardLayoutProps): JSX.Element => {
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  return (
    <div className="flex h-screen bg-slate-100 text-slate-950">
      <Sidebar
        collapsed={sidebarCollapsed}
        activeView={activeView}
        onToggle={() => setSidebarCollapsed((value) => !value)}
        onViewChange={onViewChange}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopHeader activeView={activeView} onOpenSettings={onOpenSettings} />
        <main className="min-h-0 flex-1 p-4">
          {fullPane ? (
            <div className="h-full min-h-0 overflow-y-auto">{fullPane}</div>
          ) : (
            <div className="grid h-full min-h-0 gap-4 lg:grid-cols-[minmax(0,65fr)_minmax(360px,35fr)]">
              <div className="min-h-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{leftPane}</div>
              <div className="min-h-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{rightPane}</div>
            </div>
          )}
        </main>
      </div>
      {settings}
    </div>
  );
};
