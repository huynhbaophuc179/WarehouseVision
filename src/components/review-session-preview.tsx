import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button, Popover } from "antd";
import { ImageIcon, ImageOff, Loader2 } from "lucide-react";
import { fetchReviewSession } from "@/lib/api";

interface ReviewSessionPreviewProps {
  apiBaseUrl: string;
  sessionId: number;
}

export function ReviewSessionPreview({ apiBaseUrl, sessionId }: ReviewSessionPreviewProps) {
  const [open, setOpen] = useState(false);
  const [failedImage, setFailedImage] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const preview = useQuery({
    queryKey: ["review-session", apiBaseUrl, sessionId],
    queryFn: () => fetchReviewSession(apiBaseUrl, sessionId),
    enabled: open,
    staleTime: 30_000,
    retry: false,
  });
  const image = preview.data?.original_image_base64;
  const mimeType = preview.data?.preview_image_mime_type ?? preview.data?.original_image_mime_type ?? "image/jpeg";
  const content = (
    <div ref={contentRef} style={{ width: "min(320px, calc(100vw - 48px))" }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== triggerRef.current) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          triggerRef.current?.focus();
          setOpen(false);
        }
      }}>
      {image && image !== failedImage ? (
        <img src={`data:${mimeType};base64,${image}`} alt={`Ảnh phiên ${sessionId}`}
          onError={() => setFailedImage(image)}
          className="block w-full rounded-md bg-subtle object-contain"
          style={{ maxHeight: "min(360px, 60vh)" }} />
      ) : preview.isFetching ? (
        <div role="status" className="flex h-48 items-center justify-center gap-2 text-muted">
          <Loader2 size={18} className="animate-spin" aria-hidden="true" /> Đang tải ảnh…
        </div>
      ) : preview.isError || image ? (
        <div className="flex h-48 flex-col items-center justify-center gap-3">
          <p role="alert" className="text-muted">Không tải được ảnh phiên.</p>
          <Button onClick={() => { setFailedImage(null); void preview.refetch(); }}>Thử lại</Button>
        </div>
      ) : (
        <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted">
          <ImageOff size={24} aria-hidden="true" /> Phiên này không có ảnh.
        </div>
      )}
    </div>
  );

  return (
    <Popover title={`Ảnh phiên #${sessionId}`} content={content} placement="top"
      trigger={["hover", "click"]} mouseEnterDelay={0.2} mouseLeaveDelay={0.15}
      open={open} onOpenChange={setOpen} destroyOnHidden>
      <button ref={triggerRef} type="button" className="management-cell-name inline-flex items-center gap-1.5 whitespace-nowrap"
        aria-label={`Xem ảnh phiên ${sessionId}`} aria-expanded={open}
        onFocus={(event) => { if (event.currentTarget.matches(":focus-visible")) setOpen(true); }}
        onBlur={(event) => { if (!contentRef.current?.contains(event.relatedTarget)) setOpen(false); }}
        onKeyDown={(event) => { if (event.key === "Escape") setOpen(false); }}>
        <ImageIcon size={16} className="text-muted" aria-hidden="true" />
        <span>#{sessionId}</span>
      </button>
    </Popover>
  );
}
