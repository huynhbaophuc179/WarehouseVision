import { Cog, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DashboardView } from "@/types/navigation";

export interface TopHeaderProps {
  activeView: DashboardView;
  onOpenSettings: () => void;
}

const headerCopy: Record<DashboardView, { title: string; subtitle: string }> = {
  scanner: {
    title: "Nhận diện và kiểm kho",
    subtitle: "Scan ảnh, xác nhận SKU, cập nhật tồn kho an toàn",
  },
  products: {
    title: "Quản lý sản phẩm",
    subtitle: "Tra cứu SKU, ảnh tham chiếu và tồn kho",
  },
  review: {
    title: "Quản lý phiên",
    subtitle: "Xử lý object trong từng phiên nhận diện",
  },
  "missing-box": {
    title: "Vẽ vùng bị thiếu",
    subtitle: "Bổ sung object AI còn bỏ sót để làm sạch dữ liệu huấn luyện",
  },
};

export const TopHeader = ({ activeView, onOpenSettings }: TopHeaderProps): JSX.Element => {
  const copy = headerCopy[activeView];

  return (
    <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-950 text-white">
          <ScanLine className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-base font-semibold text-slate-950">{copy.title}</h1>
          <p className="text-xs text-slate-500">{copy.subtitle}</p>
        </div>
      </div>
      <Button variant="outline" size="icon" onClick={onOpenSettings} aria-label="Mở cài đặt kỹ thuật">
        <Cog className="h-4 w-4" />
      </Button>
    </header>
  );
};
