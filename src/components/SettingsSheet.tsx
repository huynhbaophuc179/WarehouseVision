import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ScannerSettings } from "@/types/api";

export interface SettingsSheetProps {
  open: boolean;
  settings: ScannerSettings;
  onOpenChange: (open: boolean) => void;
  onSettingsChange: (settings: ScannerSettings) => void;
}

export const SettingsSheet = ({
  open,
  settings,
  onOpenChange,
  onSettingsChange,
}: SettingsSheetProps): JSX.Element => {
  const update = <K extends keyof ScannerSettings>(key: K, value: ScannerSettings[K]): void => {
    onSettingsChange({ ...settings, [key]: value });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Cài đặt</SheetTitle>
          <SheetDescription>
            Chỉ điều chỉnh khi cần thay đổi cách nhận diện.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Ngưỡng tự chấp nhận</Label>
              <span className="text-sm font-medium text-slate-700">
                {Math.round(settings.confidenceThreshold * 100)}%
              </span>
            </div>
            <Slider
              value={[settings.confidenceThreshold]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={(value) => update("confidenceThreshold", value[0] ?? 0.75)}
            />
            <p className="text-xs text-slate-500">
              Sản phẩm có điểm gợi ý cao nhất đạt ngưỡng này sẽ được tự động chấp nhận.
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
