# 0012 — A sale's tenders are rows, not a free-text column

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** Phase 5b.2 (the sale write)
- **Related:** [`../STATE.md`](../STATE.md) §3 (Phase 5b.2), [`../legacy/reference/legacy-schema.md`](../legacy/reference/legacy-schema.md),
  [`../legacy/API-INVENTORY.md`](../legacy/API-INVENTORY.md), [ADR 0011](0011-receipt-number-is-a-per-tenant-sequence.md)

## Evidence review — 2026-10-15

The accepted row-per-tender policy below remains in place. The original phase
description needs these qualifications against the current implementation:

- [`schema.prisma`](../../apps/api/prisma/schema.prisma) and the
  [tender migration](../../apps/api/prisma/migrations/20261005201500_sale_tenders_receipt_number_and_idempotency/migration.sql)
  define `sale_payments` with an enum method, `Decimal(12,2)` amount, nullable
  `sessionId`, tenant/sale foreign keys and indexes. Migration application was not
  verified. Historical legacy links below remain historical sources, as explained
  in the [ADR index](README.md#historical-references-and-current-scope).
- [`sale.service.ts`](../../apps/api/src/services/sale.service.ts) has two callers
  of `writePayments`: ordinary checkout in `writeSale` and held-cart completion in
  `completeSale`. Both persist tenders inside the transaction that completes the
  sale and fills its ledgers, using the shared Decimal-based `totalsOf` calculation
  for `paidAmount` and `paymentStatus`. Thus decision item 2 means one transactional
  write per operation, not that `POST /api/sales` is the only tender-writing route.
  Creating a hold returns before tender insertion; completion guards the `HELD`
  status before writing, consistent with [ADR 0015](0015-a-held-sale-is-a-tenant-visible-draft.md).
- [`sales.ts`](../../packages/shared/src/schemas/sales.ts) shares the cart body
  between create and complete contracts, defaults `payments` to `[]`, bounds it by
  `MAX_SALE_PAYMENTS` and refuses a hold carrying tenders. An empty array does not
  itself imply `UNPAID`: `totalsOf` marks a zero-total completed sale `PAID` because
  the paid amount covers the total. This qualifies the no-tender consequence below.
- `sessionId` remains optional input metadata, trimmed and limited to 255 characters;
  it is not restricted to `CARD`, required for that method or checked against a
  gateway by the inspected write paths. Those paths store the supplied method and
  amount and derive payment status from the sum; they do not verify settlement.
  [`PaymentDialog.tsx`](../../apps/web/src/components/sale/PaymentDialog.tsx) posts
  method/amount rows, not a gateway session. A recorded card tender must not be
  treated as proof of acquiring or settlement integration.
- [`sale.service.test.ts`](../../apps/api/src/services/sale.service.test.ts)
  contains a split-payment assertion for two persisted rows and the card row's
  session ID; [`sale-ledgers.test.ts`](../../apps/api/src/lib/sale-ledgers.test.ts)
  seeds a separate tender row. These database-backed suites were inspected, not
  run, pending confirmation of a disposable database. No runtime persistence,
  rollback or concurrency guarantee is claimed from this review.
- Database-free [`sales.test.ts`](../../packages/shared/src/schemas/sales.test.ts)
  covers default empty tenders, rejection of tender-bearing holds and a split in
  the completion contract. Mocked browser [`Sale.test.tsx`](../../apps/web/src/pages/__tests__/Sale.test.tsx)
  covers tender payloads for checkout and held-cart completion. Neither suite
  establishes database behavior or payment-provider processing.

## Context

Legacy took money through **three endpoints** — `pay-by-cash`, `pay-by-card` and
`split-pay` — and stored the outcome in one free-text column, `sales.payment_type`.
A single tender was written as the method (`"cash"`), and a split was written as a
description of itself: `"cash_50_card_25"`. The card half was also charged through
Stripe in `splitPay()` _before_ the string was written, so the record of what was
collected and the act of collecting it were two different code paths that could
disagree.

Two consequences were unavoidable in the rebuild:

1. **No report can sum a string.** "How much did we take in cash in March" is a
   query over `sales.payment_type` that only works if every writer spelled it the
   same way, and the legacy writers did not: the mobile app and the web app each
   had their own literals.
2. **A row's amount and its method are separate facts.** A sale of 75.00 taken as
   50 cash + 25 card has one method per _tender_, not per sale, and the string
   encodes both amounts inside the method name.

The schema was being written from scratch for this rebuild, so the shape was still
a choice rather than a constraint.

## Decision

1. **A tender is a row in `sale_payments`.** `SalePayment` carries `method`
   (typed against the `PaymentMethod` enum, not text), `amount` as
   `Decimal(12, 2)`, and an optional `sessionId` for a card tender that settles
   later. A split is **two rows**, not a special case.
2. **One write takes the whole sale.** `POST /api/sales` accepts `payments[]`,
   which collapses legacy's three endpoints into one transaction. The cash, card
   and split flows differ only in how many entries the array holds.
3. **`paidAmount` is derived, never posted.** The service sums `payments[]`; the
   client cannot name a paid figure any more than it can name a line price.
4. **`sessionId` moves onto the tender it belongs to.** Legacy kept one
   `sales.session_id` for the whole sale, which a split cannot express.

## Why not the alternatives

| Alternative                                                                 | Why it was rejected                                                                                                                                                   |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep `paymentType` as free text plus a `paidAmount` column                  | The split stays unrepresentable. Reports over a string depend on writer spelling, and the importer's job becomes guessing which values mean "cash".                   |
| Two columns (`cashAmount`, `cardAmount`)                                    | Only works for the methods that exist today. `PAYMENT_METHODS` already holds five, and each new one is a migration and a nullable column for every historical sale.   |
| One `amount` column plus a `method` on the sale, and a JSON blob for splits | A JSON column cannot be indexed or summed in SQL without a custom operator, and the schema's other money columns are `Decimal(12,2)` that reports aggregate directly. |
| Keep three endpoints and write the rows server-side per endpoint            | Three code paths that must agree about ledgers, outstanding amounts and the receipt number. They already disagreed in legacy; one write is the only way they cannot.  |

## Consequences

- **Positive:** "how much cash did we take" and "how was this sale paid" are the
  same query shape; a split is data rather than a convention; `Sale.paidAmount`
  and `SalePayment.amount` are reconciled by construction inside one transaction.
- **Positive:** the tender's `sessionId` lets a settling card payment be
  reconciled to one tender rather than to a whole sale.
- **Negative / accepted:** an importer mapping legacy rows has to _invent_ the
  split when it meets `"cash_50_card_25"` — it parses the string or the amounts
  are lost. That work belongs to Phase 9 and is recorded in
  [`../legacy/LEGACY-MAP.md`](../legacy/LEGACY-MAP.md).
- **Negative / accepted:** a sale with no tender at all is a legal row
  (`payments: []`, `PaymentStatus.UNPAID`), so nothing in the schema distinguishes
  "paid nothing yet" from "the cashier never filled the sheet in". The till's own
  dialog is where that rule lives.
- **Neutral:** legacy's `Stripe` charge in `splitPay()` has no counterpart yet;
  `sessionId` is the socket it will use when card acquiring is built.

## Enforcement

- **The write path:** `writeSale` in `apps/api/src/services/sale.service.ts`
  inserts one `salePayment` row per tender inside the sale's transaction, and
  derives `paidAmount` and `paymentStatus` from them.
- **The contract:** `salePaymentInputSchema` / `salePaymentSchema` in
  `packages/shared/src/schemas/sales.ts` are the only shapes a client may send or
  read, and `MAX_SALE_PAYMENTS` bounds the array.
- **Tests:** `apps/api/src/lib/sale-ledgers.test.ts` seeds a tender **as a row**
  (its own comment says why), and `sale.service.test.ts` covers the split case
  against a live database.
- **Nothing enforces** that a card tender's `sessionId` is set when a gateway was
  involved — there is no gateway yet, so there is nothing to check.
