# 0015 — A held sale is a tenant-visible draft

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** Phase 5g (hold/resume)
- **Related:** [`../STATE.md`](../STATE.md) §4.3 (Q31), [`../legacy/POS-BEHAVIOR.md`](../legacy/POS-BEHAVIOR.md),
  [ADR 0011](0011-receipt-number-is-a-per-tenant-sequence.md), [ADR 0012](0012-sale-tenders-are-rows.md)

## Context

A cashier needs to park a half-built cart — the customer has gone to find a purse,
or asked a question at the counter — and pick it up at the same till, or a
colleague's, before it is paid for. Legacy called this a **hold sale** and its
implementation is a warning rather than a design:

- `sale_status = 0` marked the hold, but a held sale was inserted as a real
  `sales` row **and marked paid** (`payment_status = 1` in both branches). It
  therefore counted in every report exactly like a completed one.
- It allocated a receipt number at insert (`random_int(100000, 999999)`), so
  parking a cart burned a number the salon never printed.
- Its "resume" path is **unreachable and wrong**: `SaleController::update` writes
  `sale_status = 1` _before_ it walks the lines, so the two tests that read that
  column always take the "completed" branch — and the branch that runs _adds_
  back stock a hold never removed, so resuming and editing a hold **increases**
  inventory. The shipped UI's Edit control sits inside a JSX comment.
- There is **no list of held carts** anywhere: the only persistence was one
  browser draft in `localStorage`, with no tenant or user namespace in its key.

The rebuild therefore has nothing to copy, and the three questions legacy cannot
answer are the decision: what a held row _is_, whether holding moves any ledger,
and how a hold is found and ended.

## Decision

1. **A held sale is a `Sale` row with `status = HELD`**, its `SaleLine` rows, and
   nothing else. It is a draft, not revenue.
2. **A hold takes no receipt number.** `Sale.receiptNumber` stays `null` until the
   sale is completed, so ADR 0011's per-tenant sequence is spent only on receipts
   the salon actually hands over. `Sale.soldAt` is set at **completion**, not at
   hold time — the sale happened when money changed hands.
3. **A hold fills no ledger.** No tenders, no `CustomerPoint`, no
   `EmployeePerformance`, no outstanding, no granted holding, and **no stock
   movement**: a held cart reserves nothing. Legacy's hold skipped the stock
   decrement for the same reason, and reserving stock for a quote is an
   inventory-reservation feature (Phase 9) rather than a till one.
4. **`HELD` is invisible to reporting by construction.** Every aggregate already
   reads `status = COMPLETED`, so a hold cannot leak into a total the way legacy's
   paid-looking hold did. Nothing about the reports changes.
5. **A hold completes through the ordinary pricing path.**
   `POST /api/sales/:id/complete` carries the cart as it stands — lines, the
   customer, the tenders — exactly as `POST /api/sales` does, and the server
   re-prices it from the catalogue. The resumed hold's line rows are **rewritten**
   in that transaction: a draft the salon has not printed is not history, and the
   server stays the only thing that names a price.
6. **A hold may be discarded; a completed sale may not.** `DELETE
/api/sales/:id` hard-deletes a `HELD` row — it wrote no ledger and holds no
   receipt number, so there is nothing to reverse — and **refuses** a
   `COMPLETED` or `VOID` one (`409`), which is what voiding (ADR 0016) is for.
7. **A hold does not expire.** It is a row with a status; an age the salon can
   see is enough, and an automatic timer is a background job with no owner yet.
8. **Holds are listed, tenant-wide.** `GET /api/sales?status=HELD` returns every
   hold in the salon, so a colleague can take one over — the shared desk the
   legacy browser draft could never serve, because its key had no tenant in it.

## Why not the alternatives

| Alternative                                                        | Why it was rejected                                                                                                                                                                                              |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep the browser draft as the only "hold" (the MVP's position, 5e) | It is invisible to a colleague and dies with the browser profile. It stays the _reload_ layer under the open cart; it is not a shared hold.                                                                      |
| A held row that counts as revenue, as legacy's did                 | A cart nobody paid for would appear in the day's income. Legacy's `payment_status = 1` on a hold is the bug this decision exists to not repeat.                                                                  |
| Allocate the receipt number at hold time                           | Numbers would be burned by carts abandoned at the counter, and two holds could print the same sequence with gaps no receipt explains (ADR 0011).                                                                 |
| Decrement stock at hold time (reserve the goods)                   | A quote would take inventory off the shelf before anyone paid. Two holds on the last bottle would make the second unsellable for no reason.                                                                      |
| Freeze the held price and charge it at completion                  | Contradicts the till's founding rule — the server prices every line from the catalogue, never a browser and never a stale snapshot. A hold is re-priced when it is paid for.                                     |
| Soft-delete a hold (`deletedAt`) rather than hard-delete it        | A hold has no ledger to preserve and no receipt number to reserve, so the rows carry no audit value. Keeping them would put abandoned carts and voided sales in one bucket, which is a worse question to answer. |
| An expiring hold (`expiresAt`, swept by a job)                     | There is no scheduler in the build yet, and "how old is too old" is a salon's policy rather than a constant.                                                                                                     |

## Consequences

- **Positive:** a held cart is visible to the whole salon and to any till the
  cashier signs in at; abandoning one costs nothing — no receipt number, no
  ledger entry, no stock.
- **Positive:** completion is the _only_ transition, so there is no reachable
  "resume" branch that can disagree with the ledger the way legacy's did.
- **Positive:** nothing about the reports changes, because a hold was never
  revenue.
- **Negative / accepted:** a hold reserves nothing, so the last bottle can be
  sold to a walk-in while a hold naming it still exists — and completing that
  hold then fails with the stock refusal the till already shows for a sold-out
  line (`INSUFFICIENT_STOCK`). This is the honest failure of "a hold is a quote".
- **Negative / accepted:** completion re-prices, so a hold taken before a price
  change is charged the new price. The receipt is the record; the cashier sees the
  figure before taking payment.
- **Neutral:** `SaleLine.position` continues to be the cart order, which is what
  lets the completion rewrite the line rows in the order the receipt prints.

## Enforcement

- **The write path:** `writeSale` in `apps/api/src/services/sale.service.ts`
  writes a `HELD` row with a `null` receipt number and returns before
  `fillLedgers`; `completeSale` allocates the number, rewrites the lines, writes
  the tenders and calls `fillLedgers`; `discardHold` refuses anything that is not
  `HELD`.
- **The contract:** `createSaleSchema`'s `hold` flag, `completeSaleSchema`,
  `saleListQuerySchema` and `saleSummarySchema` in
  `packages/shared/src/schemas/sales.ts`; `saleListSchema` is the only shape a sale
  list is read through.
- **The routes:** `POST /api/sales` (hold), `POST /api/sales/:id/complete`,
  `DELETE /api/sales/:id`, `GET /api/sales?status=HELD` — each behind `auth`,
  `requireModule("sales")` and, for the writes, `requireWritableTenant()`.
- **Tests:** the API route suite (`sales.routes.test.ts`) asserts that a hold takes no
  receipt number, moves no stock and fills no ledger; that completing one allocates the
  number and fills the ledger; that completing twice returns the same receipt; and that
  a non-`HELD` sale cannot be discarded. The contract suite
  (`packages/shared/src/schemas/sales.test.ts`) pins the flag and the list's defaults.
  The web suite (`pages/__tests__/Sale.test.tsx`) pins that Hold posts `hold: true` and
  that a pickup completes the hold's own id rather than creating a sale.
