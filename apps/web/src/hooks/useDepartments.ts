import { useQuery } from "@tanstack/react-query";
import type { DepartmentSummary } from "@glampro/shared";

import { queryKeys } from "@/constants/queryKeys";
import { get } from "@/lib/api";

/**
 * Every branch in the salon, for the catalogue and staff form pickers.
 *
 * Cached for five minutes rather than refetched per mount: a branch is created at
 * onboarding and then barely ever, so a picker that went blank between two forms
 * would cost a round trip to learn nothing. `listDepartments` is deliberately not
 * paginated — a salon has a handful of branches, not a page of them.
 */
export function useDepartments() {
  return useQuery({
    queryKey: queryKeys.departments.list(),
    queryFn: () => get<DepartmentSummary[]>("/departments"),
    staleTime: 5 * 60 * 1000,
  });
}
