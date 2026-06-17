import { Boxes, ChevronLeft, ChevronRight, ClipboardCheck, PackageSearch, ScanSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { DashboardView } from "@/types/navigation";

export interface SidebarProps {
  collapsed: boolean;
  activeView: DashboardView;
  onToggle: () => void;
  onViewChange: (view: DashboardView) => void;
}

const navItems: { view: DashboardView; label: string; icon: typeof PackageSearch }[] = [
  { view: "scanner", label: "Nhận diện / Kiểm kho", icon: PackageSearch },
  { view: "products", label: "Sản phẩm", icon: Boxes },
  { view: "review", label: "Quản lý phiên", icon: ClipboardCheck },
  { view: "missing-box", label: "Vẽ vùng bị thiếu", icon: ScanSearch },
];

export const Sidebar = ({ collapsed, activeView, onToggle, onViewChange }: SidebarProps): JSX.Element => (
  <aside
    className={cn(
      "flex h-screen shrink-0 flex-col border-r border-slate-200 bg-white transition-all",
      collapsed ? "w-16" : "w-64",
    )}
  >
    <div className="flex h-14 items-center justify-between border-b border-slate-200 px-3">
      {!collapsed && (
        <div>
          <p className="text-sm font-semibold text-slate-950">WarehouseVision</p>
          <p className="text-xs text-slate-500">Bảng điều khiển kho</p>
        </div>
      )}
      <Button variant="ghost" size="icon" onClick={onToggle} aria-label="Thu gọn menu">
        {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
      </Button>
    </div>
    <nav className="space-y-1 p-2">
      {navItems.map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            type="button"
            onClick={() => onViewChange(item.view)}
            className={cn(
              "flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
              activeView === item.view
                ? "bg-slate-950 text-white"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
              collapsed && "justify-center px-2",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </button>
        );
      })}
    </nav>
  </aside>
);
