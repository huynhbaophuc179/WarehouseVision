import { BackButton } from "@/components/ui/back-button";
import { Camera, ImageUp, LoaderCircle } from "lucide-react";
import { forwardRef, useImperativeHandle, useRef, useState, type ChangeEvent } from "react";
import { ScannerActionButton } from "./scanner-action-button";
import { useScannerCamera } from "@/hooks/use-scanner-camera";
import { validateScannerImage } from "@/lib/scanner-image";
import "@/styles/scanner-capture.css";

export interface ScannerCaptureHandle {
  capture: () => void;
  openUpload: () => void;
  retryCamera: () => void;
}

export interface LiveScannerProps {
  imageUrl: string | null;
  isProcessing: boolean;
  onFileSelected: (file: File) => void;
  onRecognize: (file: File) => void;
  onAnalyze: () => void;
  onReset: () => void;
  errorMessage?: string | null;
}

export const LiveScanner = forwardRef<ScannerCaptureHandle, LiveScannerProps>(function LiveScanner(
  { imageUrl, isProcessing, onFileSelected, onRecognize, onAnalyze, onReset, errorMessage }, ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const camera = useScannerCamera(!imageUrl && !isProcessing, (file) => {
    setUploadError(null);
    onFileSelected(file);
    onRecognize(file);
  });
  const openUpload = (): void => {
    if (!isProcessing && !camera.capturing) inputRef.current?.click();
  };
  useImperativeHandle(ref, () => ({ capture: camera.capture, openUpload, retryCamera: camera.retry }));

  const handleUpload = (event: ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || isProcessing) return;
    const error = validateScannerImage(file);
    setUploadError(error);
    if (error) return;
    camera.stop();
    setFailedImageUrl(null);
    try {
      onFileSelected(file);
    } catch {
      setUploadError("Không mở được ảnh. Hãy chọn lại tệp hoặc thử ảnh khác.");
      camera.retry();
    }
  };
  const reset = (): void => {
    if (isProcessing) return;
    camera.stop();
    setUploadError(null);
    setFailedImageUrl(null);
    onReset();
  };
  const previewFailed = Boolean(imageUrl && failedImageUrl === imageUrl);
  const error = uploadError || errorMessage || (previewFailed ? "Không hiển thị được ảnh. Hãy chọn một tệp ảnh khác." : null)
    || (!imageUrl ? camera.error : null);

  return (
    <section className="scanner-capture" aria-label="Chụp hoặc tải ảnh sản phẩm" aria-busy={isProcessing}>
      <header className="scanner-capture__header">
        <h2>{isProcessing ? "Đang phân tích ảnh" : imageUrl ? "Kiểm tra ảnh" : "Chụp ảnh sản phẩm"}</h2>
      </header>
      <div className="scanner-capture__stage">
        {imageUrl ? (
          <img src={imageUrl} alt="Ảnh sản phẩm chờ rà soát" onError={() => setFailedImageUrl(imageUrl)} />
        ) : (
          <>
            <video ref={camera.videoRef} autoPlay playsInline muted aria-label="Hình ảnh trực tiếp từ máy ảnh" />
            {!camera.ready && <div className="scanner-capture__placeholder" role="status">
              <Camera size={48} aria-hidden="true" />
              <strong>{camera.starting ? "Đang mở máy ảnh…" : "Máy ảnh chưa sẵn sàng"}</strong>
              <span>{camera.starting ? "Cho phép trình duyệt sử dụng máy ảnh khi được hỏi." : "Bạn có thể mở lại máy ảnh hoặc chọn ảnh có sẵn."}</span>
            </div>}
            {camera.ready && <div className="scanner-capture__guide" aria-hidden="true" />}
          </>
        )}
        {isProcessing && <div className="scanner-capture__processing" role="status">
          <span className="scanner-capture__scanline" aria-hidden="true" />
          <LoaderCircle className="scanner-capture__spinner" size={40} aria-hidden="true" />
          <strong>Đang tìm sản phẩm trong ảnh…</strong>
        </div>}
      </div>
      {error && <p className="scanner-capture__error" role="alert">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={handleUpload} aria-label="Chọn tệp ảnh sản phẩm" />
      {imageUrl ? (
        <div className="scanner-capture__actions scanner-capture__actions--preview">
          <BackButton disabled={isProcessing} onClick={reset} aria-keyshortcuts="0" />
          <ScannerActionButton shortcut="↵" tier="primary" disabled={isProcessing || previewFailed} onClick={onAnalyze} aria-keyshortcuts="Enter">
            {isProcessing ? "Đang phân tích…" : "Phân tích ảnh"}
          </ScannerActionButton>
        </div>
      ) : (
        <div className="scanner-capture__actions">
          <ScannerActionButton shortcut="1" tier="secondary" disabled={isProcessing || camera.capturing} onClick={openUpload} aria-keyshortcuts="1"><ImageUp size={22} aria-hidden="true" /> Tải ảnh lên</ScannerActionButton>
          <ScannerActionButton shortcut="2" disabled={isProcessing || camera.starting || camera.capturing} onClick={camera.retry} aria-keyshortcuts="2">Mở lại máy ảnh</ScannerActionButton>
          <ScannerActionButton shortcut="↵" tier="primary" disabled={!camera.ready || isProcessing || camera.capturing} onClick={camera.capture} aria-keyshortcuts="Enter">{camera.capturing ? "Đang chụp…" : "Chụp và phân tích"}</ScannerActionButton>
        </div>
      )}
    </section>
  );
});
