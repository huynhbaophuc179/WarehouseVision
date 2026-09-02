import { Camera, ImageUp, Loader2, Video, VideoOff } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";

export interface CameraImageCaptureProps {
  disabled?: boolean;
  onCapture: (file: File) => void;
  onFilesSelected: (files: File[]) => void;
}

const cameraErrorMessage = (error: unknown): string => {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Chưa được cấp quyền camera. Hãy cho phép trình duyệt sử dụng camera.";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") {
    return "Không tìm thấy camera trên máy tính.";
  }
  return "Không mở được camera. Hãy kiểm tra kết nối camera và thử lại.";
};

export const CameraImageCapture = ({
  disabled = false,
  onCapture,
  onFilesSelected,
}: CameraImageCaptureProps): JSX.Element => {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const requestRef = React.useRef(0);
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const [cameraReady, setCameraReady] = React.useState(false);
  const [cameraStarting, setCameraStarting] = React.useState(false);
  const [cameraError, setCameraError] = React.useState<string | null>(null);
  const [capturing, setCapturing] = React.useState(false);

  const stopCamera = React.useCallback((): void => {
    requestRef.current += 1;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
    setCameraStarting(false);
  }, []);

  const closeCamera = React.useCallback((): void => {
    stopCamera();
    setCameraOpen(false);
    setCameraError(null);
  }, [stopCamera]);

  const startCamera = React.useCallback(async (): Promise<void> => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Trình duyệt này không hỗ trợ camera trực tiếp.");
      setCameraOpen(true);
      return;
    }
    stopCamera();
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setCameraOpen(true);
    setCameraStarting(true);
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      if (requestId !== requestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (requestId !== requestRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      } else {
        throw new Error("Không tạo được khung camera.");
      }
      setCameraReady(true);
    } catch (error) {
      if (requestId === requestRef.current) {
        setCameraError(cameraErrorMessage(error));
      }
    } finally {
      if (requestId === requestRef.current) {
        setCameraStarting(false);
      }
    }
  }, [stopCamera]);

  React.useEffect(() => stopCamera, [stopCamera]);

  const captureImage = (): void => {
    const video = videoRef.current;
    if (!video || !cameraReady || capturing || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      setCameraError("Không chụp được ảnh từ camera.");
      return;
    }
    setCapturing(true);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(
      (blob) => {
        setCapturing(false);
        if (!blob) {
          setCameraError("Không tạo được ảnh từ camera.");
          return;
        }
        onCapture(new File([blob], `linh-kien-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <div className="space-y-3">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        disabled={disabled}
        onChange={(event) => {
          onFilesSelected(Array.from(event.target.files ?? []));
          event.currentTarget.value = "";
        }}
      />
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" disabled={disabled || cameraStarting} onClick={() => void startCamera()}>
          {cameraStarting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          {cameraStarting ? "Đang mở camera..." : cameraOpen ? "Mở lại camera" : "Chụp bằng camera"}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageUp className="h-4 w-4" />
          Chọn ảnh có sẵn
        </Button>
      </div>

      {cameraOpen ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
          <div className="relative flex min-h-[26rem] items-center justify-center md:min-h-[34rem]">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className={cameraReady ? "min-h-[26rem] max-h-[70vh] w-full bg-white object-contain md:min-h-[34rem]" : "hidden"}
            />
            {!cameraReady ? (
              <div className="flex min-h-[26rem] flex-col items-center justify-center px-6 text-center text-slate-500 md:min-h-[34rem]">
                {cameraStarting ? (
                  <Loader2 className="h-8 w-8 animate-spin" />
                ) : (
                  <VideoOff className="h-8 w-8" />
                )}
                <p className="mt-3 text-sm">
                  {cameraStarting ? "Đang kết nối camera..." : cameraError ?? "Camera chưa sẵn sàng."}
                </p>
              </div>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white p-3">
            <p className="flex items-center gap-2 text-xs text-slate-600">
              <Video className="h-4 w-4" />
              {cameraReady ? "Đặt linh kiện vào giữa khung hình." : "Chờ camera sẵn sàng."}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={closeCamera}>
                Đóng
              </Button>
              <Button type="button" size="sm" disabled={!cameraReady || capturing || disabled} onClick={captureImage}>
                {capturing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
                {capturing ? "Đang chụp..." : "Chụp ảnh"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {cameraError && cameraOpen && cameraReady ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {cameraError}
        </div>
      ) : null}
    </div>
  );
};
