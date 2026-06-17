import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
          <SheetTitle>Cài đặt kỹ thuật</SheetTitle>
          <SheetDescription>
            Các tham số này chỉ dành cho người phụ trách vận hành AI. Màn scan chính luôn được giữ gọn.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="api-url">API backend</Label>
            <Input
              id="api-url"
              value={settings.apiBaseUrl}
              onChange={(event) => update("apiBaseUrl", event.target.value)}
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Confidence</Label>
              <span className="text-sm font-medium text-slate-700">
                {settings.confidenceThreshold.toFixed(2)}
              </span>
            </div>
            <Slider
              value={[settings.confidenceThreshold]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={(value) => update("confidenceThreshold", value[0] ?? 0.25)}
            />
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>IOU</Label>
              <span className="text-sm font-medium text-slate-700">{settings.iouThreshold.toFixed(2)}</span>
            </div>
            <Slider
              value={[settings.iouThreshold]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={(value) => update("iouThreshold", value[0] ?? 0.3)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model-name">Model nhận diện vùng</Label>
            <Input
              id="model-name"
              value={settings.modelName}
              onChange={(event) => update("modelName", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="top-k">Số gợi ý SKU</Label>
            <Input
              id="top-k"
              type="number"
              min={1}
              max={10}
              value={settings.topK}
              onChange={(event) => update("topK", Number(event.target.value))}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
};
