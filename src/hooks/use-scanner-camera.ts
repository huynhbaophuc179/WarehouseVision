import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { captureScannerImage, scannerCameraError } from "@/lib/scanner-image";

export function useScannerCamera(enabled: boolean, onCapture: (file: File) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraRequestRef = useRef(0);
  const captureInFlightRef = useRef(false);
  const enabledRef = useRef(enabled);
  const onCaptureRef = useRef(onCapture);
  const cleanupListenersRef = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState(false);
  const [starting, setStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const release = useCallback((): void => {
    cameraRequestRef.current += 1;
    captureInFlightRef.current = false;
    cleanupListenersRef.current?.();
    cleanupListenersRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);
  const stop = useCallback((): void => {
    release();
    setReady(false);
    setStarting(false);
    setCapturing(false);
  }, [release]);
  const start = useCallback(async (): Promise<void> => {
    if (!enabledRef.current) return;
    stop();
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Trình duyệt chưa hỗ trợ máy ảnh tại địa chỉ này. Hãy dùng kết nối bảo mật hoặc tải ảnh lên.");
      return;
    }
    const requestId = cameraRequestRef.current;
    setStarting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
      });
      const video = videoRef.current;
      if (requestId !== cameraRequestRef.current || !enabledRef.current || !video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      video.srcObject = stream;
      const updateReady = (): void => {
        if (requestId !== cameraRequestRef.current || !enabledRef.current) return;
        const hasFrame = video.videoWidth > 0 && video.videoHeight > 0 && video.readyState >= 2;
        setReady(hasFrame);
        if (hasFrame) setStarting(false);
      };
      const ended = (): void => {
        if (requestId !== cameraRequestRef.current) return;
        stop();
        setError("Kết nối máy ảnh đã dừng. Hãy mở lại máy ảnh hoặc tải ảnh lên.");
      };
      video.addEventListener("loadeddata", updateReady);
      video.addEventListener("canplay", updateReady);
      stream.getVideoTracks().forEach((track) => track.addEventListener("ended", ended));
      cleanupListenersRef.current = () => {
        video.removeEventListener("loadeddata", updateReady);
        video.removeEventListener("canplay", updateReady);
        stream.getVideoTracks().forEach((track) => track.removeEventListener("ended", ended));
      };
      await video.play();
      if (requestId !== cameraRequestRef.current || !enabledRef.current) return;
      updateReady();
    } catch (cause) {
      if (requestId !== cameraRequestRef.current || !enabledRef.current) return;
      stop();
      setError(scannerCameraError(cause));
    }
  }, [stop]);

  useLayoutEffect(() => {
    enabledRef.current = enabled;
    onCaptureRef.current = onCapture;
  });
  useLayoutEffect(() => {
    if (enabled) void start();
    else stop();
    return () => { enabledRef.current = false; release(); };
  }, [enabled, release, start, stop]);

  const capture = useCallback((): void => {
    const video = videoRef.current;
    if (!enabledRef.current || !ready || captureInFlightRef.current || !video || video.readyState < 2) return;
    // Lock before canvas work; a second Enter can arrive before React commits busy state.
    captureInFlightRef.current = true;
    setCapturing(true);
    setError(null);
    const requestId = cameraRequestRef.current;
    void captureScannerImage(video).then((file) => {
      if (requestId !== cameraRequestRef.current || !enabledRef.current) return;
      onCaptureRef.current(file);
      // Keep the lock until the selected image disables this camera session.
    }).catch(() => {
      if (requestId !== cameraRequestRef.current || !enabledRef.current) return;
      captureInFlightRef.current = false;
      setCapturing(false);
      setError("Không chụp được ảnh. Hãy thử lại hoặc tải một ảnh có sẵn.");
    });
  }, [ready]);
  const retry = useCallback((): void => { void start(); }, [start]);
  return { videoRef, ready, starting, capturing, error, capture, retry, stop };
}
