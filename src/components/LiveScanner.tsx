import { Camera, Loader2, UploadCloud } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ImageOverlay } from "@/components/ImageOverlay";
import type { DetectionResult } from "@/types/api";

export interface LiveScannerProps {
  imageUrl: string | null;
  selectedFileName: string | null;
  detections: DetectionResult[];
  selectedDetectionId: string | null;
  isProcessing: boolean;
  onFileSelected: (file: File) => void;
  onRecognize: () => void;
  onSelectDetection: (detectionId: string) => void;
}

export const LiveScanner = ({
  imageUrl,
  selectedFileName,
  detections,
  selectedDetectionId,
  isProcessing,
  onFileSelected,
  onRecognize,
  onSelectDetection,
}: LiveScannerProps): JSX.Element => {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelected(file);
    }
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Live Scanner</h2>
          <p className="text-sm text-slate-500">
            Ảnh được xử lý qua AI nhận diện vùng, sau đó đối chiếu SKU trong kho.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            capture="environment"
            className="hidden"
            onChange={handleChange}
          />
          <Button variant="outline" onClick={() => inputRef.current?.click()}>
            <UploadCloud className="h-4 w-4" />
            Chọn ảnh
          </Button>
          <Button disabled={!imageUrl || isProcessing} onClick={onRecognize}>
            {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            Bắt đầu nhận diện
          </Button>
        </div>
      </div>
      {selectedFileName && (
        <Card>
          <CardContent className="flex items-center justify-between p-3">
            <span className="text-sm font-medium text-slate-700">Ảnh đã chọn</span>
            <span className="truncate text-sm text-slate-500">{selectedFileName}</span>
          </CardContent>
        </Card>
      )}
      <div className="min-h-0 flex-1 overflow-auto rounded-lg bg-slate-100 p-2">
        <ImageOverlay
          imageUrl={imageUrl}
          detections={detections}
          selectedDetectionId={selectedDetectionId}
          onSelectDetection={onSelectDetection}
        />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs text-slate-500">
        <div className="rounded-md border border-slate-200 bg-white p-2">
          <span className="font-semibold text-slate-700">{detections.length}</span> vùng phát hiện
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-2">
          <span className="font-semibold text-emerald-700">
            {detections.filter((item) => item.status === "recognized").length}
          </span>{" "}
          đã nhận diện
        </div>
        <div className="rounded-md border border-slate-200 bg-white p-2">
          <span className="font-semibold text-amber-700">
            {detections.filter((item) => item.status !== "recognized").length}
          </span>{" "}
          cần kiểm tra
        </div>
      </div>
    </section>
  );
};
