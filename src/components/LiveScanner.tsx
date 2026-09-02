import { Camera, ImageUp, Loader2, RotateCcw, Video, VideoOff } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ImageOverlay } from "@/components/ImageOverlay";
import type { DetectionResult } from "@/types/api";

export interface LiveScannerProps {
  isProcessing: boolean;
  imageUrl: string | null;
  detections: DetectionResult[];
  selectedDetectionId: string | null;
  allowEnterRetake: boolean;
  onFileSelected: (file: File) => void;
  onRecognize: (file?: File) => void;
  onSelectDetection: (detectionId: string) => void;
}

const cameraErrorMessage = (error: unknown): string => {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Chưa được cấp quyền dùng máy ảnh. Hãy cho phép trình duyệt sử dụng máy ảnh.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "Không tìm thấy máy ảnh trên máy tính.";
  }
  return "Không mở được máy ảnh. Hãy kiểm tra kết nối và thử lại.";
};

const isInteractiveTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, select, button, a, [contenteditable='true']"));
};

export const LiveScanner = ({
  isProcessing,
  imageUrl,
  detections,
  selectedDetectionId,
  allowEnterRetake,
  onFileSelected,
  onRecognize,
  onSelectDetection,
}: LiveScannerProps): JSX.Element => {
  const uploadInputRef = React.useRef<HTMLInputElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const cameraRequestRef = React.useRef(0);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [cameraStarting, setCameraStarting] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const stopCamera = React.useCallback((): void => {
    cameraRequestRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
  }, []);

  const startCamera = React.useCallback(async (): Promise<void> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Trình duyệt này không hỗ trợ máy ảnh trực tiếp.");
      return;
    }
    setCameraStarting(true);
    setCameraError(null);
    stopCamera();
    const requestId = cameraRequestRef.current + 1;
    cameraRequestRef.current = requestId;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (requestId !== cameraRequestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraReady(true);
    } catch (error) {
      if (requestId === cameraRequestRef.current) {
        setCameraError(cameraErrorMessage(error));
      }
    } finally {
      if (requestId === cameraRequestRef.current) {
        setCameraStarting(false);
      }
    }
  }, [stopCamera]);

  React.useEffect(() => {
    void startCamera();
    return stopCamera;
  }, [startCamera, stopCamera]);

  const captureAndRecognize = React.useCallback((): void => {
    const video = videoRef.current;
    if (
      !video ||
      !cameraReady ||
      isProcessing ||
      video.videoWidth <= 0 ||
      video.videoHeight <= 0
    ) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Không chụp được hình từ máy ảnh.");
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCameraError("Không tạo được ảnh từ máy ảnh.");
          return;
        }
        const file = new File([blob], `camera-${Date.now()}.jpg`, { type: "image/jpeg" });
        onFileSelected(file);
        onRecognize(file);
      },
      "image/jpeg",
      0.92,
    );
  }, [cameraReady, isProcessing, onFileSelected, onRecognize]);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const canCapture = !imageUrl || allowEnterRetake;
      if (!canCapture || event.key !== "Enter" || event.repeat || isInteractiveTarget(event.target)) {
        return;
      }
      event.preventDefault();
      captureAndRecognize();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allowEnterRetake, captureAndRecognize, imageUrl]);

  const handleUpload = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) {
      onFileSelected(file);
      onRecognize(file);
    }
    event.currentTarget.value = "";
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">
            {imageUrl ? "Ảnh vừa chụp" : "Máy ảnh"}
          </h2>
          <p className="text-xs text-slate-500">
            {imageUrl
              ? allowEnterRetake
                ? "Nhấn phím xác nhận (↵) trên bàn phím số để chụp lại."
                : "Nhập số lượng ở khung bên phải."
              : "Nhấn phím xác nhận (↵) trên bàn phím số để chụp."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {imageUrl ? (
            <Button variant="outline" disabled={isProcessing || !cameraReady} onClick={captureAndRecognize}>
              <RotateCcw className="h-4 w-4" />
              Chụp lại
            </Button>
          ) : (
            <>
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleUpload}
              />
              <Button
                variant="outline"
                size="icon"
                aria-label="Chọn ảnh có sẵn"
                title="Chọn ảnh có sẵn"
                disabled={isProcessing}
                onClick={() => uploadInputRef.current?.click()}
              >
                <ImageUp className="h-4 w-4" />
              </Button>
              {cameraReady ? (
                <Button disabled={isProcessing} onClick={captureAndRecognize}>
                  {isProcessing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                  {isProcessing ? "Đang xử lý..." : "Chụp"}
                </Button>
              ) : (
                <Button disabled={cameraStarting} onClick={() => void startCamera()}>
                  {cameraStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
                  {cameraStarting ? "Đang mở máy ảnh..." : "Bật máy ảnh"}
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-white">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className={cameraReady && !imageUrl ? "h-full min-h-[32rem] w-full bg-white object-contain" : "hidden"}
        />
        {imageUrl ? (
          <div className="h-full min-h-[32rem] overflow-auto bg-white">
            <ImageOverlay
              imageUrl={imageUrl}
              detections={detections}
              selectedDetectionId={selectedDetectionId}
              onSelectDetection={onSelectDetection}
            />
          </div>
        ) : !cameraReady ? (
          <div className="flex h-full min-h-[32rem] flex-col items-center justify-center bg-slate-50 text-center">
            <VideoOff className="h-10 w-10 text-slate-400" />
            <p className="mt-3 text-sm font-medium text-slate-700">
              {cameraStarting ? "Đang kết nối máy ảnh..." : cameraError ?? "Máy ảnh chưa sẵn sàng"}
            </p>
          </div>
        ) : null}
        {isProcessing && imageUrl ? (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/40 text-white">
            <div className="flex items-center gap-3 rounded-lg bg-slate-950/80 px-4 py-3 text-sm font-medium">
              <Loader2 className="h-5 w-5 animate-spin" />
              Đang nhận diện sản phẩm...
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
};
