/**
 * The tender step — handoff screen 02's payment sheet.
 *
 * One payer, one row per tender: cash, card, or a split is two rows, which is
 * how `createSaleSchema` models money (`payments[]`, legacy's three endpoints
 * collapsed into one array). Everything here is **whole cents**
 * (`lib/money.ts`), because the till's total and the tenders added up must agree
 * to the cent before anything is posted.
 *
 * **The idempotency key is minted here, once per attempt** (Q16,
 * `lib/idempotency.ts`). The page mounts this dialog on open and unmounts it on
 * close, so:
 *
 * - a double-tap on "Take payment" reuses the key and the API returns the sale
 *   that already exists rather than charging twice;
 * - a genuine refusal (a 422, a suspended salon) is fixed and retried with the
 *   same key, which is safe because nothing was written for it.
 *
 * Two rules the dialog states rather than lets the server discover:
 *
 * - **A shortfall is only allowed when the sale has a customer.** The API
 *   records the balance against the customer (`CustomerOutstanding`); with no
 *   customer there is nowhere for it to go, so the tender has to cover the
 *   total. Overpaying is always fine — that is change, not a credit.
 * - **A cart that grants credit needs a customer** before payment, because the
 *   server refuses that sale whole (`createSale`'s `GRANTING_KINDS` check) and
 *   the cashier should know before they start counting notes.
 */
import { useState } from "react";

import { MAX_SALE_PAYMENTS, type SalePaymentInput, type SalePaymentMethod } from "@glampro/shared";

import { Plus, Trash } from "@/components/icons";
import Button from "@/components/ui/Button";
import { CONTROL_CLASS } from "@/components/ui/Field";
import IconButton from "@/components/ui/IconButton";
import Modal from "@/components/ui/Modal";
import Select from "@/components/ui/Select";
import { PAYMENT_METHOD_OPTIONS } from "@/constants/sale";
import { newIdempotencyKey } from "@/lib/idempotency";
import { centsToPrice, priceToCents } from "@/lib/money";
import { cn, formatPrice } from "@/lib/utils";

/** One row of the sheet, as typed. Amounts stay strings until they are posted. */
interface TenderDraft {
  id: number;
  method: SalePaymentMethod;
  amount: string;
}

export interface PaymentDialogProps {
  /** The cart total in whole cents, derived the same way the cart panel draws it. */
  totalCents: number;
  /** Whether the sale has a customer — a balance can only be owed to somebody. */
  hasCustomer: boolean;
  /** The cart holds a package, value package or gift card, so it needs a customer. */
  needsCustomer: boolean;
  /** The write is in flight; every control is frozen so one attempt stays one attempt. */
  isPending: boolean;
  /** The server's refusal, shown above the tenders. */
  errorMessage: string | null;
  onClose: () => void;
  onConfirm: (payments: SalePaymentInput[], idempotencyKey: string) => void;
}

let nextTenderId = 1;

export default function PaymentDialog({
  totalCents,
  hasCustomer,
  needsCustomer,
  isPending,
  errorMessage,
  onClose,
  onConfirm,
}: PaymentDialogProps) {
  // One key per mount, i.e. per attempt — see the module comment.
  const [idempotencyKey] = useState(newIdempotencyKey);
  // One tender, pre-filled with the exact total: the overwhelmingly common case
  // is a customer handing over the whole amount in one way.
  const [tenders, setTenders] = useState<TenderDraft[]>(() => [
    { id: nextTenderId++, method: "CASH", amount: centsToPrice(totalCents) },
  ]);

  const paidCents = tenders.reduce((sum, tender) => sum + priceToCents(tender.amount), 0);
  const remainingCents = totalCents - paidCents;

  const hasBadAmount = tenders.some((tender) => !/^\d*\.?\d{0,2}$/.test(tender.amount.trim()));
  const blockedByCustomer = needsCustomer && !hasCustomer;

  /**
   * Why the sale cannot be posted yet, or `null` when it can. Rendered as the
   * sentence beside the buttons *and* used to disable them, so the reason for a
   * refusal is never a mystery.
   */
  const blocker = blockedByCustomer
    ? "Pick a customer first — this cart grants credit, which has to belong to somebody."
    : hasBadAmount
      ? "Enter an amount for every tender."
      : remainingCents > 0 && !hasCustomer
        ? `The tenders are ${formatPrice(centsToPrice(remainingCents))} short and there is no customer to carry the balance.`
        : null;

  function setTender(id: number, patch: Partial<TenderDraft>) {
    setTenders((current) =>
      current.map((tender) => (tender.id === id ? { ...tender, ...patch } : tender)),
    );
  }

  function addTender() {
    setTenders((current) => [...current, { id: nextTenderId++, method: "CARD", amount: "" }]);
  }

  function removeTender(id: number) {
    setTenders((current) => current.filter((tender) => tender.id !== id));
  }

  /** "Rest" — what a split needs after the first tender has been typed. */
  function fillRemaining(id: number) {
    setTender(id, { amount: centsToPrice(Math.max(remainingCents, 0)) });
  }

  function submit() {
    onConfirm(
      tenders.map((tender) => ({
        method: tender.method,
        // Rounded through cents, so a typed "12.5" posts as 12.50.
        amount: Number(centsToPrice(priceToCents(tender.amount))),
      })),
      idempotencyKey,
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Take payment"
      description="How the money was handed over. A split is two tenders."
      size="md"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-ink-muted">
            {blocker ??
              (remainingCents < 0
                ? `Change to give: ${formatPrice(centsToPrice(-remainingCents))}`
                : remainingCents === 0
                  ? "Paid in full."
                  : `${formatPrice(centsToPrice(remainingCents))} will be left on the customer's account.`)}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={isPending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={isPending} disabled={blocker !== null}>
              Take payment
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {errorMessage ? (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
            {errorMessage}
          </p>
        ) : null}

        <div className="flex items-baseline justify-between rounded-md bg-surface-2 px-4 py-3">
          <span className="text-sm font-bold text-ink-body">Total due</span>
          <span className="text-lg font-heavy text-ink">
            {formatPrice(centsToPrice(totalCents))}
          </span>
        </div>

        <ul aria-label="Tenders" className="flex flex-col gap-3">
          {tenders.map((tender, index) => (
            <li
              key={tender.id}
              className="flex items-end gap-2 rounded-md border border-line-soft bg-surface p-3"
            >
              <Select
                label={`Tender ${index + 1}`}
                value={tender.method}
                disabled={isPending}
                onChange={(event) =>
                  setTender(tender.id, { method: event.target.value as SalePaymentMethod })
                }
                options={PAYMENT_METHOD_OPTIONS}
                className="w-40"
              />

              {/* A raw input rather than `Input`: the amount is one of four controls
                  in a row whose label already names the tender, and the accessible
                  name carries that number so a screen reader still hears which row
                  this box belongs to. */}
              <label className="flex flex-1 flex-col gap-1.5">
                <span className="text-xs font-bold text-ink-body">Amount</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={tender.amount}
                  disabled={isPending}
                  aria-label={`Amount for tender ${index + 1}`}
                  onChange={(event) => setTender(tender.id, { amount: event.target.value })}
                  className={cn(CONTROL_CLASS, "h-control px-3 text-right")}
                />
              </label>

              <Button
                variant="ghost"
                size="sm"
                disabled={isPending || remainingCents <= 0}
                onClick={() => fillRemaining(tender.id)}
              >
                Rest
              </Button>

              {tenders.length > 1 ? (
                <IconButton
                  label={`Remove tender ${index + 1}`}
                  icon={<Trash />}
                  variant="outline"
                  disabled={isPending}
                  onClick={() => removeTender(tender.id)}
                />
              ) : (
                // Keeps the row's height and the last column steady, so adding a
                // second tender does not shift the first one's controls.
                <span aria-hidden className="h-control w-control shrink-0" />
              )}
            </li>
          ))}
        </ul>

        {tenders.length < MAX_SALE_PAYMENTS ? (
          <Button variant="secondary" size="sm" onClick={addTender} disabled={isPending}>
            <Plus aria-hidden />
            Add another tender
          </Button>
        ) : null}
      </div>
    </Modal>
  );
}
