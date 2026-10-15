# 0011 — The receipt number is a per-tenant sequence

- **Status:** Accepted
- **Date:** 2026-10-06
- **Deciders:** Phase 5b.2 (the sale) implementation
- **Related:** [`../roadmap.md`](../roadmap.md) Phase 5 ("Two things 5b.2 has to
  settle rather than assume: **the receipt number** …"), [`../STATE.md`](../STATE.md)
  §4 (Q16 sits beside this question), `apps/api/prisma/schema.prisma` (`Sale`,
  `Tenant.receiptCounter`), `apps/api/src/services/sale.service.ts` (`writeSale`),
  [`../../packages/shared/src/constants.ts`](../../packages/shared/src/constants.ts)
  (`MAX_RECEIPT_NUMBER`)

## Evidence review — 2026-10-15

The accepted sequencing policy below remains in place. Some implementation and
UI descriptions predate held-sale completion and need the following qualifications:

- [`schema.prisma`](../../apps/api/prisma/schema.prisma) and the
  [receipt migration](../../apps/api/prisma/migrations/20261005201500_sale_tenders_receipt_number_and_idempotency/migration.sql)
  define the nullable receipt number, per-tenant unique index and counter with
  default `0`. These files were inspected; database migration application was not
  verified.
- [`sale.service.ts`](../../apps/api/src/services/sale.service.ts) now has two
  allocation paths, not only `writeSale`: ordinary checkout and `completeSale`.
  Both increment the tenant counter and check `MAX_RECEIPT_NUMBER` inside the
  transaction that persists the numbered sale. Held-sale completion first guards
  the `HELD` status with a count-checked update. Creating a hold returns before
  counter allocation, consistent with [ADR 0015](0015-a-held-sale-is-a-tenant-visible-draft.md).
  Thus nullable numbers are not limited to migrated rows: current held carts also
  have no number until completion. This qualifies decision item 4 and the
  legacy-only consequence without changing the sequencing policy.
- [`sales.ts`](../../packages/shared/src/schemas/sales.ts) bounds nullable receipt
  numbers in both detail and summary contracts. The database-free
  [`sales.test.ts`](../../packages/shared/src/schemas/sales.test.ts) includes held
  null-number, numbered-summary and below-first-value rejection assertions.
- [`sale.service.test.ts`](../../apps/api/src/services/sale.service.test.ts)
  contains sequential per-tenant numbering and idempotency assertions. Those
  checks do not by themselves establish concurrent allocation, counter rollback
  or ceiling refusal. The database-backed suite was inspected, not run, pending
  confirmation of a disposable test database; this review does not claim those
  runtime guarantees have been validated.
- [`ReceiptView.tsx`](../../apps/web/src/components/sale/ReceiptView.tsx) renders
  a null number as `Receipt (number pending)`, not "not assigned". Its success
  message promises a number "shortly", but the inspected allocation paths do not
  backfill an already-completed unnumbered sale. That promise needs copy/policy
  review for legacy receipts, not an assumption that a background allocator exists.
  The mocked browser [`Sale.test.tsx`](../../apps/web/src/pages/__tests__/Sale.test.tsx)
  covers receipt rendering after checkout and held-sale completion; it does not
  prove database allocation or concurrent-write behavior.

## Context

Handoff screen 02 draws `Receipt #24418` — a short number a customer reads out over
the phone. Legacy produced one with `random_int(100000, 999999)` into `sales.sale_id`:
human-readable, and with **no constraint behind it**, so two sales could share a
reference and "which receipt was that" was unanswerable when they did.

The rebuilt `Sale` carried only a cuid. A cuid is right as a primary key and wrong as
the printed reference: it is long, not speakable, carries no order, and the confirmation
screen the phase has to build cannot draw the number the handoff shows from it. So the
column had to be added — which makes its shape a schema decision, not a screen one.

Three candidates were on the table: keep the cuid and drop the printed number, take a
database-wide sequence (`SERIAL`), or give each salon its own counter.

## Decision

1. **`Sale.receiptNumber` is an `Int?`, unique per tenant**
   (`@@unique([tenantId, receiptNumber])`). Uniqueness is scoped to the salon because
   a receipt is shown to one salon's customers; two salons legitimately both issue
   number 1.
2. **The number is allocated by an atomic increment of `Tenant.receiptCounter`,
   inside the sale's own transaction.** Two tills ringing up at the same instant take
   different numbers, and a write that rolls back gives its number back rather than
   burning a gap — the counter moves in the same transaction as the sale.
3. **Numbers are consecutive and increase forever.** No per-day or per-year reset:
   a reset would need the period in the uniqueness rule to stay unique, and neither
   legacy nor the handoff asks for one.
4. **The column is nullable, and stays that way.** A migrated legacy row (Phase 9's
   importer) and a row written while it runs have no number; the receipt reads
   `receiptNumber: null` and the screen shows "not assigned" rather than inventing
   one on read.
5. **The sequence stops at `MAX_RECEIPT_NUMBER` (999 999 999).** Past the ceiling the
   write refuses with `409 RECEIPT_NUMBER_EXHAUSTED` instead of storing a number the
   contract's `saleDetailSchema` (bounded 1…`MAX_RECEIPT_NUMBER`) would refuse to
   parse — an unreadable receipt, caught before anything is charged.

## Why not the alternatives

| Alternative                           | Why it was rejected                                                                                                                                                                          |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Print the cuid, add no column         | The handoff draws a number and legacy's customers were given one. A cuid is not speakable, not ordered, and answers "receipt 24418" with nothing.                                            |
| A `SERIAL` / global sequence          | One counter for the whole platform: a salon's number reveals how much **every** salon has ever sold, and per-tenant uniqueness becomes accidental instead of enforced by an index.           |
| Legacy's `random_int(100000, 999999)` | Exactly the bug being fixed: no uniqueness, no order, and collisions impossible to detect after the fact.                                                                                    |
| A random-but-unique number per sale   | Uniqueness then needs a retry loop against the index, order is lost anyway, and nothing in the design requires randomness — the number identifies one sale to one salon, it is not a secret. |

## Consequences

- **Positive.** Per-tenant uniqueness is a database index, not application luck; a
  concurrent double-till cannot produce two receipts with one number.
- **Positive.** The number reconstructs history: "what was this salon's third sale
  today" has an answer, which legacy's random reference could not give.
- **Negative, accepted.** `Tenant` gains a column updated on every sale, so
  concurrent writes on one salon serialize on that row. Acceptable: it is one
  `UPDATE … RETURNING` inside a transaction already writing the sale, its lines and
  its ledgers.
- **Negative, accepted.** Until the Phase 9 importer assigns numbers, migrated sales
  read `null` and the receipt screen must render an explicit "not assigned" state —
  a branch that exists only for legacy rows.
- **Neutral.** The counter is not resettable from any API. Rotating it is a SQL
  operation, deliberately as un-casual as the unique index makes it risky.

## Enforcement

- Migration `20261005201500_sale_tenders_receipt_number_and_idempotency`
  (committed SQL) adds `sales.receiptNumber`, `tenants.receiptCounter` and the
  `sales_tenantId_receiptNumber_key` unique index.
- `schema.prisma` carries `@@unique([tenantId, receiptNumber])` on `Sale`, and
  `writeSale` in `sale.service.ts` is the **only** allocator: it increments the
  counter and refuses past `MAX_RECEIPT_NUMBER` inside the transaction.
- `saleDetailSchema.receiptNumber` bounds the value on the wire, so a number outside
  1…`MAX_RECEIPT_NUMBER` cannot be serialised at all.
- `apps/api/src/services/sale.service.test.ts` → _"gives each salon its own receipt
  numbers, in order, with no repeats"_ asserts the sequence is consecutive within a
  salon and independent across two.
