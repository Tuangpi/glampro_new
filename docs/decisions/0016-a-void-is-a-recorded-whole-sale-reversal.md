# 0016 — A void is a recorded whole-sale reversal

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** Phase 5h (void)
- **Related:** [`../STATE.md`](../STATE.md) §4.3 (Q32), [`../legacy/POS-BEHAVIOR.md`](../legacy/POS-BEHAVIOR.md),
  [ADR 0011](0011-receipt-number-is-a-per-tenant-sequence.md), [ADR 0015](0015-a-held-sale-is-a-tenant-visible-draft.md)

## Context

A sale that should not have happened has to stop counting, and the legacy answer is a
Delete button:

- `SaleController::delete` runs two statements, `$sale->delete()` over its pivot rows.
  There is **no status guard**, so a completed receipt goes as readily as a cart.
- There is no reason and no actor. Nothing records that a sale ever existed, so a
  disputed transaction cannot be reconstructed.
- **Nothing is reversed.** Stock stays decremented, tenders stay taken, loyalty points
  stay earned, an unpaid balance stays owed, and the stylist's credited performance
  stays on the report — for a sale that no longer exists. The line rows cascade away
  with the sale, so the only evidence of it is gone.

The rebuild already made two of the needed decisions by accident of good design:
`Sale.status` has `VOID`, `Sale.voidedAt` exists, and every aggregate already filters
`status: "COMPLETED"` — four queries in `report.service.ts` plus the dashboard tiles —
so **"a void is not revenue" is already true and already tested**. What is missing is
the way to _reach_ `VOID`, a reason and an actor to record it, and a reversal for the
five ledgers `fillLedgers` fills (stock, holdings, points, outstanding, performance).

The sub-decisions Q32 lists are therefore the substance of this decision: whether the
reason is required, whether a void can be undone, what happens to a part-paid sale's
outstanding, whether the receipt number stays consumed, and whether the day's report
mentions the voided sales it is hiding.

## Decision

1. **A void is a state change, never a delete.** The `Sale` row, its lines and its
   receipt number all stay. `status = VOID`, `voidedAt` is set, and the sale is out of
   every total because the aggregates already filter `COMPLETED`.
2. **The reason and the actor are recorded, and both are required.**
   `POST /api/sales/:id/void` takes `{ reason }` — 3 to 500 characters, trimmed — and
   the actor is the **verified JWT's** user, written to a new `voidedById` column
   alongside a new `voidReason`. Nothing reads the actor from the request.
3. **Only an owner or a manager may void.** `requireRole("SUPER_ADMIN", "MANAGER")`.
   A cashier who rang a sale up wrong asks somebody who can answer for it, which is the
   difference between a mistake and a decision.
4. **The receipt number stays consumed, and is never reused.** A voided receipt is a
   receipt the salon printed; reissuing its number to a different sale would make two
   unrelated papers carry one reference. A gap in the sequence with a `VOID` row
   behind it is a truthful record, and it is what `ADR 0011`'s per-tenant sequence is
   for.
5. **The reversal is written in the same transaction as the status change**, because a
   voided sale whose stock came back and whose points did not is worse than either
   alone. It reverses what `fillLedgers` wrote, per ledger:
   - **Stock** comes back: `increment` by the line's quantity, per product line.
   - **Points** get an **offsetting negative row** on the same sale, never an edit and
     never a delete — the rule `CustomerPoint`'s own schema comment already states
     ("a refund or a correction writes a negative row rather than editing the
     original"). The balance is `SUM(point)`, so the sale's points net to zero.
   - **Holdings** granted by the sale are **deleted**, because nothing has been spent
     (see rule 6) and the credit the customer paid for has been refunded with the sale.
     The audit link survives on `SaleLine`, which stays.
   - **An outstanding balance** is deleted — the debt is cancelled with the sale that
     created it.
   - **Performance and commission** rows for the sale are deleted. A voided sale earned
     the stylist nothing, and the report's question is "what did they earn"; the
     record of what was attributed and then voided is the `VOID` sale plus its lines,
     which both remain.
6. **Two reversals are refused rather than guessed at**, both with a `409` naming what
   stands in the way:
   - **A granting holding that has been spent at all** — a package with a session used,
     a gift card with a balance drawn, credit partly consumed. Un-spending is a
     goodwill decision (what does the customer keep?) and not something a cashier's
     void may decide silently. The salon reverses the redemption first, if that is the
     agreement.
   - **An outstanding balance with a payment recorded against it** — money came in
     after the sale, and putting money back is a **refund**, not a void.
7. **A hold is discarded, not voided.** A `HELD` sale has no ledger and no receipt
   number, so voiding it would be voiding nothing; `DELETE /api/sales/:id` is its
   ending (ADR 0015), and the two refusals point at each other.
8. **A void is idempotent and terminal.** A second void of a voided sale returns the
   receipt it already has rather than erroring, so a double-tap is not a failure the
   cashier has to interpret — and it does **not** rewrite the first reason or the first
   actor. There is no unvoid: a sale rung up in error and then wanted after all is
   rung up again, which is a write this till already has.
9. **The reports keep hiding voided sales, and do not yet mention them.** No report
   shape changes here: whether a day's sheet should print "2 voided" alongside its
   total is a report-catalogue question (Phase 7), and printing a count now would be
   inventing a figure before the shape that carries it exists. The void is visible
   where it matters in the meantime — on the receipt, and through
   `GET /api/sales?status=VOID`.

## Why not the alternatives

| Alternative                                                    | Why it was rejected                                                                                                                                                                                                                 |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep legacy's delete                                           | It erases the receipt, the lines and the evidence, and leaves stock, tenders, points and performance standing — a sale that never existed and a report that still counts it.                                                        |
| A void with no reason                                          | The reason is the whole point of an auditable reversal: "why did this come off the day's takings" is the question a manager asks, and one free-text sentence answers it.                                                            |
| A void with no actor recorded                                  | A JWT identifies who asked. Not writing it down throws away information the request already carried, and there is no other path to "who did this".                                                                                  |
| Any cashier may void                                           | Authorising your own reversal is not a control. `requireRole` already exists for the first admin-only write (`staff.routes.ts`), and this is the same kind of rule.                                                                 |
| Decrement the receipt counter, or reuse the number             | Two different receipts would carry one number, and ADR 0011's sequence exists precisely so a printed reference identifies one sale.                                                                                                 |
| Delete the sale's `CustomerPoint` row instead of offsetting it | The model documents points as a signed ledger where a correction is a **new row** and history is never edited. Deleting is an edit to history.                                                                                      |
| Leave the granted holdings standing                            | The customer was refunded the package's price, so keeping the sessions gives away credit the salon was not paid for — and no ledger entry would explain it.                                                                         |
| Reverse a partly-spent holding anyway                          | Deciding what a customer keeps after using two of five sessions is a goodwill call with money attached. A cashier's void cannot make it, and a silent one would be worse than a refusal.                                            |
| Refund an outstanding's payments inside the void               | Putting money back is a different verb with a different trail (and, per Q32's option C, its own future). The void refuses and names it.                                                                                             |
| Soft-delete a `VOID` sale (`deletedAt`)                        | The row has to stay readable _as a receipt_ — that is what printing one means. A deleted flag would hide the very record the void exists to keep.                                                                                   |
| Line-level void (Q32's option B)                               | Legacy's deleted-items path is line-level, so it may return. It needs partial-void arithmetic and a receipt that shows live and voided lines together, and doing it as well as the whole-sale case would have shipped neither well. |
| Void and refund as two verbs (Q32's option C)                  | The honest long-term split, and the reason rule 6 refuses the two cases that would need a refund. Building both verbs now would double the surface before either is used.                                                           |
| Print "2 voided" on the day's report                           | It changes a report shape this phase does not own. Rule 9 keeps the aggregate honest — voided sales are excluded — and leaves the disclosure to the phase that draws the catalogue.                                                 |

## Consequences

- **Positive:** a void is answerable. The row, its reason, its actor and its lines all
  remain, and a disputed receipt can be reconstructed months later.
- **Positive:** the reversal is atomic with the status change, so no ledger can be left
  half-undone by a failure midway.
- **Positive:** "a void is not revenue" needed no report change — the aggregates already
  filtered `COMPLETED`, so this phase only had to make the state reachable.
- **Positive:** a double-tap is harmless, because a second void returns the receipt.
- **Negative / accepted:** a void cannot unwind a partly-spent package or a part-paid
  balance. Those sales stay completed and the salon must refund or reverse by hand. That
  is a real dead end until the returns work; it is written down here so it is a known
  limitation rather than a surprise.
- **Negative / accepted:** deleting performance and commission rows means the staff
  report has no memory of a voided sale's attribution beyond the `VOID` sale itself, so
  "how much did we void this month, per stylist" is a join away rather than a column
  away.
- **Neutral:** the receipt sequence keeps its gaps, which is correct and will look odd to
  somebody counting receipts.
- **Neutral:** `voidedById` is the one `Sale` link to `User` that is `onDelete: SetNull`
  rather than `Cascade`: deleting a departing manager must not delete the voided sales
  they authorised.

## Enforcement

- **The write path:** `voidSale` in `apps/api/src/services/sale.service.ts` — one
  `$transaction` that flips the status, writes the reason and the actor, and reverses the
  five ledgers. Its refusals are `409`s with codes (`SALE_NOT_COMPLETED`,
  `HOLDING_ALREADY_SPENT`, `OUTSTANDING_ALREADY_PAID`).
- **The schema:** migration `sale_void_reason_and_actor` adds `voidReason`, `voidedById`
  and the `SaleVoidedBy` relation. `Sale.voidedAt` finally has a writer.
- **The contract:** `voidSaleSchema` (the reason) and the receipt's `voidedAt`,
  `voidReason` and `voidedByName` in `packages/shared/src/schemas/sales.ts`.
- **The route:** `POST /api/sales/:id/void`, behind `auth`, `requireModule("sales")`,
  `requireWritableTenant()` and `requireRole("SUPER_ADMIN", "MANAGER")`.
- **Tests:** the API route suite asserts the reversal of each ledger, that stock comes
  back, that points net to zero, that a partly-spent holding and a part-paid balance are
  refused, that the number stays consumed, that a second void is idempotent, that a
  cashier is refused, and that a `HELD` sale cannot be voided. The web suite pins that
  the receipt draws the void banner with its reason.
