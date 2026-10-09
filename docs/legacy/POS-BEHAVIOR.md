# Legacy POS behavior — Phase 5 evidence

Read from the Laravel/React checkout on 2026-10-09. This file records what the
old product actually did; it is evidence for product decisions, not an instruction
to reproduce its data-loss and accounting behavior unchanged.

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
