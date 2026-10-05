import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CatalogStatusValue,
  CreatePackageInput,
  PackageDetail,
  PackageSummary,
  UpdatePackageInput,
} from "@glampro/shared";

import { queryKeys } from "@/constants/queryKeys";
import { get, getPaginated, patch, post } from "@/lib/api";

export interface PackageListFilters {
  page: number;
  pageSize: number;
  search?: string;
  status?: CatalogStatusValue;
}

/**
 * One page of packages — handoff screen 08's third tab.
 *
 * `?departmentId=` and `?lowStock=` are not sent, and the API ignores them rather
 * than rejecting them, so all four tabs can share one toolbar and one query string.
 * A bundle has no branch and no stock to filter on.
 */
export function usePackageList(filters: PackageListFilters) {
  return useQuery({
    queryKey: [...queryKeys.packages.list(), filters],
    queryFn: () =>
      getPaginated<PackageSummary>("/packages", {
        page: filters.page,
        pageSize: filters.pageSize,
        search: filters.search || undefined,
        status: filters.status || undefined,
      }),
    placeholderData: (previous) => previous,
  });
}

/** One bundle, for the editor's second read. */
export function usePackage(id: string | null) {
  return useQuery({
    queryKey: queryKeys.packages.detail(id ?? ""),
    queryFn: () => get<PackageDetail>(`/packages/${id}`),
    enabled: id !== null,
  });
}

export function useCreatePackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreatePackageInput) => post<PackageDetail>("/packages", input),
    onSuccess: () => {
      invalidatePackages(queryClient);
    },
  });
}

export function useUpdatePackage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdatePackageInput }) =>
      patch<PackageDetail>(`/packages/${id}`, input),
    onSuccess: (_bundle, variables) => {
      invalidatePackages(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.packages.detail(variables.id) });
    },
  });
}

function invalidatePackages(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.packages.list() });
}
