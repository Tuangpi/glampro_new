import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateGiftCardInput,
  GiftCardDetail,
  GiftCardSummary,
  UpdateGiftCardInput,
} from "@glampro/shared";

import { queryKeys } from "@/constants/queryKeys";
import { get, getPaginated, patch, post } from "@/lib/api";

export interface GiftCardListFilters {
  page: number;
  pageSize: number;
  search?: string;
}

/**
 * One page of gift-card templates — handoff screen 08's fourth tab.
 *
 * No `status` filter, because `GiftCard` has no status column and the tab draws no
 * Status cell. `?status=` would be ignored by the API rather than rejected; not
 * sending it is the honest half of the same arrangement.
 */
export function useGiftCardList(filters: GiftCardListFilters) {
  return useQuery({
    queryKey: [...queryKeys.giftCards.list(), filters],
    queryFn: () =>
      getPaginated<GiftCardSummary>("/gift-cards", {
        page: filters.page,
        pageSize: filters.pageSize,
        search: filters.search || undefined,
      }),
    placeholderData: (previous) => previous,
  });
}

/** One template, for the editor's second read. */
export function useGiftCard(id: string | null) {
  return useQuery({
    queryKey: queryKeys.giftCards.detail(id ?? ""),
    queryFn: () => get<GiftCardDetail>(`/gift-cards/${id}`),
    enabled: id !== null,
  });
}

export function useCreateGiftCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateGiftCardInput) => post<GiftCardDetail>("/gift-cards", input),
    onSuccess: () => {
      invalidateGiftCards(queryClient);
    },
  });
}

export function useUpdateGiftCard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateGiftCardInput }) =>
      patch<GiftCardDetail>(`/gift-cards/${id}`, input),
    onSuccess: (_card, variables) => {
      invalidateGiftCards(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.giftCards.detail(variables.id) });
    },
  });
}

function invalidateGiftCards(queryClient: ReturnType<typeof useQueryClient>): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.giftCards.list() });
}
