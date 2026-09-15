import assert from "node:assert/strict";
import test from "node:test";
import type { RecognitionSessionSummary } from "../types/api.ts";
import {
  DEFAULT_SESSION_FILTERS,
  filterReviewSessions,
  type ReviewSessionFilters,
} from "./review-session-filters.ts";
import { getPaginationBounds } from "./management-list.ts";

const now = new Date(2026, 8, 16, 12);
const session = (
  id: number,
  overrides: Partial<RecognitionSessionSummary> = {},
): RecognitionSessionSummary => ({
  id,
  original_image_path: "",
  status: "open",
  mode: "inbound",
  model_version: "warehouse",
  created_at: now.toISOString(),
  ...overrides,
});
const apply = (
  sessions: RecognitionSessionSummary[],
  filters: Partial<ReviewSessionFilters> = {},
  currentTime = now,
) => filterReviewSessions(sessions, { ...DEFAULT_SESSION_FILTERS, ...filters }, currentTime);
const ids = (sessions: RecognitionSessionSummary[]) => sessions.map(({ id }) => id);

test("tìm chính xác số phiên, chấp nhận dấu # và khoảng trắng ngoài", () => {
  const sessions = [session(53), session(153), session(5)];
  for (const search of ["53", " #53 \n", " 53 ", "0053"]) {
    assert.deepEqual(ids(apply(sessions, { search })), [53]);
  }
  assert.deepEqual(apply(sessions, { search: " \t " }), sessions);
});

test("chuỗi không phải số phiên không tìm qua trạng thái, chế độ hoặc mô hình", () => {
  const sessions = [session(53)];
  for (const search of ["open", "inbound", "warehouse", "#", "##53", "5 3", "53x", "5.3", "5e1", "-53"]) {
    assert.deepEqual(apply(sessions, { search }), [], search);
  }
});

test("kết hợp tất cả điều kiện bằng AND và giữ nguyên dữ liệu nguồn", () => {
  const sessions = [
    session(53, { status: "reviewed", pending_count: 2 }),
    session(54, { status: "reviewed", pending_count: 1 }),
    session(55, { status: "closed", pending_count: 0 }),
  ];
  const original = structuredClone(sessions);
  const filters = { search: "#53", status: "reviewed", pending: "pending", period: "today" } as const;
  assert.deepEqual(ids(apply(sessions, filters)), [53]);
  assert.deepEqual(apply(sessions, { ...filters, pending: "clear" }), []);
  assert.deepEqual(apply(sessions, { ...filters, status: "open" }), []);
  assert.deepEqual(ids(apply(sessions, { status: "closed" })), [55]);
  assert.deepEqual(sessions, original);
});

test("số chờ xử lý bị thiếu tính là 0", () => {
  const sessions = [session(1), session(2, { pending_count: 0 }), session(3, { pending_count: 2 })];
  assert.deepEqual(ids(apply(sessions, { pending: "clear" })), [1, 2]);
  assert.deepEqual(ids(apply(sessions, { pending: "pending" })), [3]);
});

test("hôm nay dùng nửa đêm địa phương và bao gồm toàn bộ ngày", () => {
  const midnight = new Date(2026, 8, 16).getTime();
  const tomorrow = new Date(2026, 8, 17).getTime();
  const sessions = [midnight - 1, midnight, tomorrow - 1, tomorrow].map((time, index) =>
    session(index + 1, { created_at: new Date(time).toISOString() }),
  );
  assert.deepEqual(ids(apply(sessions, { period: "today" })), [2, 3]);
});

for (const [period, days] of [["7-days", 7], ["30-days", 30]] as const) {
  test(`${days} ngày gồm hôm nay, loại thời điểm trước biên đầu ngày`, () => {
    const firstDay = new Date(2026, 8, 16 - days + 1).getTime();
    const sessions = [firstDay - 1, firstDay, now.getTime()].map((time, index) =>
      session(index + 1, { created_at: new Date(time).toISOString() }),
    );
    assert.deepEqual(ids(apply(sessions, { period })), [2, 3]);
  });
}

test("khoảng ngày vẫn theo lịch khi múi giờ có chuyển giờ mùa hè", () => {
  const currentTime = new Date(2026, 2, 10, 12);
  const firstDay = new Date(2026, 2, 4).getTime();
  const sessions = [firstDay - 1, firstDay].map((time, index) =>
    session(index + 1, { created_at: new Date(time).toISOString() }),
  );
  assert.deepEqual(ids(apply(sessions, { period: "7-days" }, currentTime)), [2]);
});

test("ngày sai và ngày tương lai chỉ bị loại khi bật lọc thời gian", () => {
  const sessions = [
    session(1, { created_at: "không hợp lệ" }),
    session(2, { created_at: new Date(2026, 8, 17).toISOString() }),
    session(3),
  ];
  assert.deepEqual(apply(sessions), sessions);
  for (const period of ["today", "7-days", "30-days"] as const) {
    assert.deepEqual(ids(apply(sessions, { period })), [3]);
  }
});

test("kết quả lọc hẹp từ trang sau vẫn có phạm vi trang hợp lệ, kể cả rỗng", () => {
  const sessions = Array.from({ length: 45 }, (_, index) => session(index + 1));
  const filtered = apply(sessions, { search: "#45" });
  const bounds = getPaginationBounds(filtered.length, 3, 20);
  assert.deepEqual(bounds, { page: 1, pageCount: 1, start: 1, end: 1 });
  assert.deepEqual(ids(filtered.slice(bounds.start - 1, bounds.end)), [45]);
  assert.deepEqual(getPaginationBounds(apply(sessions, { search: "999" }).length, 3, 20), {
    page: 1, pageCount: 1, start: 0, end: 0,
  });
  assert.deepEqual(apply([], { period: "today" }), []);
});
