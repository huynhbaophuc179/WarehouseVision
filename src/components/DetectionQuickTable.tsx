import { ImageOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Table } from "antd";
import { cn } from "@/lib/utils";
import type {
  CandidateResponse,
  DetectionDecisionState,
  DetectionResult,
} from "@/types/api";

export interface DetectionQuickTableProps {
  detections: DetectionResult[];
  decisions: Record<string, DetectionDecisionState>;
  selectedDetectionId: string | null;
  onSelectDetection: (detectionId: string) => void;
}

const decisionLabel = (state?: DetectionDecisionState): string => {
  if (!state) {
    return "Chưa xác nhận";
  }
  if (state.decision === "accepted") {
    return "Đã chấp nhận";
  }
  if (state.decision === "corrected") {
    return "Đã chọn mã khác";
  }
  if (state.decision === "rejected") {
    return "Đã từ chối";
  }
  if (state.decision === "review") {
    return "Gửi rà soát";
  }
  return "Chưa xác định";
};

const decisionVariant = (
  state?: DetectionDecisionState,
): "success" | "warning" | "destructive" | "secondary" => {
  if (!state) {
    return "secondary";
  }
  if (state.decision === "accepted" || state.decision === "corrected") {
    return "success";
  }
  if (state.decision === "rejected") {
    return "destructive";
  }
  if (state.decision === "review" || state.decision === "unknown") {
    return "warning";
  }
  return "secondary";
};

const selectedCandidate = (
  detection: DetectionResult,
  state?: DetectionDecisionState,
): CandidateResponse | null =>
  detection.candidates.find(
    (candidate) => candidate.product_id === state?.selectedProductId,
  ) ??
  detection.candidates[0] ??
  null;

const detectedProductId = (
  detection: DetectionResult,
  state?: DetectionDecisionState,
): string =>
  state?.selectedProductId ??
  detection.product_id ??
  selectedCandidate(detection, state)?.product_id ??
  "-";

const detectedProductName = (
  detection: DetectionResult,
  state?: DetectionDecisionState,
): string =>
  detection.name ??
  selectedCandidate(detection, state)?.name ??
  selectedCandidate(detection, state)?.product_name ??
  "Chưa có tên";

export const DetectionQuickTable = ({
  detections,
  decisions,
  selectedDetectionId,
  onSelectDetection,
}: DetectionQuickTableProps): JSX.Element => (
  <div className="overflow-hidden rounded-lg border border-line">
    <div className="border-b border-line bg-subtle px-3 py-2">
      <p className="text-sm font-semibold text-content">Thông tin nhanh</p>
      <p className="text-xs text-muted">
        Xem ảnh cắt, mã hệ thống nhận diện và trạng thái xác nhận.
      </p>
    </div>
    <Table
      size="small"
      pagination={false}
      rowKey="key"
      scroll={{ x: 360 }}
      onRow={(record) => ({ onClick: () => onSelectDetection(record.key) })}
      rowClassName={(record) =>
        cn(
          "cursor-pointer",
          selectedDetectionId === record.key && "bg-inset",
        )
      }
      dataSource={detections.map((detection, index) => {
        const state = decisions[detection.detection_id];
        const cropSrc = detection.crop_preview_base64
          ? `data:image/jpeg;base64,${detection.crop_preview_base64}`
          : null;
        return {
          key: detection.detection_id,
          cell0: (
            <>
              <div className="relative h-11 w-11 overflow-hidden rounded-md border border-line bg-inset">
                {cropSrc ? (
                  <img
                    src={cropSrc}
                    alt={`Vùng ${index + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageOff className="h-4 w-4 text-faint" />
                  </div>
                )}
                <span className="absolute left-0.5 top-0.5 rounded bg-slate-950 px-1 text-[10px] font-bold text-white">
                  {index + 1}
                </span>
              </div>
            </>
          ),
          cell1: (
            <>
              <p className="truncate text-sm font-semibold text-content">
                {detectedProductId(detection, state)}
              </p>
              <p className="truncate text-xs text-muted">
                {detectedProductName(detection, state)}
              </p>
            </>
          ),
          cell2: (
            <>
              <Badge variant={decisionVariant(state)}>
                {decisionLabel(state)}
              </Badge>
            </>
          ),
        };
      })}
      columns={[
        { title: "Ảnh", dataIndex: "cell0", key: "cell0", width: 80 },
        { title: "Mã nhận diện", dataIndex: "cell1", key: "cell1" },
        { title: "Xác nhận", dataIndex: "cell2", key: "cell2", width: 150 },
      ]}
    />
  </div>
);
