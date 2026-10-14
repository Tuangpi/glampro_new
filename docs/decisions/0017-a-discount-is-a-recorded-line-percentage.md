# 0017 — A discount is a recorded line percentage

- **Status:** Accepted
- **Date:** 2026-10-14
- **Deciders:** Phase 5i (line discounts)
- **Related:** [`../STATE.md`](../STATE.md) §4.3 (Q33), [`../legacy/POS-BEHAVIOR.md`](../legacy/POS-BEHAVIOR.md),
  [ADR 0016](0016-a-void-is-a-recorded-whole-sale-reversal.md)

## Context

A salon discounts. Cashiers do it at the counter, and the till has to be able to record
it — but the rebuild's founding rule is the opposite of legacy's:

- **No price crosses the wire.** `saleLineInputSchema` says _what_ was sold and _how
  many_; the server reads the catalogue and decides what it costs. Legacy posted a
  `newPrice` per line and stored it unexamined, so the price a salon charged was the
  price a browser chose.
- **Legacy recorded nothing.** There is no discount column in any of its 42 migrations.
  A discount existed only as the difference between two numbers that were never
  reconciled: an "Update Total Price" modal replaced `paid_amount` with an arbitrary
  figure while `total_amount` kept the list total. Commission was computed from the
  discounted price, so a discount silently reduced what the stylist was paid.
- **The model already says where the truth goes.** `SaleLine.unitPrice` is documented as
  "what one unit sold for **after any discount**" and `lineTotal` as stored rather than
  derived "so a later edit to either factor cannot silently rewrite a historical total".

So the shape of the answer is already in the schema; what is missing is the discount
itself, the arithmetic that keeps cents exact, and three product decisions Q33 lists: the
scope (line or sale), the disclosure on the receipt, and above all **whether commission
is computed on the discounted or the list price**.

## Decision

1. **The discount is a line-level percentage**, recorded per line. A **sale-level**
   discount (Q33's option C) is not built: allocating a cart-wide reduction back to lines
   in cents is real arithmetic with real rounding edges, and "10% off this haircut" is
   what a counter actually asks for. A sale-wide discount is a Phase 7/8 question.
2. **The browser sends a percentage; the server sends money.** `saleLineInputSchema`
   gains `discountPercent`, an integer-or-decimal between 0 and 100. It is the **only**
   number about price a client may send, and it is a rate rather than an amount — so it
   cannot name a price, it can only ask for a reduction of one the server chose. The
   list price still comes from the catalogue.
3. **The discount is applied to the unit price, rounded to the cent, and the line's own
   arithmetic stays exact.** For each line:
   - `discountPerUnit = round(listPrice × percent / 100, 2)`
   - `unitPrice = listPrice − discountPerUnit` — what one unit sold for, which is what
     the column already claims to hold
   - `discountAmount = discountPerUnit × quantity` — the money off the **whole line**
   - `lineTotal = unitPrice × quantity`

   Rounding per unit rather than on the line is what keeps `lineTotal = unitPrice ×
quantity` true by construction, and it means two tills computing the same cart get the
   same numbers with no allocation step to disagree about.

4. **Both the rate and the money are stored** (`discountPercent`, `discountAmount`), for
   the same reason `lineTotal` is: a receipt must stay readable when the rate that
   produced it is reconsidered. A line with no discount stores `0.00` in both, so the
   column is never null and `SUM` works.
5. **The receipt discloses the discount.** Each discounted line carries its rate and its
   amount, and the sale carries the **total discount** — the handoff's own cart draws a
   single `Discount` row, so the confirmation prints one too.
6. **Performance and points follow what the customer actually paid.** A discount reduces
   the line's `lineTotal`, and that is the figure the stylist's performance row and the
   customer's points are derived from. Legacy did the same thing **invisibly**; the
   difference here is that the reduction is recorded on the line and printed on the
   receipt, so it can be seen and added up. Protecting a stylist's pay from discounts is
   a policy with a per-tenant setting behind it, and inventing that rule silently would be
   legacy's mistake the other way round.
7. **Any till user may discount, up to 100%, and every discount is recorded.** There is no
   approver in this slice: approval needs a per-tenant cap and a role rule, which is
   Phase 8's settings surface. What makes that acceptable meanwhile is that the discount
   is never invisible — the rate and the money are on the line, on the receipt, and in
   `GET /api/sales/:id` — and a sale given away can be voided (ADR 0016). A cap with no
   setting behind it would be a number this phase invented.

## Why not the alternatives

| Alternative                                                    | Why it was rejected                                                                                                                                                                                                              |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q33's option A: no discounts                                   | The till keeps its founding rule and builds nothing — and a salon that discounts at the counter (which is what salons do) discounts by editing the catalogue, so the catalogue stops meaning "the price".                        |
| Q33's option C: a sale-level discount as well                  | Allocation arithmetic — a cart-wide reduction has to be spread back over lines in cents, with a rounding remainder to place somewhere. Worth doing, but on top of a line model rather than instead of one.                       |
| Q33's option D: fixed amounts off a line                       | An amount is a **price**, and letting a client send one hands back the thing the till exists to prevent. A percentage cannot exceed the list price; a fixed amount can, and a negative line would have to be refused separately. |
| Sending the discounted unit price (legacy's `newPrice`)        | That is exactly legacy's hole: the browser names what a salon charges. A rate is the most a client may ask for, and the server decides what it means in money.                                                                   |
| Rounding the discount on the line total                        | `lineTotal = unitPrice × quantity` would stop being true, and the receipt would have to explain a cent that fell between two lines. Rounding per unit keeps every stored figure consistent with the others.                      |
| Folding the discount into `unitPrice` and storing nothing else | The receipt could not say _why_ a line is cheap, and a report could not total what a salon gave away — the two things legacy could not answer.                                                                                   |
| Storing only the percentage, deriving the money                | A rate is not reversible into the money that was actually charged once rounding is involved. Both are stored, as `lineTotal` already is.                                                                                         |
| Commission on the list price                                   | It protects the stylist and makes the salon pay a percentage of money it never received. That is a policy for a per-tenant setting, and choosing it here would be as arbitrary as legacy's silent choice the other way.          |
| A discount cap or an approver role                             | Both need a per-tenant setting that does not exist yet (Phase 8). A hard-coded cap would be invented policy; recording every discount keeps the door open for one.                                                               |
| A discount reason per line                                     | A percentage plus the amount is already auditable, and a free-text reason per line is a column the handoff does not draw and a salon will not fill in mid-sale.                                                                  |

## Consequences

- **Positive:** a discount is recordable, printable and summable. "How much did we give
  away this month" is `SUM(discountAmount)` rather than a subtraction between two totals
  that never reconciled.
- **Positive:** the till's rule survives — a client still cannot name a price, and the
  list price on a discounted line is still the catalogue's.
- **Positive:** no new pricing path. A value package and a gift card carry a single price,
  and a discount is a reduction of whatever price the catalogue gave.
- **Negative / accepted:** a cashier can give a line away in full with no approval. That
  is deliberate and recorded rather than invisible, and Phase 8's settings own the cap.
- **Negative / accepted:** a discount reduces the stylist's credited performance and the
  customer's points, because both follow the payable figure. The reduction is on the line
  and on the receipt now, so it is visible — but a salon that wants the list price as the
  commission basis needs the setting this phase did not invent.
- **Neutral:** a sale-level discount will have to allocate to lines when it arrives, which
  is part of why the line columns exist before it does.
- **Neutral:** the cart's own totals were already estimates; a discounted cart is a better
  estimate, and the receipt is still the figure that counts.

## Enforcement

- **The schema:** migration `sale_line_discount` adds `discountPercent Decimal(5,2)` and
  `discountAmount Decimal(12,2)` to `sale_lines`, both defaulting to `0` so the column is
  never null and `SUM` works.
- **The arithmetic:** `priceCart` in `apps/api/src/services/sale.service.ts` is the only
  place a discount becomes money, and it uses `Prisma.Decimal` throughout — no float
  touches a price.
- **The contract:** `saleLineInputSchema.discountPercent` (0–100, optional),
  `saleLineSchema`'s `discountPercent` and `discountAmount`, and
  `saleDetailSchema.discountAmount` — the line's rate and money, and the sale's total.
- **The web:** `lineUnitPrice` in `hooks/useSale.ts` applies the line's rate, so the cart
  line, the `Discount` row and the page's total all agree; `CartLine.tsx` draws the
  control; `cartTotalCents` still does the money in whole cents.
- **Tests:** the API suite asserts the stored penny on a percentage, that the rate, the
  line money and the sale total agree, that a rate above 100 is refused, and that a
  discounted sale still rings up and voids cleanly. The shared suite pins the bounds and
  the line/total shapes; the web suite pins the control, the `Discount` row and the posted
  percentage.
