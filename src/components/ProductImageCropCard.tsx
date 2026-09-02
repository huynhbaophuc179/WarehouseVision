import { ImageOff, Scissors, Trash2, X } from "lucide-react";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MissingBoxCanvas, type DisplayBox } from "@/components/MissingBoxCanvas";

export interface ProductImageEntry {
  id: string;
  file: File;
  selectedBox: DisplayBox | null;
  croppedFile: File | null;
  cropPreviewUrl: string | null;
}

export interface ProductImageCropCardProps {
  entry: ProductImageEntry;
  index: number;
  onCropChange: (id: string, box: DisplayBox | null, croppedFile: File | null, previewUrl: string | null) => void;
  onDelete: (id: string) => void;
}

interface Size {
  width: number;
  height: number;
}

interface LoadedImage {
  base64: string;
  dataUrl: string;
  mimeType: string;
  size: Size;
}

const normalizeBox = (box: DisplayBox): DisplayBox => ({
  x1: Math.min(box.x1, box.x2),
  y1: Math.min(box.y1, box.y2),
  x2: Math.max(box.x1, box.x2),
  y2: Math.max(box.y1, box.y2),
});

const fitDisplaySize = (sourceSize: Size, maxWidth: number, maxHeight: number): Size => {
  const sourceWidth = Math.max(1, sourceSize.width);
  const sourceHeight = Math.max(1, sourceSize.height);
  const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
};

const readImage = (file: File): Promise<LoadedImage> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result ?? "");
      const image = new Image();
      image.onload = () => {
        const [header, base64 = ""] = dataUrl.split(",");
        const mimeMatch = header.match(/^data:(.*?);base64$/);
        resolve({
          base64,
          dataUrl,
          mimeType: mimeMatch?.[1] || file.type || "image/jpeg",
          size: { width: image.naturalWidth, height: image.naturalHeight },
        });
      };
      image.onerror = () => reject(new Error("Không đọc được ảnh."));
      image.src = dataUrl;
    };
    reader.onerror = () => reject(new Error("Không đọc được file ảnh."));
    reader.readAsDataURL(file);
  });

const cropImageFile = (
  imageDataUrl: string,
  fileName: string,
  box: DisplayBox,
  displaySize: Size,
): Promise<{ file: File; previewUrl: string }> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const normalized = normalizeBox(box);
      const x = Math.max(0, Math.round(normalized.x1));
      const y = Math.max(0, Math.round(normalized.y1));
      const width = Math.max(1, Math.round(normalized.x2 - normalized.x1));
      const height = Math.max(1, Math.round(normalized.y2 - normalized.y1));
      const sourceCanvas = document.createElement("canvas");
      sourceCanvas.width = displaySize.width;
      sourceCanvas.height = displaySize.height;
      const sourceContext = sourceCanvas.getContext("2d");
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!sourceContext || !context) {
        reject(new Error("Không tạo được ảnh cắt."));
        return;
      }
      sourceContext.drawImage(image, 0, 0, displaySize.width, displaySize.height);
      context.drawImage(sourceCanvas, x, y, width, height, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Không tạo được ảnh cắt."));
            return;
          }
          const croppedName = fileName.replace(/\.[^.]+$/, "") || "product";
          resolve({
            file: new File([blob], `${croppedName}-crop.jpg`, { type: "image/jpeg" }),
            previewUrl: URL.createObjectURL(blob),
          });
        },
        "image/jpeg",
        0.92,
      );
    };
    image.onerror = () => reject(new Error("Không đọc được ảnh để cắt."));
    image.src = imageDataUrl;
  });

export const ProductImageCropCard = ({
  entry,
  index,
  onCropChange,
  onDelete,
}: ProductImageCropCardProps): JSX.Element => {
  const [loadedImage, setLoadedImage] = React.useState<LoadedImage | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [cropError, setCropError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    setLoadedImage(null);
    setLoadError(null);
    readImage(entry.file)
      .then((image) => {
        if (active) {
          setLoadedImage(image);
        }
      })
      .catch((error: Error) => {
        if (active) {
          setLoadError(error.message);
        }
      });
    return () => {
      active = false;
    };
  }, [entry.file]);

  React.useEffect(
    () => () => {
      if (entry.cropPreviewUrl) {
        URL.revokeObjectURL(entry.cropPreviewUrl);
      }
    },
    [entry.cropPreviewUrl],
  );

  const displaySize = loadedImage ? fitDisplaySize(loadedImage.size, 620, 360) : { width: 1, height: 1 };

  const handleBoxChange = (box: DisplayBox | null): void => {
    setCropError(null);
    if (!box || !loadedImage) {
      onCropChange(entry.id, null, null, null);
      return;
    }
    const normalized = normalizeBox(box);
    if (normalized.x2 - normalized.x1 < 10 || normalized.y2 - normalized.y1 < 10) {
      setCropError("Vùng cắt quá nhỏ.");
      onCropChange(entry.id, box, null, null);
      return;
    }
    cropImageFile(loadedImage.dataUrl, entry.file.name, normalized, displaySize)
      .then((result) => onCropChange(entry.id, normalized, result.file, result.previewUrl))
      .catch((error: Error) => setCropError(error.message));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant={index === 0 ? "success" : "secondary"}>{index === 0 ? "Ảnh chính" : "Ảnh bổ sung"}</Badge>
            {entry.croppedFile ? (
              <Badge variant="warning" className="gap-1">
                <Scissors className="h-3 w-3" />
                Đã cắt
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-slate-950">{entry.file.name}</p>
          <p className="text-xs text-slate-500">Kéo chuột trên ảnh nếu muốn chỉ lưu đúng vùng linh kiện.</p>
        </div>
        <Button type="button" variant="outline" size="icon" onClick={() => onDelete(entry.id)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      {loadError ? (
        <div className="flex min-h-56 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 text-sm text-slate-500">
          <div className="text-center">
            <ImageOff className="mx-auto h-8 w-8" />
            <p className="mt-2">{loadError}</p>
          </div>
        </div>
      ) : loadedImage ? (
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
          <MissingBoxCanvas
            imageBase64={loadedImage.base64}
            mimeType={loadedImage.mimeType}
            width={displaySize.width}
            height={displaySize.height}
            existingBoxes={[]}
            selectedBox={entry.selectedBox}
            onSelectedBoxChange={handleBoxChange}
          />
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-slate-950">Ảnh sẽ lưu</p>
              <p className="text-xs text-slate-500">
                {entry.croppedFile ? "Hệ thống sẽ lưu vùng đã cắt." : "Chưa cắt vùng, hệ thống sẽ lưu toàn bộ ảnh."}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-950 p-2">
              <img
                src={entry.cropPreviewUrl ?? loadedImage.dataUrl}
                alt={entry.file.name}
                className="max-h-56 w-full rounded-md object-contain"
              />
            </div>
            {entry.selectedBox ? (
              <Button type="button" variant="outline" size="sm" onClick={() => handleBoxChange(null)}>
                <X className="mr-2 h-4 w-4" />
                Bỏ vùng cắt
              </Button>
            ) : null}
            {cropError ? <p className="text-sm text-red-600">{cropError}</p> : null}
          </div>
        </div>
      ) : (
        <div className="h-56 animate-pulse rounded-lg bg-slate-100" />
      )}
    </div>
  );
};
