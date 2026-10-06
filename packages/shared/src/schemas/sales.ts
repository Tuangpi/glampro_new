/**
 * Sale contracts — handoff screens 01–02, `/api/sales`.
 *
 * The sale flow has three steps and this file holds two of them: the item search a
 * cashier types into **before** anything is in the cart (Phase 5b.1), and the
 * write that turns the cart into a receipt (Phase 5b.2). The third — printing the
 * receipt — is the same `saleDetailSchema` read back, so it needs no third shape.
 *
 * The five kinds below are the `SaleLineItemType` database enum, on purpose. The
 * cart stores one `SaleLine` per kind with that discriminator, so a search result
 * and the line it becomes speak one vocabulary and nothing has to guess which
 * catalogue an id came from.
 *
 * **The search and the write are deliberately asymmetric.** A search result carries
 * both prices, because which one applies depends on the customer attached to the
 * sale and that can change after the search. A write carries **no price at all**:
 * the server prices the cart from the catalogue, so a browser cannot name its own
 * price.
 */
import { z } from "zod";

import {
  DEFAULT_SALE_ITEM_LIMIT,
  MAX_RECEIPT_NUMBER,
  MAX_SALE_ITEM_LIMIT,
  MAX_SALE_LINES,
  MAX_SALE_PAYMENTS,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  SALE_STATUSES,
} from "../constants.js";
import { moneySchema } from "./common.js";

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

/**
 * How the money was handed over. Mirrors the `PaymentMethod` database enum.
 *
 * The same enum the platform `Payment` model already used, reused rather than
 * redeclared: a second list of tender codes would be a second thing to keep in
 * step with the database.
 */
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

export type SalePaymentMethod = z.infer<typeof paymentMethodSchema>;

/** Mirrors `SaleStatus`. A sale is completed when it is rung up; `HELD` is not drawn yet. */
export const saleStatusSchema = z.enum(SALE_STATUSES);

export const paymentStatusSchema = z.enum(PAYMENT_STATUSES);

/**
 * One cart line, as the till posts it.
 *
 * **No price.** The request says *what* was sold and *how many*; the server reads
 * the catalogue and decides what it costs. Legacy did the opposite — the browser
 * posted `newPrice` per line and the API stored it unexamined
 * (`SaleController::insert*`), so the price a salon charged was the price a
 * browser chose. `SaleLine.unitPrice` is therefore not a field a client can set.
 *
 * `staffId` is the redesign's addition: legacy could attribute at most four
 * stylists to a whole sale (`sold_by_one..four`), while a cart attributes each
 * line.
 */
export const saleLineInputSchema = z.object({
  itemType: saleItemKindSchema,
  itemId: z.string().min(1).max(64),
  /** A line of zero is not a line; the till removes it instead of posting it. */
  quantity: z.coerce.number().int().min(1).max(10_000),
  staffId: z.string().min(1).max(64).optional(),
});

export type SaleLineInput = z.infer<typeof saleLineInputSchema>;

/**
 * One tender.
 *
 * `payments[]` is what collapses legacy's three endpoints — `pay-by-cash`,
 * `pay-by-card` and `split-pay` — into one write, so a split is not a special
 * case but two rows. Legacy had no place to put a split: `splitPay()` charged the
 * card half through Stripe and then stored the whole thing as the free text
 * `"cash_50_card_25"` in `sales.payment_type`, which no report can sum.
 *
 * `sessionId` is a gateway session for a card tender that settles later; it moves
 * off the sale row (where legacy kept one `sales.session_id`) onto the tender it
 * belongs to.
 */
export const salePaymentInputSchema = z.object({
  method: paymentMethodSchema,
  /** An **input**, so coerced by `moneySchema`; it comes back out as a string. */
  amount: moneySchema,
  sessionId: z.string().trim().max(255).optional(),
});

export type SalePaymentInput = z.infer<typeof salePaymentInputSchema>;

/**
 * `POST /api/sales` — the whole sale in one request.
 *
 * `customerId` is optional because the till draws a **Walk-in** chip: a walk-in
 * sale has no customer row, and the legacy schema's non-null `customer_id` is how
 * that system ended up needing an invented "cash customer" per salon. The lines
 * that **grant** something (a package, a value package, a gift card) do need an
 * owner, and the service refuses those without one rather than silently issuing
 * credit to nobody.
 *
 * `idempotencyKey` is **Q16**. Legacy's `pay-by-cash` posts a payment with no key
 * anywhere, so a double-tap charges twice; the key is stored on the sale and a
 * replay returns the sale that already exists instead of writing a second one.
 */
export const createSaleSchema = z.object({
  customerId: z.string().min(1).max(64).optional(),
  staffId: z.string().min(1).max(64).optional(),
  note: z.string().trim().max(1000).optional(),
  lines: z.array(saleLineInputSchema).min(1).max(MAX_SALE_LINES),
  payments: z.array(salePaymentInputSchema).max(MAX_SALE_PAYMENTS).default([]),
  idempotencyKey: z.string().trim().min(8).max(128).optional(),
});

export type CreateSaleInput = z.infer<typeof createSaleSchema>;

/**
 * A line of a stored sale — the receipt's row.
 *
 * Money is a **string** here and a number in `saleLineInputSchema`, which is the
 * convention every contract in this package keeps: `Decimal(12,2)` goes in
 * coerced and comes out formatted, because a JSON float has already lost the cent
 * it is carrying.
 */
export const saleLineSchema = z.object({
  id: z.string(),
  itemType: saleItemKindSchema,
  /** The catalogue row's id, which the receipt does not need and history does. */
  itemId: z.string(),
  /** The name **snapshotted at sale time**, so archiving a service keeps the receipt. */
  itemName: z.string(),
  quantity: z.number().int(),
  unitPrice: z.string(),
  lineTotal: z.string(),
  /** Who this line is credited to; `null` is uncredited, which is the product case. */
  staffId: z.string().nullable(),
  staffName: z.string().nullable(),
});

export type SaleLine = z.infer<typeof saleLineSchema>;

/** A stored tender. */
export const salePaymentSchema = z.object({
  method: paymentMethodSchema,
  amount: z.string(),
  sessionId: z.string().nullable(),
});

export type SalePayment = z.infer<typeof salePaymentSchema>;

/**
 * The receipt — what `POST /api/sales` returns and `GET /api/sales/:id` re-reads.
 *
 * One shape for both, because the confirmation screen *is* the receipt
 * (`docs/roadmap.md` → Phase 5d): a second representation for the just-created
 * case is a second thing that can disagree with the stored one.
 *
 * `outstandingAmount` comes back rather than being left for the client to
 * subtract: whether a balance is owed is the server's judgement (`paidAmount <
 * totalAmount`), and a client that subtracts two strings gets a float.
 */
export const saleDetailSchema = z.object({
  id: z.string(),
  /**
   * The receipt number, unique per salon. Nullable because a row that predates the
   * column — a migrated sale, or one written while the importer is still running —
   * has no number yet, and inventing one on read would be worse than saying "not
   * assigned".
   */
  receiptNumber: z.number().int().min(1).max(MAX_RECEIPT_NUMBER).nullable(),
  status: saleStatusSchema,
  paymentStatus: paymentStatusSchema,
  /** ISO 8601. Legacy's `sale_date` + `sale_time`, which were two columns. */
  soldAt: z.string(),
  customerId: z.string().nullable(),
  customerName: z.string().nullable(),
  /** Who rang it up. Per-line credit is on each line's `staffId`. */
  staffId: z.string().nullable(),
  staffName: z.string().nullable(),
  note: z.string().nullable(),
  totalQuantity: z.number().int(),
  totalAmount: z.string(),
  paidAmount: z.string(),
  /** `totalAmount - paidAmount`, never negative. Non-zero means a `CustomerOutstanding`. */
  outstandingAmount: z.string(),
  /** The points this sale earned its customer; `0` for a walk-in. */
  pointsEarned: z.number().int(),
  lines: z.array(saleLineSchema),
  payments: z.array(salePaymentSchema),
});

export type SaleDetail = z.infer<typeof saleDetailSchema>;
