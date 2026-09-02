import * as React from "react";
import { TopNavigation } from "@/components/TopNavigation";
import type { DashboardView } from "@/types/navigation";

export interface DashboardLayoutProps {
  activeView: DashboardView;
  leftPane: React.ReactNode;
  rightPane: React.ReactNode;
  bottomPane?: React.ReactNode;
  fullPane?: React.ReactNode;
  settings: React.ReactNode;
  onOpenSettings: () => void;
  onViewChange: (view: DashboardView) => void;
}

export const DashboardLayout = ({
  activeView,
  leftPane,
  rightPane,
  bottomPane,
  fullPane,
  settings,
  onOpenSettings,
  onViewChange,
}: DashboardLayoutProps): JSX.Element => {
  return (
    <div className="flex h-screen flex-col bg-slate-100 text-slate-950">
      <TopNavigation
        activeView={activeView}
        onOpenSettings={onOpenSettings}
        onViewChange={onViewChange}
      />
      <main className="min-h-0 flex-1 overflow-hidden p-4">
        {fullPane ? (
          <div className="h-full min-h-0 overflow-y-auto">{fullPane}</div>
        ) : (
          <div className="h-full min-h-0 overflow-y-auto pr-1">
            <div className="grid gap-4 lg:h-[calc(100vh-8rem)] lg:min-h-[620px] lg:grid-cols-[minmax(0,60fr)_minmax(420px,40fr)]">
              <div className="min-h-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{leftPane}</div>
              <div className="min-h-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{rightPane}</div>
            </div>
            {bottomPane ? <div className="mt-4">{bottomPane}</div> : null}
          </div>
        )}
      </main>
      {settings}
    </div>
  );
};
