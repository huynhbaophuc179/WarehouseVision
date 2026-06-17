import * as React from "react";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DisplayBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ExistingDisplayBox extends DisplayBox {
  label: string;
}

export interface MissingBoxCanvasProps {
  imageBase64: string | null;
  mimeType: string | null;
  width: number;
  height: number;
  existingBoxes: ExistingDisplayBox[];
  selectedBox: DisplayBox | null;
  onSelectedBoxChange: (box: DisplayBox | null) => void;
}

const normalizeBox = (box: DisplayBox): DisplayBox => ({
  x1: Math.min(box.x1, box.x2),
  y1: Math.min(box.y1, box.y2),
  x2: Math.max(box.x1, box.x2),
  y2: Math.max(box.y1, box.y2),
});

const pointerToCanvas = (
  event: React.PointerEvent<HTMLCanvasElement>,
  canvas: HTMLCanvasElement,
): { x: number; y: number } => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * scaleX)),
    y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * scaleY)),
  };
};

export const MissingBoxCanvas = ({
  imageBase64,
  mimeType,
  width,
  height,
  existingBoxes,
  selectedBox,
  onSelectedBoxChange,
}: MissingBoxCanvasProps): JSX.Element => {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const [loadState, setLoadState] = React.useState<"loading" | "loaded" | "error">("loading");
  const [draftBox, setDraftBox] = React.useState<DisplayBox | null>(null);
  const [dragStart, setDragStart] = React.useState<{ x: number; y: number } | null>(null);
  const imageUrl = imageBase64 ? `data:${mimeType || "image/jpeg"};base64,${imageBase64}` : null;

  React.useEffect(() => {
    if (!imageUrl) {
      setLoadState("error");
      imageRef.current = null;
      return;
    }
    setLoadState("loading");
    const image = new Image();
    image.onload = () => {
      imageRef.current = image;
      setLoadState("loaded");
    };
    image.onerror = () => {
      imageRef.current = null;
      setLoadState("error");
    };
    image.src = imageUrl;
  }, [imageUrl]);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context || loadState !== "loaded" || !imageRef.current) {
      return;
    }

    context.clearRect(0, 0, width, height);
    context.drawImage(imageRef.current, 0, 0, width, height);

    existingBoxes.forEach((box, index) => {
      const normalized = normalizeBox(box);
      const boxWidth = normalized.x2 - normalized.x1;
      const boxHeight = normalized.y2 - normalized.y1;
      context.save();
      context.strokeStyle = "#2563eb";
      context.lineWidth = 3;
      context.setLineDash([8, 6]);
      context.strokeRect(normalized.x1, normalized.y1, boxWidth, boxHeight);
      context.setLineDash([]);
      context.fillStyle = "#2563eb";
      context.fillRect(normalized.x1, Math.max(0, normalized.y1 - 28), 36, 28);
      context.fillStyle = "#ffffff";
      context.font = "700 16px system-ui";
      context.fillText(box.label || String(index + 1), normalized.x1 + 12, Math.max(18, normalized.y1 - 8));
      context.restore();
    });

    const activeBox = draftBox ?? selectedBox;
    if (activeBox) {
      const normalized = normalizeBox(activeBox);
      context.save();
      context.strokeStyle = "#16a34a";
      context.lineWidth = 4;
      context.strokeRect(
        normalized.x1,
        normalized.y1,
        normalized.x2 - normalized.x1,
        normalized.y2 - normalized.y1,
      );
      context.restore();
    }
  }, [draftBox, existingBoxes, height, loadState, selectedBox, width]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (loadState !== "loaded" || !canvasRef.current) {
      return;
    }
    const point = pointerToCanvas(event, canvasRef.current);
    setDragStart(point);
    setDraftBox({ x1: point.x, y1: point.y, x2: point.x, y2: point.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!dragStart || !canvasRef.current) {
      return;
    }
    const point = pointerToCanvas(event, canvasRef.current);
    setDraftBox({ x1: dragStart.x, y1: dragStart.y, x2: point.x, y2: point.y });
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLCanvasElement>): void => {
    if (!dragStart || !canvasRef.current) {
      return;
    }
    const point = pointerToCanvas(event, canvasRef.current);
    const nextBox = normalizeBox({ x1: dragStart.x, y1: dragStart.y, x2: point.x, y2: point.y });
    setDragStart(null);
    setDraftBox(null);
    onSelectedBoxChange(nextBox);
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  if (!imageBase64) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
        <div className="text-center text-slate-500">
          <ImageOff className="mx-auto h-10 w-10" />
          <p className="mt-3 text-sm font-medium">Không tải được ảnh phiên nhận diện</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-950 p-2">
      {loadState === "error" ? (
        <div className="flex min-h-[420px] items-center justify-center rounded-lg bg-slate-900 text-sm text-white">
          Không hiển thị được ảnh. Vui lòng chọn phiên khác.
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className={cn(
            "mx-auto block h-auto max-w-full cursor-crosshair rounded-lg",
            loadState !== "loaded" && "opacity-50",
          )}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        />
      )}
    </div>
  );
};
