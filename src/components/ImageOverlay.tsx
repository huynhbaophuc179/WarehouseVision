import { ImageOff } from "lucide-react";
import * as React from "react";
import { cn } from "@/lib/utils";
import type { DetectionResult } from "@/types/api";

export interface ImageOverlayProps {
  imageUrl: string | null;
  detections: DetectionResult[];
  selectedDetectionId: string | null;
  onSelectDetection: (detectionId: string) => void;
}

export const ImageOverlay = ({
  imageUrl,
  detections,
  selectedDetectionId,
  onSelectDetection,
}: ImageOverlayProps): JSX.Element => {
  const [imageSize, setImageSize] = React.useState<{ width: number; height: number } | null>(null);

  const onImageLoad = (event: React.SyntheticEvent<HTMLImageElement>): void => {
    setImageSize({
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    });
  };

  if (!imageUrl) {
    return (
      <div className="flex min-h-[520px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
        <div className="text-center text-slate-500">
          <ImageOff className="mx-auto h-10 w-10" />
          <p className="mt-3 text-sm font-medium">Chưa có ảnh để scan</p>
          <p className="text-xs">Tải ảnh hoặc chụp ảnh sản phẩm để bắt đầu.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-950">
      <img
        src={imageUrl}
        alt="Ảnh scan sản phẩm"
        className="block w-full select-none"
        draggable={false}
        onLoad={onImageLoad}
      />
      {imageSize && detections.length > 0 && (
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${imageSize.width} ${imageSize.height}`}
          role="img"
          aria-label="Vùng sản phẩm đã nhận diện"
        >
          {detections.map((detection, index) => {
            const [x1 = 0, y1 = 0, x2 = 0, y2 = 0] = detection.box;
            const width = Math.max(0, x2 - x1);
            const height = Math.max(0, y2 - y1);
            const selected = detection.detection_id === selectedDetectionId;
            const labelX = Math.max(0, x1);
            const labelY = Math.max(22, y1);
            return (
              <g
                key={detection.detection_id}
                className="cursor-pointer"
                onClick={() => onSelectDetection(detection.detection_id)}
              >
                <rect
                  x={x1}
                  y={y1}
                  width={width}
                  height={height}
                  className={cn(
                    "fill-transparent stroke-[6]",
                    selected ? "stroke-emerald-400" : "stroke-blue-500",
                  )}
                />
                <rect
                  x={labelX}
                  y={labelY - 34}
                  width={64}
                  height={34}
                  className={selected ? "fill-emerald-500" : "fill-blue-600"}
                />
                <text
                  x={labelX + 18}
                  y={labelY - 10}
                  className="fill-white text-2xl font-bold"
                >
                  {index + 1}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
};
