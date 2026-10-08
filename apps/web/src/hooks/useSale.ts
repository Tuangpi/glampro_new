/**
 * Sale data — handoff screens 01–02 (`GET /api/sales/items`, `POST /api/sales`).
 *
 * No new contract: the search query and the write reuse `saleItemSearchQuerySchema`
 * and `createSaleSchema` from `@glampro/shared`, so everything below is shaped by
 * what those two schemas already say.
 *
 * The open cart lives in the TanStack Query cache under
 * `queryKeys.sale.openCart()` rather than in a context. The rail badge and the
 * till read one cart without prop-drilling, the cart survives a round trip to the
 * customer screen mid-sale, and signing out clears it along with everything else
 * (`queryClient.clear()` in `AuthContext`). Cart *persistence across reloads* is a
 * full-phase feature (`docs/mvp.md` → deferred), so a reload starts an empty
 * cart — deliberately.
 *
 * **Unit prices are never stored.** A line keeps both prices the search returned
 * (`price` and `memberPrice`) and `lineUnitPrice` derives the one that applies
 * from the customer, because the customer can change after the search and the
 * server prices the same way (`priceLine` in `sale.service.ts`): member for
 * service/product/package when they carry a membership reference, the only price
 * there is for a value package or a gift card. A cart that froze the price at
 * add time would disagree with the receipt the server writes.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DEFAULT_SALE_ITEM_LIMIT,
  MAX_SALE_LINES,
  type CustomerSummary,
  type CreateSaleInput,
  type SaleDetail,
  type SaleItem,
  type SaleItemKind,
  type SaleItemSearchResult,
  type SaleLineInput,
} from "@glampro/shared";

import { queryKeys } from "@/constants/queryKeys";
import { get, getPaginated, post } from "@/lib/api";

/**
 * One row of the till's cart.
 *
 * It is **not** a `SaleLineInput`: the request carries what was sold and how
 * many, while the cart also carries the name and the two prices the search
 * returned. `toSaleLineInputs` strips it back down at post time, so the price a
 * salon charges is the one the server read from the catalogue (the schema's "no
 * price" rule) and never one the browser held.
 */
export interface CartLine {
  itemType: SaleItemKind;
  itemId: string;
  name: string;
  quantity: number;
  /** The non-member price — or the only price — as the search returned it. */
  price: string;
  /** The member price, or `null` for the kinds that have only one price. */
  memberPrice: string | null;
  /** Who gets credit for this line. Absent for product lines (the MVP rule). */
  staffId?: string;
}

/**
 * The key two lines merge on. A service added for two different stylists is two
 * lines, because the second click names a different performer — merging on the
 * item alone would silently re-attribute the first line.
 */
export function cartLineKey(line: Pick<CartLine, "itemType" | "itemId" | "staffId">): string {
  return `${line.itemType}:${line.itemId}:${line.staffId ?? ""}`;
}

/**
 * The price one unit costs for the customer on this sale — always derived, so
 * switching between a member and a walk-in re-prices the cart without searching
 * again (the reason the search returns both prices).
 */
export function lineUnitPrice(
  line: Pick<CartLine, "price" | "memberPrice">,
  isMember: boolean,
): string {
  if (isMember && line.memberPrice !== null) return line.memberPrice;
  return line.price;
}

/**
 * Adds one unit of the item. An identical line grows instead: a till adds
 * another shampoo to the line it already has rather than starting a new one.
 *
 * Returns whether the line landed. Past 100 distinct lines it does not,
 * because the write would be refused (`MAX_SALE_LINES` says a hundred lines is
 * far past any real till receipt) — the page says so instead of posting a cart
 * the server cannot take.
 */
export function addCartLine(
  lines: CartLine[],
  item: SaleItem,
  staffId: string | undefined,
  isMember: boolean,
): { lines: CartLine[]; added: boolean } {
  const key = cartLineKey({ itemType: item.kind, itemId: item.id, staffId });

  if (lines.some((line) => cartLineKey(line) === key)) {
    return {
      lines: lines.map((line) =>
        cartLineKey(line) === key
          ? { ...line, quantity: Math.min(line.quantity + 1, 10_000) }
          : line,
      ),
      added: true,
    };
  }

  if (lines.length >= MAX_SALE_LINES) return { lines, added: false };

  return {
    lines: [
      ...lines,
      {
        itemType: item.kind,
        itemId: item.id,
        name: item.name,
        quantity: 1,
        // Stored for the cart's own preview only: `lineUnitPrice` re-derives the
        // charge from `isMember` on every render (see the module comment), and
        // `toSaleLineInputs` drops all prices before posting.
        price: isMember && item.memberPrice !== null ? item.memberPrice : item.price,
        memberPrice: item.memberPrice,
        ...(staffId ? { staffId } : {}),
      },
    ],
    added: true,
  };
}

/**
 * Sets a line's quantity. Zero removes the line — the contract's "a line of
 * zero is not a line", and the stepper's minus key at 1. Past 10,000 it clamps,
 * because `saleLineInputSchema` refuses more.
 */
export function setCartLineQuantity(lines: CartLine[], key: string, quantity: number): CartLine[] {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return lines.filter((line) => cartLineKey(line) !== key);
  }
  return lines.map((line) =>
    cartLineKey(line) === key
      ? { ...line, quantity: Math.min(Math.trunc(quantity), 10_000) }
      : line,
  );
}

/** Credits a line to a stylist, or back to nobody. */
export function setCartLineStaff(
  lines: CartLine[],
  key: string,
  staffId: string | undefined,
): CartLine[] {
  return lines.flatMap((line) => {
    if (cartLineKey(line) !== key) return [line];
    if (!staffId) return [{ ...line, staffId: undefined }];
    const next: CartLine = { ...line, staffId };
    // Re-keying can collide with an existing line: crediting one of two
    // identical shampoo lines to the other's stylist leaves one line of two.
    const twin = lines.find((other) => other !== line && cartLineKey(other) === cartLineKey(next));
    if (twin) return [];
    return [next];
  });
}

/**
 * Removes a line outright.
 */
export function removeCartLine(lines: CartLine[], key: string): CartLine[] {
  return lines.filter((line) => cartLineKey(line) !== key);
}

/**
 * The cart as the till posts it: what was sold and how many, per line, with no
 * prices anywhere (the schema's "no price" rule).
 */
export function toSaleLineInputs(lines: CartLine[]): SaleLineInput[] {
  return lines.map((line) => ({
    itemType: line.itemType,
    itemId: line.itemId,
    quantity: line.quantity,
    ...(line.staffId ? { staffId: line.staffId } : {}),
  }));
}

export interface SaleItemFilters {
  search?: string;
  kind?: SaleItemKind;
}

/**
 * The item search the cashier types into.
 *
 * The filters object is the last element of the key (the `queryKeys.ts`
 * convention), so the mutation below invalidates every search and every kind
 * with one prefix. `limit` is sent explicitly rather than left to the schema
 * default, so the picker's one-page-per-kind is a decision on this line rather
 * than an accident of the default. `?kind=` narrows the rows only.
 */
export function useSaleItems(filters: SaleItemFilters = {}) {
  return useQuery({
    queryKey: [...queryKeys.sale.items(), filters],
    queryFn: () =>
      get<SaleItemSearchResult>("/sales/items", {
        search: filters.search || undefined,
        kind: filters.kind,
        limit: DEFAULT_SALE_ITEM_LIMIT,
      }),
    placeholderData: (previous) => previous,
  });
}

/** How many customer rows the picker shows — a short list, not a page. */
const CUSTOMER_PICKER_PAGE_SIZE = 8;

/**
 * The customer picker search.
 *
 * Idle until the cashier types: an unfiltered first page would be "recent
 * customers", a claim no endpoint ordering makes, so no rows is the honest
 * answer before the first keystroke rather than a list that looks curated.
 */
export function useSaleCustomers(search: string) {
  const term = search.trim();
  return useQuery({
    queryKey: [...queryKeys.sale.customers(), { search: term }],
    queryFn: () =>
      getPaginated<CustomerSummary>("/customers", {
        page: 1,
        pageSize: CUSTOMER_PICKER_PAGE_SIZE,
        search: term || undefined,
      }),
    enabled: term.length > 0,
    placeholderData: (previous) => previous,
  });
}

export interface SaleCart {
  lines: CartLine[];
  addItem: (item: SaleItem, staffId: string | undefined, isMember: boolean) => boolean;
  setQuantity: (key: string, quantity: number) => void;
  setStaff: (key: string, staffId: string | undefined) => void;
  removeLine: (key: string) => void;
  clearCart: () => void;
}

/**
 * The open cart (see the module comment for why it is a query).
 *
 * `staleTime` and `gcTime` are infinite because the cart is written, never
 * fetched: the initial `[]` is the seed an empty cart starts from, and nothing
 * may refetch it away from under the cashier mid-sale.
 */
export function useSaleCart(): SaleCart {
  const queryClient = useQueryClient();
  const query = useQuery<CartLine[]>({
    queryKey: queryKeys.sale.openCart(),
    queryFn: () => [],
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });

  function update(updater: (lines: CartLine[]) => CartLine[]): void {
    queryClient.setQueryData<CartLine[]>(queryKeys.sale.openCart(), (current) =>
      updater(current ?? []),
    );
  }

  return {
    lines: query.data ?? [],
    addItem: (item, staffId, isMember) => {
      let added = false;
      update((lines) => {
        const next = addCartLine(lines, item, staffId, isMember);
        added = next.added;
        return next.lines;
      });
      return added;
    },
    setQuantity: (key, quantity) => {
      update((lines) => setCartLineQuantity(lines, key, quantity));
    },
    setStaff: (key, staffId) => {
      update((lines) => setCartLineStaff(lines, key, staffId));
    },
    removeLine: (key) => {
      update((lines) => removeCartLine(lines, key));
    },
    clearCart: () => {
      update(() => []);
    },
  };
}

/**
 * Rings the cart up: `201` with the receipt as the body, which the page draws
 * directly (the confirmation screen *is* the receipt — roadmap Phase 5d).
 *
 * The cart is cleared on success, so the rail badge drops with the sale rather
 * than waiting for the receipt to be dismissed. The server-backed views a sale
 * moves — the item grid (stock fell) and the catalogue's list and low-stock
 * count — are invalidated with it. Customer aggregates are not: a sale writes
 * points and outstandings no screen reads yet, so there is nothing to refresh.
 */
export function useCreateSale() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateSaleInput) => post<SaleDetail>("/sales", input),
    onSuccess: () => {
      queryClient.setQueryData<CartLine[]>(queryKeys.sale.openCart(), []);
      void queryClient.invalidateQueries({ queryKey: queryKeys.sale.items() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.list() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.products.count() });
    },
  });
}
