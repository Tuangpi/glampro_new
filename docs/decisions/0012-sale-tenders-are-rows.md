# 0012 — A sale's tenders are rows, not a free-text column

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** Phase 5b.2 (the sale write)
- **Related:** [`../STATE.md`](../STATE.md) §3 (Phase 5b.2), [`../legacy/reference/legacy-schema.md`](../legacy/reference/legacy-schema.md),
  [`../legacy/API-INVENTORY.md`](../legacy/API-INVENTORY.md), [ADR 0011](0011-receipt-number-is-a-per-tenant-sequence.md)

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
