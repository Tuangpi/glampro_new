/**
 * The receipt — handoff screen 02's confirmation, drawn from the body
 * `POST /api/sales` returned.
 *
 * **This screen *is* the receipt** (`docs/roadmap.md` → Phase 5d), which is why
 * the API answers the write with the whole `saleDetailSchema` instead of a bare
 * id: there is no second read and no second representation that could disagree
 * with what was stored. `GET /api/sales/:id` returns the same shape, so re-opening
 * a past sale draws through this component unchanged (full phase).
 *
 * Every number here is the **server's**, formatted for display and never
 * recomputed: the cart's totals were estimates from the prices the search
 * returned, while the receipt is what the catalogue actually charged. `Change` is
 * the one subtraction — `paidAmount - totalAmount` — and it is drawn as an
 * outstanding balance instead when it runs the other way, because a short tender
 * is a debt (`CustomerOutstanding`) and not negative change.
 */
import type { SaleDetail } from "@glampro/shared";

import { Banknote, CheckCircle, Printer } from "@/components/icons";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import { PAYMENT_METHOD_BADGE, PAYMENT_METHOD_LABELS } from "@/constants/sale";
import { priceToCents } from "@/lib/money";
import { formatDateTime, formatPrice } from "@/lib/utils";

export interface ReceiptViewProps {
  sale: SaleDetail;
  /** Clears the receipt and returns the till to an empty cart. */
  onNewSale: () => void;
}

export default function ReceiptView({ sale, onNewSale }: ReceiptViewProps) {
  const changeCents = priceToCents(sale.paidAmount) - priceToCents(sale.totalAmount);

  return (
    <div className="flex flex-col gap-6">
      <Card
        title={`Receipt ${sale.receiptNumber === null ? "(number pending)" : `#${sale.receiptNumber}`}`}
        description={`${formatDateTime(sale.soldAt)} · ${sale.customerName ?? "Walk-in"} · rung up by ${sale.staffName ?? "the till"}`}
        actions={
          // Printing is full-phase work (`docs/mvp.md` → M1 deferred). The control is
          // drawn disabled with a reason rather than left out, so the cashier can see
          // the capability is planned rather than wonder where it went.
          <Button variant="secondary" size="sm" disabled title="Receipt printing is not built yet">
            <Printer aria-hidden />
            Print
          </Button>
        }
        footer={
          <div className="flex items-center justify-between gap-4">
            <Button variant="secondary" onClick={onNewSale}>
              New sale
            </Button>
            <div className="text-right">
              <p className="text-xs text-ink-muted">Total</p>
              <p className="text-lg font-heavy text-ink">{formatPrice(sale.totalAmount)}</p>
            </div>
          </div>
        }
      >
        <ul aria-label="Items sold" className="flex flex-col">
          {sale.lines.map((line) => (
            <li
              key={line.id}
              className="flex items-start justify-between gap-4 border-b border-line-soft px-1 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="truncate font-bold text-ink">{line.itemName}</p>
                <p className="text-xs text-ink-muted">
                  {line.quantity} × {formatPrice(line.unitPrice)}
                  {line.staffName ? ` · ${line.staffName}` : ""}
                </p>
              </div>
              <p className="shrink-0 font-heavy text-ink">{formatPrice(line.lineTotal)}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="Payment">
        <dl className="grid gap-3 px-1 pt-2 sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-ink-muted">Items</dt>
            <dd className="font-bold text-ink">{sale.totalQuantity}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-ink-muted">Points earned</dt>
            <dd className="font-bold text-ink">{sale.pointsEarned}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-ink-muted">Paid</dt>
            <dd className="font-bold text-ink">{formatPrice(sale.paidAmount)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-ink-muted">
              {changeCents >= 0 ? "Change" : "Outstanding"}
            </dt>
            <dd className={changeCents >= 0 ? "font-bold text-ink" : "font-bold text-danger"}>
              {formatPrice(Math.abs(changeCents) / 100)}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2 px-1 pb-1">
          <span className="text-sm text-ink-muted">Tenders</span>
          {sale.payments.length === 0 ? (
            // `payments: []` is a legal sale — the whole balance was left on the
            // customer's account — so this says so rather than drawing nothing.
            <Badge variant="neutral">Nothing tendered — on the account</Badge>
          ) : (
            sale.payments.map((payment, index) => (
              <Badge
                key={`${payment.method}-${index}`}
                variant={PAYMENT_METHOD_BADGE[payment.method]}
                dot
              >
                {PAYMENT_METHOD_LABELS[payment.method]} {formatPrice(payment.amount)}
              </Badge>
            ))
          )}
        </div>

        {sale.note ? (
          <p className="mt-3 rounded-md bg-surface-2 px-4 py-3 text-sm text-ink-body">
            {sale.note}
          </p>
        ) : null}
      </Card>

      <p
        role="status"
        className="flex items-center gap-2 rounded-card border border-line bg-success-soft px-4.5 py-3.5 text-sm text-success-text"
      >
        <CheckCircle aria-hidden className="shrink-0" />
        {sale.receiptNumber === null
          ? "The sale is rung up. It will get a receipt number shortly."
          : `Sale rung up as receipt #${sale.receiptNumber}.`}
        <Banknote aria-hidden className="ml-auto shrink-0 text-ink-muted" />
      </p>
    </div>
  );
}
