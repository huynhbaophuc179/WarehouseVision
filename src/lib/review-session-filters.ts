import type { RecognitionSessionSummary } from "../types/api";

export interface ReviewSessionFilters {
  search: string;
  status: "all" | "open" | "reviewed" | "closed";
  pending: "all" | "pending" | "clear";
  period: "all" | "today" | "7-days" | "30-days";
}

export const DEFAULT_SESSION_FILTERS: ReviewSessionFilters = {
  search: "",
  status: "all",
  pending: "all",
  period: "all",
};

export function filterReviewSessions(
  sessions: RecognitionSessionSummary[],
  filters: ReviewSessionFilters,
  now: Date = new Date(),
): RecognitionSessionSummary[] {
  const search = filters.search.trim();
  if (search && !/^#?\d+$/.test(search)) return [];
  const sessionId = search ? Number(search.replace(/^#/, "")) : null;

  const firstDay = new Date(now);
  firstDay.setHours(0, 0, 0, 0);
  const nextDay = new Date(firstDay);
  nextDay.setDate(nextDay.getDate() + 1);
  if (filters.period === "7-days") firstDay.setDate(firstDay.getDate() - 6);
  if (filters.period === "30-days") firstDay.setDate(firstDay.getDate() - 29);

  return sessions.filter((session) => {
    if (sessionId !== null && session.id !== sessionId) return false;
    if (filters.status !== "all" && session.status !== filters.status) return false;
    const pendingCount = session.pending_count ?? 0;
    if (filters.pending === "pending" && pendingCount <= 0) return false;
    if (filters.pending === "clear" && pendingCount !== 0) return false;
    if (filters.period !== "all") {
      const createdAt = new Date(session.created_at).getTime();
      if (!(createdAt >= firstDay.getTime() && createdAt < nextDay.getTime())) return false;
    }
    return true;
  });
}
