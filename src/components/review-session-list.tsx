import { Select, Table } from "antd";
import type { TableProps } from "antd";
import { Eye, ScanLine } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ManagementPage } from "@/components/management-page";
import { ManagementFilters, ManagementFilterField } from "@/components/management-filters";
import { ManagementPagination } from "@/components/management-pagination";
import { getPaginationBounds } from "@/lib/management-list";
import { DEFAULT_SESSION_FILTERS, filterReviewSessions } from "@/lib/review-session-filters";
import type { ReviewSessionFilters } from "@/lib/review-session-filters";
import type { RecognitionSessionSummary } from "@/types/api";
import { TableActionMenu } from "@/components/table-action-menu";
import { ReviewSessionPreview } from "@/components/review-session-preview";

export interface ReviewSessionListState {
  filters: ReviewSessionFilters;
  page: number;
  pageSize: number;
}

interface ReviewSessionListProps {
  apiBaseUrl: string;
  sessions: RecognitionSessionSummary[];
  loading: boolean;
  error?: string | null;
  notice?: string | null;
  state: ReviewSessionListState;
  onChange: (state: ReviewSessionListState) => void;
  onOpen: (id: number) => void;
  onAddMissingBox: (id: number) => void;
}

const statusLabels: Record<string, string> = {
  open: "Đang mở", reviewed: "Đã xử lý", closed: "Đã đóng",
};

export function ReviewSessionList({ apiBaseUrl, sessions, loading, error, notice, state, onChange, onOpen, onAddMissingBox }: ReviewSessionListProps) {
  const { filters, page, pageSize } = state;
  const visible = filterReviewSessions(sessions, filters);
  const bounds = getPaginationBounds(visible.length, page, pageSize);
  const active = Object.entries(filters).some(([key, value]) => value !== DEFAULT_SESSION_FILTERS[key as keyof ReviewSessionFilters]);
  const changeFilters = (patch: Partial<ReviewSessionFilters>) => onChange({ ...state, page: 1, filters: { ...filters, ...patch } });
  const columns: TableProps<RecognitionSessionSummary>["columns"] = [
    { title: "Phiên", dataIndex: "id", width: 120, render: (id: number) => <ReviewSessionPreview apiBaseUrl={apiBaseUrl} sessionId={id} /> },
    { title: "Thời gian tạo", dataIndex: "created_at", render: (value: string) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? "Chưa xác định" : date.toLocaleString("vi-VN", {
        hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric",
      });
    } },
    { title: "Trạng thái", dataIndex: "status", width: 150, render: (status: string, session) => (
      <Badge style={{ whiteSpace: "normal" }} variant={(session.pending_count ?? 0) > 0 ? "warning" : (session.detection_count ?? 0) > 0 ? "success" : "secondary"}>
        {status === "open" && session.pending_count === 0 ? "Lỗi nhận dạng" : statusLabels[status] ?? "Chưa xác định"}
      </Badge>
    ) },
    { title: "Chờ xử lý", dataIndex: "pending_count", width: 120, align: "right", render: (count?: number) => (
      <span className="management-number">{(count ?? 0).toLocaleString("vi-VN")}</span>
    ) },
    { title: "Thao tác", key: "actions", width: 100, align: "right", render: (_, session) => (
      <TableActionMenu label={`Thao tác phiên ${session.id}`} actions={[
        { key: "open", label: "Mở phiên", icon: <Eye size={16} aria-hidden="true" />, onSelect: () => onOpen(session.id) },
        { key: "missing-box", label: "Bổ sung vùng", icon: <ScanLine size={16} aria-hidden="true" />, onSelect: () => onAddMissingBox(session.id) },
      ]} />
    ) },
  ];

  return (
    <ManagementPage
      title="Quản lý phiên"
      description={`Theo dõi các phiên nhận diện và xử lý những vật thể cần rà soát.${sessions.length >= 1000 ? " Phạm vi: 1.000 phiên gần nhất." : ""}`}
      actions={null}
      notice={notice}
      error={error}
      filters={
        <ManagementFilters search={filters.search} onSearchChange={(search) => changeFilters({ search })}
          placeholder="Tìm số phiên, ví dụ 53" active={active}
          onReset={() => onChange({ ...state, page: 1, filters: DEFAULT_SESSION_FILTERS })}>
          <ManagementFilterField label="Trạng thái">
            <Select aria-label="Lọc trạng thái phiên" value={filters.status}
              onChange={(status) => changeFilters({ status })}
              options={[{ value: "all", label: "Tất cả" }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} />
          </ManagementFilterField>
          <ManagementFilterField label="Chờ xử lý">
            <Select aria-label="Lọc công việc còn lại" value={filters.pending}
              onChange={(pending) => changeFilters({ pending })}
              options={[{ value: "all", label: "Tất cả" }, { value: "pending", label: "Còn chờ xử lý" }, { value: "clear", label: "Không còn chờ xử lý" }]} />
          </ManagementFilterField>
          <ManagementFilterField label="Thời gian tạo">
            <Select aria-label="Lọc thời gian tạo phiên" value={filters.period}
              onChange={(period) => changeFilters({ period })}
              options={[{ value: "all", label: "Tất cả" }, { value: "today", label: "Hôm nay" }, { value: "7-days", label: "7 ngày gần đây" }, { value: "30-days", label: "30 ngày gần đây" }]} />
          </ManagementFilterField>
        </ManagementFilters>
      }
      summary={<span><strong>{visible.length.toLocaleString("vi-VN")}</strong> phiên</span>}
      pagination={<ManagementPagination total={visible.length} page={bounds.page} pageSize={pageSize}
        onChange={(nextPage, nextSize) => onChange({ ...state, page: nextSize === pageSize ? nextPage : 1, pageSize: nextSize })} />}
    >
      <Table<RecognitionSessionSummary> className="management-table" size="small" pagination={false}
        rowKey="id" scroll={{ x: 680 }} loading={loading} columns={columns}
        dataSource={visible.slice(bounds.start === 0 ? 0 : bounds.start - 1, bounds.end)}
        locale={{ emptyText: active ? "Không có phiên phù hợp với bộ lọc." : "Chưa có phiên nhận diện." }} />
    </ManagementPage>
  );
}
