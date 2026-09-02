import { Boxes, ClipboardCheck, Cog, PackageSearch, ScanSearch, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardView } from "@/types/navigation";

export interface TopNavigationProps {
  activeView: DashboardView;
  onOpenSettings: () => void;
  onViewChange: (view: DashboardView) => void;
}

const navItems: { view: DashboardView; label: string; icon: typeof PackageSearch }[] = [
  { view: "scanner", label: "Kiểm kho", icon: PackageSearch },
  { view: "products", label: "Mã hàng", icon: Boxes },
  { view: "categories", label: "Phân loại", icon: Tags },
  { view: "review", label: "Quản lý phiên", icon: ClipboardCheck },
  { view: "missing-box", label: "Bổ sung vùng", icon: ScanSearch },
];

export const TopNavigation = ({
  activeView,
  onOpenSettings,
  onViewChange,
}: TopNavigationProps): JSX.Element => (
  <header className="shrink-0 border-b border-slate-200 bg-white px-3">
    <div className="flex h-14 items-center gap-3">
      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeView === item.view;

          return (
            <button
              key={item.view}
              type="button"
              aria-current={active ? "page" : undefined}
              onClick={() => onViewChange(item.view)}
              className={cn(
                "flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors",
                active
                  ? "bg-blue-600 text-white shadow-sm"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <Button
        variant="outline"
        size="icon"
        className="shrink-0"
        onClick={onOpenSettings}
        aria-label="Mở cài đặt"
      >
        <Cog className="h-4 w-4" />
      </Button>
    </div>
  </header>
);
