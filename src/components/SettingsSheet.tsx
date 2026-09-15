import { Drawer, Slider } from "antd";
import { X } from "lucide-react";
import type { ScannerSettings } from "@/types/api";

export interface SettingsSheetProps {
  open: boolean;
  settings: ScannerSettings;
  onOpenChange: (open: boolean) => void;
  onSettingsChange: (settings: ScannerSettings) => void;
}

export const SettingsSheet = ({
  open, settings, onOpenChange, onSettingsChange,
}: SettingsSheetProps): JSX.Element => (
  <Drawer
    title="Cài đặt"
    open={open}
    onClose={() => onOpenChange(false)}
    closable={{ "aria-label": "Đóng cài đặt", placement: "end", closeIcon: <X size={16} aria-hidden="true" /> }}
    size="min(400px, calc(100vw - 24px))"
  >
    <div className="flex items-center justify-between gap-4">
      <span id="recognition-threshold-label">Ngưỡng chấp nhận gợi ý</span>
      <span>{Math.round(settings.confidenceThreshold * 100)}%</span>
    </div>
    <Slider
      ariaLabelledByForHandle="recognition-threshold-label"
      value={settings.confidenceThreshold}
      min={0}
      max={1}
      step={0.01}
      tooltip={{ formatter: value => `${Math.round((value ?? 0) * 100)}%` }}
      onChange={confidenceThreshold => onSettingsChange({ ...settings, confidenceThreshold })}
    />
  </Drawer>
);
