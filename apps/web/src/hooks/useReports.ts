/** Screen 10's range report — one request so every table shares one period. */
import { useQuery } from "@tanstack/react-query";
import type { ReportOverview } from "@glampro/shared";

import { queryKeys } from "@/constants/queryKeys";
import { get } from "@/lib/api";

export interface ReportRange {
  from: string;
  to: string;
  timeZone: string;
}

export function useReportOverview(range: ReportRange) {
  return useQuery({
    queryKey: [...queryKeys.reports.overview(), range],
    queryFn: () =>
      get<ReportOverview>("/reports/overview", {
        from: range.from,
        to: range.to,
        timeZone: range.timeZone,
      }),
    staleTime: 60_000,
  });
}
