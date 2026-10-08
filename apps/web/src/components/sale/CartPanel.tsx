/**
 * The cart panel — the right column of handoff screen 01, visible at all times.
 *
 * A `Card` with one line per `CartLine` component, the sale totals in its body
 * and the take-payment button in its footer. The totals are cents-exact
 * (`lib/money.ts`) and re-derived from the customer on every render, because a
 * customer attached after the search must re-price the cart without searching
 * again — the same reason the search returns both prices.
 *
 * The totals are _estimates until the receipt_: the server re-prices from the
 * catalogue at post time, so the panel totals for display and posts none of
 * it (the schema's "no price" rule).
 */
import { Cart } from "@/components/icons";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import CartLine, { type StaffOption } from "@/components/sale/CartLine";
import { lineUnitPrice, type CartLine as CartLineState } from "@/hooks/useSale";
import { cartTotalCents } from "@/lib/money";
import { formatPrice } from "@/lib/utils";

export interface CartPanelProps {
  lines: CartLineState[];
  /** Whether the sale's customer carries a membership reference. */
  isMember: boolean;
  /** Narrowed picker for one service line: `User.departments ∩ Service.departmentId`. */
  staffForService: (serviceId: string) => StaffOption[];
  /** A granting line forces a customer, or the credit is issued to nobody. */
  needsCustomer: boolean;
  /** The till may look but not ring anything up (suspended salon). */
  disabled: boolean;
  onQuantity: (key: string, quantity: number) => void;
  onStaff: (key: string, staffId: string | undefined) => void;
  onRemove: (key: string) => void;
  onClear: () => void;
  onCheckout: () => void;
}

export default function CartPanel({
  lines,
  isMember,
  staffForService,
  needsCustomer,
  disabled,
  onQuantity,
  onStaff,
  onRemove,
  onClear,
  onCheckout,
}: CartPanelProps) {
  const units = lines.reduce((sum, line) => sum + line.quantity, 0);
  const priced = lines.map((line) => ({
    line,
    unitPrice: lineUnitPrice(line, isMember),
  }));
  const totalCents = cartTotalCents(
    priced.map(({ line, unitPrice }) => ({ unitPrice, quantity: line.quantity })),
  );

  return (
    <Card
      title="Cart"
      description={
        lines.length === 0
          ? "Nothing rung up yet."
          : `${lines.length} ${lines.length === 1 ? "line" : "lines"} · ${units} ${units === 1 ? "item" : "items"}`
      }
      actions={
        lines.length > 0 ? (
          <Button variant="ghost" size="sm" disabled={disabled} onClick={onClear}>
            Clear
          </Button>
        ) : undefined
      }
      footer={
        lines.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <span className="font-bold text-ink">Total</span>
              <span className="text-lg font-heavy text-ink">{formatPrice(totalCents / 100)}</span>
            </div>
            {needsCustomer ? (
              <p className="text-xs text-ink-muted">
                This cart grants a package, credit or gift card — pick a customer before taking
                payment.
              </p>
            ) : null}
            <Button size="lg" disabled={disabled} onClick={onCheckout}>
              Take payment
            </Button>
          </div>
        ) : undefined
      }
    >
      {lines.length === 0 ? (
        <EmptyState
          title="The cart is empty"
          description="Pick a tab, find what the customer asked for, and add it."
          icon={<Cart />}
          className="py-8"
        />
      ) : (
        <ul className="flex flex-col gap-2 px-3 pt-1.5 pb-3">
          {priced.map(({ line, unitPrice }) => (
            <CartLine
              key={`${line.itemType}:${line.itemId}:${line.staffId ?? ""}`}
              line={line}
              unitPrice={unitPrice}
              attribution={line.itemType === "SERVICE" ? "service" : "none"}
              staffOptions={line.itemType === "SERVICE" ? staffForService(line.itemId) : []}
              onQuantity={onQuantity}
              onStaff={onStaff}
              onRemove={onRemove}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}
