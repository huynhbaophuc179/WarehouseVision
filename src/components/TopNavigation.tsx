import { Cog, Moon, Sun } from "lucide-react";
import { Button } from "antd";
import { useAppearance } from "@/providers/appearance-provider";
import type { DashboardView } from "@/types/navigation";
import "@/styles/header-navigation.css";

export interface TopNavigationProps {
  activeView: DashboardView;
  onOpenSettings: () => void;
  onViewChange: (view: DashboardView) => void;
}

const navItems: { view: DashboardView; label: string }[] = [
  { view: "scanner", label: "Kiểm kho" },
  { view: "products", label: "Mã hàng" },
  { view: "categories", label: "Phân loại" },
  { view: "review", label: "Quản lý phiên" },
];

export const TopNavigation = ({
  activeView,
  onOpenSettings,
  onViewChange,
}: TopNavigationProps): JSX.Element => {
  const { mode, toggleMode } = useAppearance();
  const isDark = mode === "dark";
  const themeLabel = isDark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối";

  return (
    <header className="header-navigation">
      <nav aria-label="Điều hướng chính" className="header-navigation__items">
        {navItems.map((item) => (
          <Button
            key={item.view}
            type="text"
            htmlType="button"
            aria-current={activeView === item.view ? "page" : undefined}
            onClick={() => onViewChange(item.view)}
            className="header-navigation__item"
          >
            {item.label}
          </Button>
        ))}
      </nav>
      <div className="header-navigation__actions">
        <Button
          type="text"
          htmlType="button"
          className="header-navigation__action"
          onClick={toggleMode}
          aria-label={themeLabel}
          title={themeLabel}
          icon={isDark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
        />
        <Button
          type="text"
          htmlType="button"
          className="header-navigation__action"
          onClick={onOpenSettings}
          aria-label="Mở cài đặt"
          title="Cài đặt"
          icon={<Cog size={20} aria-hidden="true" />}
        />
      </div>
    </header>
  );
};
