import { Button } from "antd";
import { useId, useState } from "react";
import { ArrowLeft, ArrowRight, ImageOff } from "lucide-react";
import { ScannerKeycap } from "@/components/scanner-keycap";

export interface ScannerReviewBox {
  id: string;
  groupId: string;
  /** Coordinates refer to the original image pixels: left, top, right, bottom. */
  box: [number, number, number, number];
}

export interface ScannerReviewCanvasProps {
  activeItemName?: string;
  activeItemId: string;
  activeObjectId?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
  boxes: ScannerReviewBox[];
  onPreviousObject: () => void;
  onNextObject: () => void;
  sampleCaption?: string;
}

function ReviewImage({ imageUrl, imageWidth, imageHeight, boxes, activeObjectId }:
  Pick<ScannerReviewCanvasProps, "imageWidth" | "imageHeight" | "boxes" | "activeObjectId">
  & { imageUrl: string }) {
  const maskId = useId();
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);
  const width = imageWidth && imageWidth > 0 ? imageWidth : naturalSize.width;
  const height = imageHeight && imageHeight > 0 ? imageHeight : naturalSize.height;

  if (failed) return <div className="scanner-review-image-empty" role="status">
    <ImageOff aria-hidden="true" size={36} /><p>Không tải được ảnh. Vui lòng chụp lại.</p>
  </div>;

  return <>
    <img src={imageUrl} className="scanner-review-image" alt="Ảnh các sản phẩm đang rà soát"
      onError={() => setFailed(true)} onLoad={(event) => setNaturalSize({
        width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight,
      })} />
    {width > 0 && height > 0 && (
      <svg className="scanner-review-boxes" viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}>
            <rect width={width} height={height} fill="white" />
            {boxes.map(({ id, box: [left, top, right, bottom] }) => (
              <rect key={id} x={left} y={top} width={right - left} height={bottom - top} fill="black" />
            ))}
          </mask>
        </defs>
        <rect width={width} height={height} fill="black" opacity="0.48" mask={`url(#${maskId})`} />
        {boxes.map(({ id, box: [left, top, right, bottom] }) => (
          <rect key={id} x={left} y={top} width={right - left} height={bottom - top}
            className={id === activeObjectId ? "scanner-review-box scanner-review-box-current" : "scanner-review-box"}
            fill="none" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
    )}
  </>;
}

export function ScannerReviewCanvas({ activeItemName, activeItemId, activeObjectId,
  imageUrl, imageWidth, imageHeight, boxes, onPreviousObject, onNextObject,
}: ScannerReviewCanvasProps) {
  const groupBoxes = boxes.filter((entry) => entry.groupId === activeItemId
    && entry.box.every(Number.isFinite) && entry.box[2] > entry.box[0] && entry.box[3] > entry.box[1]);
  const objectIndex = Math.max(0, groupBoxes.findIndex((box) => box.id === activeObjectId));

  return (
    <section className="scanner-review-canvas" aria-label={activeItemName ? `Ảnh và vùng sản phẩm: ${activeItemName}` : "Ảnh và vùng sản phẩm"}>
      <header className="scanner-review-canvas-header">
        <h2>Ảnh đối chiếu</h2>
        {groupBoxes.length > 0 && <span aria-live="polite">Vật {objectIndex + 1} / {groupBoxes.length}</span>}
      </header>
      <div className="scanner-review-image-stage">
        {imageUrl ? <ReviewImage key={imageUrl} imageUrl={imageUrl}
          imageWidth={imageWidth} imageHeight={imageHeight} boxes={groupBoxes}
          activeObjectId={groupBoxes[objectIndex]?.id} /> : (
          <div className="scanner-review-image-empty"><ImageOff aria-hidden="true" size={36} />
            <p>Chưa có ảnh để rà soát.</p></div>
        )}
      </div>
      <footer className="scanner-review-canvas-footer">
        <div className="scanner-review-object-navigation" role="group" aria-label="Đổi vật trong mã hàng">
          <Button htmlType="button" onClick={onPreviousObject} disabled={groupBoxes.length < 2}
            aria-label="Vật trước trong mã hàng, phím 4" aria-keyshortcuts="4">
            <ScannerKeycap>4</ScannerKeycap><ArrowLeft aria-hidden="true" size={24} />
          </Button>
          <Button htmlType="button" onClick={onNextObject} disabled={groupBoxes.length < 2}
            aria-label="Vật sau trong mã hàng, phím 6" aria-keyshortcuts="6">
            <ScannerKeycap>6</ScannerKeycap><ArrowRight aria-hidden="true" size={24} />
          </Button>
        </div>
      </footer>
    </section>
  );
}
