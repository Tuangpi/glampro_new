import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CatalogStatusValue,
  CreateProductInput,
  ProductDetail,
  ProductSummary,
  UpdateProductInput,
} from "@glampro/shared";

import { queryKeys } from "@/constants/queryKeys";
import { get, getPaginated, patch, post } from "@/lib/api";

export interface ProductListFilters {
  page: number;
  pageSize: number;
  search?: string;
  status?: CatalogStatusValue;
  departmentId?: string;
  lowStock?: boolean;
}

/** The same filters minus paging, for the counts the stat tiles read. */
export interface ProductCountFilters {
  search?: string;
  status?: CatalogStatusValue;
  departmentId?: string;
  lowStock?: boolean;
  /** Overrides the tenant's own low-stock threshold. `0` means out of stock. */
  threshold?: number;
}

/**
 * One page of products.
 *
 * The filters object is the last element of the key, so `invalidateQueries` on
 * `queryKeys.products.list()` matches every page, every search term and every
 * filter — which is what a create or an edit needs, since it must refresh the list
 * the user is looking at even when they had filtered it.
 */
export function useProductList(filters: ProductListFilters) {
  return useQuery({
    queryKey: [...queryKeys.products.list(), filters],
    queryFn: () =>
      getPaginated<ProductSummary>("/products", {
        page: filters.page,
        pageSize: filters.pageSize,
        search: filters.search || undefined,
        status: filters.status || undefined,
        departmentId: filters.departmentId || undefined,
        // Left out rather than sent as `false`: the API's `lowStock` filter is
        // absent-or-on, and `false` would be a second way to say "no filter".
        lowStock: filters.lowStock ? true : undefined,
      }),
    placeholderData: (previous) => previous,
  });
}

/**
 * A count over the salon's **whole** catalogue rather than over a page of it.
 *
 * `pageSize: 1` because only `total` is read, and that is the point: the stat
 * tiles and the rail badge are aggregates the server owns, because one page of
 * rows in the browser can never answer "how many are low" (ADR 0010). The filters
 * are the last element of the key, so the badge and the Low-stock tile (both
 * `{ lowStock: true }`) ask one question and share one response.
 */
export function useProductCount(filters: ProductCountFilters = {}, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.products.count(), filters],
    queryFn: () =>
      getPaginated<ProductSummary>("/products", {
        search: filters.search || undefined,
        status: filters.status || undefined,
        departmentId: filters.departmentId || undefined,
        // Left out rather than sent as `false`: the API's `lowStock` filter is
        // absent-or-on, and `false` would be a second way to say "no filter".
        lowStock: filters.lowStock ? true : undefined,
        threshold: filters.threshold,
        pageSize: 1,
      }),
    enabled,
    staleTime: 60 * 1000,
  });
}

/**
 * The number the rail's Products badge shows — literally the Low-stock tile's
 * query, so the rail and the screen can never disagree or ask the API twice.
 *
 * Long `staleTime`, because a badge that refetched on every navigation would
 * hammer the API for a number that changes only when stock does.
 */
export function useLowStockCount(enabled = true) {
  return useProductCount({ lowStock: true }, enabled);
}

export function useCreateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateProductInput) => post<ProductDetail>("/products", input),
    onSuccess: () => {
      invalidateCatalogue(queryClient);
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateProductInput }) =>
      patch<ProductDetail>(`/products/${id}`, input),
    onSuccess: (_product, variables) => {
      invalidateCatalogue(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.detail(variables.id) });
    },
  });
}

/** One product, for the editor's second read. */
export function useProduct(id: string | null) {
  return useQuery({
    queryKey: queryKeys.products.detail(id ?? ""),
    queryFn: () => get<ProductDetail>(`/products/${id}`),
    enabled: id !== null,
  });
}

/**
 * A write moves the tiles and the badge as well as the table — a product edited
 * down to three units is exactly the thing the badge is watching for — so the
 * counts are invalidated with the list rather than leaving a tile or the rail
 * stale until a reload.
 */
function invalidateCatalogue(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.products.list() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.products.count() });
}
