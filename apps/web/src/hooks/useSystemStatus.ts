import { useQuery } from "@tanstack/react-query";

import { get } from "@/lib/api";
import { queryKeys } from "@/constants/queryKeys";

export interface SystemStatus {
  status: string;
  app: string;
  environment: string;
  uptimeSeconds: number;
  database: "up" | "down";
}

/**
 * Backend readiness, straight from `GET /api/health`.
 *
 * Used by the dashboard's system-status card — the quickest way to confirm that
 * the web app, the API and PostgreSQL are all wired together.
 */
export function useSystemStatus() {
  return useQuery({
    queryKey: queryKeys.health.status(),
    queryFn: () => get<SystemStatus>("/health"),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
