import type { DetectionDecision, RecognitionStatus } from "@/types/api";

export const formatPercent = (value?: number | null): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return `${Math.round(value * 100)}%`;
};

export const formatNumber = (value?: number | null, digits = 3): string => {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "-";
  }
  return value.toFixed(digits);
};

export const statusLabel = (status: RecognitionStatus): string => {
  if (status === "recognized") {
    return "Đã nhận diện";
  }
  if (status === "uncertain") {
    return "Cần kiểm tra";
  }
  return "Chưa xác định";
};

export const decisionLabel = (decision: DetectionDecision): string => {
  if (decision === "accepted") {
    return "Chấp nhận";
  }
  if (decision === "rejected") {
    return "Từ chối";
  }
  if (decision === "review") {
    return "Gửi rà soát";
  }
  if (decision === "corrected") {
    return "Đã chọn mã khác";
  }
  return "Chưa xác định";
};
