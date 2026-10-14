# Legacy POS behavior — Phase 5 evidence

Read from the Laravel/React checkout on 2026-10-09, and re-read on 2026-10-14 from
the sibling checkout [`LEGACY-MAP.md`](LEGACY-MAP.md) §1 now records. This file
records what the old product actually did; it is evidence for product decisions, not
an instruction to reproduce its data-loss and accounting behavior unchanged.

## Cart persistence

The legacy browser persisted the entire `saleInfo` Redux reducer through
`redux-persist` using browser `localStorage` (`front-end/src/Redux/store.ts`, key
`sale`). That state included the selected customer, every cart collection,
quantities, edited prices, employee attribution, outstanding amounts, a loaded
sale id and deleted edit items. Opening `/sale` redirected immediately to the
persisted customer's till when that customer still existed; otherwise it cleared
the unfinished sale.

This is **one browser draft**, not a named multi-sale queue. There is no legacy
list of parked carts and no operator/tenant namespace in the storage key.

## Server-side hold and resume

The database has `sales.sale_status` with `0=hold, 1=done`. The cash-sale handler
accepts `isHoldSale`; a held sale is inserted as a real `sales` row and its item
rows are inserted, but product stock is not decremented. The Today's Sales screen
labels status `0` as “Hold Sale”.

Resume was intended to reuse the completed-sale edit path: load
`GET /api/sale/edit/{sale_id}` into the persisted reducer, then post
`/api/sale/update/{sale_id}`. The current Today's Sales edit control is commented
out, so the checked-in UI does **not** expose a working resume action even though
the controller contains update logic. The rebuild therefore must decide whether
“hold” means a durable server draft, how held rows appear, and when inventory and
other ledgers move; those rules cannot be inferred from a working legacy flow.

## Delete / “void”

The old Today's Sales screen calls `DELETE /api/sale/delete/{sale_id}` after a
confirmation dialog. The controller performs a direct Eloquent `delete()` on the
sale. There is no void status, reason, author, timestamp or audit entry in this
path, and the controller itself does not reverse stock, payments, customer credit,
commissions or performance rows. This is destructive deletion, not an auditable
retail void, and should not be copied as the rebuild's definition.

## Discounts / price editing

The legacy cart lets the cashier replace each line's `newPrice` directly. It also
has an “Update Total Price” modal that replaces `updatedTotalPayableAmount` with an
arbitrary number. Neither mechanism records a discount type, amount, reason or
approver; the changed value becomes the paid price. The rebuild currently refuses
browser-supplied prices and re-prices from the catalogue, so a discount feature
needs an explicit contract and ledger semantics rather than reviving this trust
boundary.

## Receipt printing

Two authenticated endpoints generate a DomPDF download from the `invoice` view:
`GET /api/print/receipt/{sale_id}` after payment and
`GET /api/print/to-day-sale/{sale_id}` from Today's Sales. The React client fetches
the PDF as a blob and opens the object URL in a new tab; it does not call
`window.print()` or directly address a receipt printer.

**The rebuild deliberately does the opposite.** Legacy needed a server round-trip
because its receipt was not on screen when printing was offered (Today's Sales
reprint). The rebuild's receipt _is_ the drawn confirmation — every number on it is
the server's, already in the DOM — so slice 5f wires Print to `window.print()` and
excludes the app chrome with `print:hidden`. That covers a physical printer and
"Save as PDF" with no PDF library and no extra endpoint; server-side PDF stays
reporting-phase work (`docs/architecture.md`).

## Keyboard behavior

No global `keydown`/`keyup`, key-code map or cashier shortcut layer exists in the
legacy POS source. The only relevant keyboard behavior found is Enter selecting
the first matching customer in the customer search. Full keyboard shortcuts are
therefore a new product/accessibility design, not a compatibility behavior.

## Rebuild consequence

The first safe full-Phase-5 slice is reload persistence, because its expected
behavior is concrete and independent of accounting. The rebuild persists only the
unfinished cart metadata and selected customer, scoped by tenant and user. It does
not persist tenders or idempotency keys, and the API remains authoritative for
catalogue prices. Hold/resume, void and discounts remain explicit product
decisions.

## Verified again on 2026-10-14 — the code paths, with line numbers

Re-read at the sibling checkout for the Q31–Q33 drafts ([`../STATE.md`](../STATE.md)
§4.3). Everything above still holds; these are the lines that carry it, plus four
findings the first pass did not have.

**Hold.** `SaleController::payByCash` sets `sale_status = $request->isHoldSale ? 0 : 1`
and `payment_status = 1` **in both cases** — a held sale is marked paid — allocates
`sale_id = random_int(100000, 999999)` at insert, and calls
`insertProduct($sale_id, $product, $request->user(), $request->isHoldSale)`, which
skips `decrement('quantity')` when holding. `sale_status` is read in exactly **one**
place in the whole checkout — `front-end/src/pages/user/sale/TodaySale.tsx` and its
`types/dbTypes.ts` — and in no report, so a held sale counted in legacy's totals
exactly like a completed one.

**Resume is incoherent, not merely hidden.** `SaleController::update` saves
`sale_status = 1` _before_ it walks the lines, and the two status tests it then
performs read that same column: `if ($sale_product->sale->sale_status == 1) { // if
hold sale skip` in the deleted-items loop, and in the line-edit branch
`if (… == 1) { quantity = quantity + oldQty − newQty } else { quantity = quantity −
newQty }`. The "hold" branch is therefore unreachable on that path, and the branch
that runs _restores_ stock a hold never removed — resuming a hold and editing a line
**increases** `products.quantity`. `TodaySale.tsx` does ship an Edit control, but it
sits inside a JSX comment (`{/* … */}`); the live control beside it is Delete. So
there is no working legacy resume flow to copy, only a payload
(`GET /api/sale/edit/{sale_id}`, a full eager-loaded sale) and an update that the
shipped UI never reaches.

**Delete.** `TodaySaleController::destroy` is two statements —
`Sale::where('id', $sale_id)->where('company_id', …)->first()` then `$sale->delete()` —
behind a live Delete button, answering `204 delete success`. It does not read
`sale_status`, so a completed sale is deleted as readily as a hold;
`sale_products.sale_id` is declared `->onDelete('cascade')`, so the line rows go with
it, while nothing touches stock, tenders, `customer_points`, `customer_outstandings`,
commissions or performance rows. No `void`, `deleted_at` or reason column exists in
any of the 42 migrations.

**Discounts.** The migration set has **no discount column and no tax/VAT column**
(`grep -rn 'vat\|tax' database/migrations` is empty), so the two client-supplied
values are the whole mechanism: per-line `newPrice` → `paid_price`, and
`updatedTotalPayableAmount` → `paid_amount` while `total_amount` keeps the list
total. The consequence that is easy to miss: `insertEmployeeCommission` is called
with `$product['newPrice']` — and with the package, value-package and service
equivalents — so **a legacy discount silently reduced the stylist's commission**.
