export function validateScannerImage(file: Pick<File, "type" | "size">): string | null {
  if (file.size <= 0) return "Tệp ảnh đang trống. Hãy chọn một ảnh khác.";
  // The API accepts an omitted MIME type and has no configured image size ceiling.
  if (file.type && !file.type.startsWith("image/")) return "Tệp đã chọn không phải ảnh. Hãy chọn một tệp ảnh.";
  return null;
}

export function scannerCameraError(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Chưa được cấp quyền dùng máy ảnh. Hãy cho phép trình duyệt sử dụng máy ảnh rồi mở lại.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "Không tìm thấy máy ảnh. Hãy kết nối thiết bị hoặc tải ảnh lên.";
  if (name === "NotReadableError" || name === "TrackStartError") return "Máy ảnh đang bận hoặc không truy cập được. Hãy đóng ứng dụng đang dùng máy ảnh rồi thử lại.";
  return "Không mở được máy ảnh. Hãy kiểm tra kết nối và thử lại hoặc tải ảnh lên.";
}

export function captureScannerImage(video: HTMLVideoElement): Promise<File> {
  return new Promise((resolve, reject) => {
    if (video.videoWidth <= 0 || video.videoHeight <= 0) {
      reject(new Error("Máy ảnh chưa có hình. Vui lòng đợi rồi chụp lại."));
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      reject(new Error("Không chụp được hình từ máy ảnh."));
      return;
    }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob((blob) => {
      if (!blob || blob.size === 0) {
        reject(new Error("Không tạo được ảnh từ máy ảnh. Hãy thử chụp lại."));
        return;
      }
      resolve(new File([blob], `anh-chup-${Date.now()}.jpg`, { type: "image/jpeg" }));
    }, "image/jpeg", 0.92);
  });
}
