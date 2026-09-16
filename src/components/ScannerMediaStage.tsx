import { Loader2, VideoOff } from "lucide-react";
import * as React from "react";
import { ImageOverlay } from "@/components/ImageOverlay";
import type { DetectionResult } from "@/types/api";

export interface ScannerMediaStageProps {
  videoRef: React.RefObject<HTMLVideoElement>;
  cameraReady: boolean;
  cameraStarting: boolean;
  cameraError: string | null;
  imageUrl: string | null;
  detections: DetectionResult[];
  selectedDetectionId: string | null;
  isProcessing: boolean;
  onSelectDetection: (detectionId: string) => void;
}

export const ScannerMediaStage = ({
  videoRef,
  cameraReady,
  cameraStarting,
  cameraError,
  imageUrl,
  detections,
  selectedDetectionId,
  isProcessing,
  onSelectDetection,
}: ScannerMediaStageProps): JSX.Element => (
  <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg border border-line bg-subtle">
    <video
      ref={videoRef}
      autoPlay
      muted
      playsInline
      className={cameraReady && !imageUrl ? "absolute inset-0 h-full w-full bg-white object-contain" : "hidden"}
    />

    {imageUrl ? (
      <ImageOverlay
        imageUrl={imageUrl}
        detections={detections}
        selectedDetectionId={selectedDetectionId}
        onSelectDetection={onSelectDetection}
      />
    ) : !cameraReady ? (
      <div
        className="flex h-full flex-col items-center justify-center bg-subtle px-6 text-center"
        aria-live="polite"
      >
        <VideoOff className="h-10 w-10 text-faint" />
        <p className="mt-3 text-sm font-medium text-secondary">
          {cameraStarting ? "Đang kết nối máy ảnh..." : cameraError ?? "Máy ảnh chưa sẵn sàng"}
        </p>
      </div>
    ) : null}

    {isProcessing && imageUrl ? (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 px-4 text-white">
        <div className="flex items-center gap-3 rounded-lg bg-slate-950/80 px-4 py-3 text-sm font-medium">
          <Loader2 className="h-5 w-5 animate-spin" />
          Đang nhận diện sản phẩm...
        </div>
      </div>
    ) : null}
  </div>
);
