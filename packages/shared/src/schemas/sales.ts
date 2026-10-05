/**
 * Sale contracts — handoff screens 01–02, `/api/sales`.
 *
 * The sale flow has three steps and this file starts with the first: the item
 * search a cashier types into **before** anything is in the cart (Phase 5b.1). The
 * cart write, its ledgers and the receipt number arrive in 5b.2, so there is no
 * `createSaleSchema` here yet.
 *
 * The five kinds below are the `SaleLineItemType` database enum, on purpose. The
 * cart stores one `SaleLine` per kind with that discriminator, so a search result
 * and the line it becomes speak one vocabulary and nothing has to guess which
 * catalogue an id came from.
 */
import { z } from "zod";

import { DEFAULT_SALE_ITEM_LIMIT, MAX_SALE_ITEM_LIMIT } from "../constants.js";

/**
 * Mirrors the `SaleLineItemType` enum. The order is the order the picker draws its
 * tabs in, and `sale.service.test.ts` asserts the two lists stay equal.
 */
export const SALE_ITEM_KINDS = [
  "SERVICE",
  "PRODUCT",
  "PACKAGE",
  "VALUE_PACKAGE",
  "GIFT_CARD",
] as const;

export const saleItemKindSchema = z.enum(SALE_ITEM_KINDS);

export type SaleItemKind = z.infer<typeof saleItemKindSchema>;

/**
 * `?search=&kind=&limit=`
 *
 * `kind` is the category the cashier has selected — one tab of the picker — and an
 * unknown one is **rejected rather than ignored**, the same rule `?status=` follows
 * on the catalogue tabs: a typo in a category must not quietly widen the search to
 * everything.
 *
 * `limit` counts rows **per kind** (see `DEFAULT_SALE_ITEM_LIMIT`).
 */
export const saleItemSearchQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  kind: saleItemKindSchema.optional(),
  limit: z.coerce.number().int().min(1).max(MAX_SALE_ITEM_LIMIT).default(DEFAULT_SALE_ITEM_LIMIT),
});

export type SaleItemSearchQuery = z.infer<typeof saleItemSearchQuerySchema>;

/**
 * What every sellable kind has.
 *
 * The per-kind payloads below add only the columns that kind actually has, so the
 * picker draws a stock badge for a product and a session count for a package rather
 * than a row of columns that are `null` for everything else.
 */
const saleItemBase = {
  /** The id the cart will store as `SaleLine.itemId`, with `kind` naming its table. */
  id: z.string(),
  name: z.string(),
  /**
   * What one unit costs before any line discount: the non-member price where the
   * catalogue holds a member/non-member pair, and the only price there is for a
   * value package or a gift card (whose model has a single column, the card's face
   * value).
   *
   * A **string on the wire**, like every other price: the column is `Decimal(12,2)`
   * and a JSON float has already lost the cent.
   */
  price: z.string(),
  /**
   * The member price, or `null` for the kinds that have only one price.
   *
   * Both prices come back together because whether the member one applies depends on
   * the customer attached to the sale, which can change *after* the search — the cart
   * has to be able to re-price a line without searching again.
   */
  memberPrice: z.string().nullable(),
};

/** A service. Legacy `services`. */
const serviceSaleItemSchema = z.object({
  ...saleItemBase,
  kind: z.literal("SERVICE"),
  /** Loyalty points the line earns. Legacy `point`. */
  points: z.number().int(),
  /** Booking length, `null` when the salon has not set one. */
  durationMinutes: z.number().int().nullable(),
});

/** A stock item. Legacy `products`. */
const productSaleItemSchema = z.object({
  ...saleItemBase,
  kind: z.literal("PRODUCT"),
  points: z.number().int(),
  /** Stock on hand. */
  quantity: z.number().int(),
  /**
   * At or below the tenant's threshold, computed on the server — the picker holds
   * one `limit`-sized page, so it cannot judge stock for itself (ADR 0010).
   */
  lowStock: z.boolean(),
});

/** A bundle of sessions. Legacy `packages`. */
const packageSaleItemSchema = z.object({
  ...saleItemBase,
  kind: z.literal("PACKAGE"),
  /** Sessions the bundle grants. Legacy `no_of_time`. */
  sessionCount: z.number().int(),
  /** How many services it may be spent on — the count, not the list. */
  serviceCount: z.number().int(),
});

/** Prepaid credit: the customer pays `price` and receives `credit`. Legacy `valuepackages`. */
const valuePackageSaleItemSchema = z.object({
  ...saleItemBase,
  kind: z.literal("VALUE_PACKAGE"),
  /** The credit the customer receives. `price` is what they pay. */
  credit: z.string(),
  serviceCount: z.number().int(),
});

/**
 * A prepaid card, as the **template** the salon sells. Legacy `giftcards`.
 *
 * No `value` field: `GiftCard` has one money column, so the card's face value is the
 * `price` a customer pays for it. A second field carrying the same number would only
 * give the two a chance to disagree.
 */
const giftCardSaleItemSchema = z.object({
  ...saleItemBase,
  kind: z.literal("GIFT_CARD"),
  /** The expiry an issued card inherits; `null` means it never expires. */
  expiresAt: z.string().nullable(),
});

/**
 * One row of the POS item search, discriminated on `kind`.
 *
 * A union rather than one object with five nullable halves: a package has no stock, a
 * gift card has no points, and a client that switches on `kind` gets a type that says
 * so instead of a field that is always `null` for the kind it is holding.
 */
export const saleItemSchema = z.discriminatedUnion("kind", [
  serviceSaleItemSchema,
  productSaleItemSchema,
  packageSaleItemSchema,
  valuePackageSaleItemSchema,
  giftCardSaleItemSchema,
]);

export type SaleItem = z.infer<typeof saleItemSchema>;

/** The item search's answer. */
export const saleItemSearchResultSchema = z.object({
  /**
   * The kinds this salon may sell — the tabs the picker can fill.
   *
   * An add-on the salon has not bought leaves its kinds **out of this list** rather
   * than failing the request. The picker belongs to a core feature, and a cashier at
   * a salon with no Packages add-on still has to ring up a shampoo; an empty tab,
   * though, would read as "there are none". This list is independent of `?kind=`,
   * which only narrows `items`.
   */
  searchableKinds: z.array(saleItemKindSchema),
  items: z.array(saleItemSchema),
});

export type SaleItemSearchResult = z.infer<typeof saleItemSearchResultSchema>;
