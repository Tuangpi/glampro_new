/**
 * Dashboard data — handoff screen 05 (`GET /api/reports/dashboard`).
 *
 * One hook for one request: the four tiles are answered together so they share
 * one window and can never be observed a moment apart (see `report.ts`). The
 * window itself is **the browser's day**, sent as instants — the salon's
 * timezone lives in the clock in front of the screen, and asking the server to
 * guess it would put "today" somewhere the salon is not.
 *
 * The window key is stable across renders because both edges are derived from
 * calendar midnight rather than from `Date.now()`, so a dashboard that re-renders
 * does not refetch itself; only the day turning over changes the key, which is
 * exactly when the answer would change.
 */
import { useQuery } from "@tanstack/react-query";
import type { DashboardSummary } from "@glampro/shared";

import { queryKeys } from "@/constants/queryKeys";
import { get } from "@/lib/api";

/** The day's edges as instants: midnight to the last millisecond, local time. */
export function todayWindow(): { from: string; to: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

export function useDashboardSummary() {
  const window = todayWindow();

  return useQuery({
    queryKey: [...queryKeys.dashboard.summary(), window],
    queryFn: () => get<DashboardSummary>("/reports/dashboard", window),
    // The tiles are live numbers a salon glances at; a minute's staleness is
    // the right horizon — long enough that a dashboard left open does not hammer
    // the API, short enough that "today's income" is still today's.
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
