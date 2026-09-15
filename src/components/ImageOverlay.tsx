import { ImageOff } from "lucide-react";
import * as React from "react";
import { calculateContainedMediaRect } from "@/lib/mediaFrame";
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
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = React.useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = React.useState<{
    url: string;
    width: number;
    height: number;
  } | null>(null);

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateSize = (): void => {
      const { width, height } = container.getBoundingClientRect();
      setContainerSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const onImageLoad = (event: React.SyntheticEvent<HTMLImageElement>): void => {
    setImageSize({
      url: event.currentTarget.getAttribute("src") ?? "",
      width: event.currentTarget.naturalWidth,
      height: event.currentTarget.naturalHeight,
    });
  };

  if (!imageUrl) {
    return (
      <div className="flex h-full min-h-72 items-center justify-center rounded-lg border border-dashed border-border bg-subtle">
        <div className="text-center text-muted">
          <ImageOff className="mx-auto h-10 w-10" />
          <p className="mt-3 text-sm font-medium">Chưa có ảnh</p>
        </div>
      </div>
    );
  }

  const loadedImageSize = imageSize?.url === imageUrl ? imageSize : null;
  const mediaRect = calculateContainedMediaRect(
    containerSize.width,
    containerSize.height,
    loadedImageSize?.width ?? 0,
    loadedImageSize?.height ?? 0,
  );
  const mediaStyle: React.CSSProperties = {
    left: mediaRect.x,
    top: mediaRect.y,
    width: mediaRect.width,
    height: mediaRect.height,
  };

  return (
    <div ref={containerRef} className="relative h-full w-full overflow-hidden bg-surface">
      <img
        src={imageUrl}
        alt="Ảnh sản phẩm"
        className="absolute select-none object-contain"
        style={mediaStyle}
        draggable={false}
        onLoad={onImageLoad}
      />
      {loadedImageSize && mediaRect.width > 0 && detections.length > 0 && (
        <svg
          className="absolute"
          style={mediaStyle}
          viewBox={`0 0 ${loadedImageSize.width} ${loadedImageSize.height}`}
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
