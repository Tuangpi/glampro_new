/**
 * Sale — handoff screens 01 and 02, the till.
 *
 * **MVP slice M1** (`docs/mvp.md`): category tabs → search → grid → cart
 * (quantity, per-line staff) → tender (cash, card, split) → receipt. Hold/resume
 * and void from the till, line discounts, receipt printing, cart persistence and
 * keyboard shortcuts are full-phase work and are not stubbed here.
 *
 * Four things this page decides rather than re-derives:
 *
 * 1. **The tabs are the server's `searchableKinds`.** `/sales/items` omits a kind
 *    whose add-on the salon has not bought and names what is left, so a salon
 *    without Packages gets no Packages tab rather than an empty one. The kinds are
 *    never re-listed here, so the tab row cannot drift from what the API accepts.
 *    One search answers **every** kind (`limit` counts rows *per kind*), so
 *    switching tabs costs no request.
 * 2. **The staff picker is narrowed to the service's branch** — `User.departments`
 *    ∩ `Service.departmentId`, the MVP's service↔staff decision. A service the
 *    salon has not tied to a branch offers the whole team, which is exactly what
 *    `AppointmentFormDrawer` does for a booking (ADR 0013's twin), and the two
 *    reads behind it are the two the booking form already makes.
 * 3. **A granting line forces a customer** (`PACKAGE`, `VALUE_PACKAGE`,
 *    `GIFT_CARD` buy credit for somebody). The dialog refuses to post without one
 *    and the server refuses the same sale, so the cashier is told before counting
 *    notes rather than after.
 * 4. **The receipt replaces the till.** The confirmation screen *is* the receipt
 *    (Phase 5d) and the cart is empty by then, so leaving a grid on screen beside
 *    it would only invite a second sale onto the same receipt.
 */
import { useEffect, useMemo, useState } from "react";

import {
  MAX_SALE_LINES,
  SALE_ITEM_KINDS,
  type CustomerSummary,
  type SaleDetail,
  type SaleItem,
  type SaleItemKind,
  type SalePaymentInput,
} from "@glampro/shared";

import { Search } from "@/components/icons";
import CartPanel from "@/components/sale/CartPanel";
import { type StaffOption } from "@/components/sale/CartLine";
import CustomerPicker from "@/components/sale/CustomerPicker";
import PaymentDialog from "@/components/sale/PaymentDialog";
import ReceiptView from "@/components/sale/ReceiptView";
import SaleItemGrid from "@/components/sale/SaleItemGrid";
import Card from "@/components/ui/Card";
import Tabs from "@/components/ui/Tabs";
import { showToast } from "@/components/ui/toast-store";
import { SALE_KIND_LABELS } from "@/constants/sale";
import { useAuth } from "@/contexts/AuthContext";
import { useServiceList } from "@/hooks/useServices";
import { useStaffList } from "@/hooks/useStaff";
import {
  lineUnitPrice,
  toSaleLineInputs,
  useCreateSale,
  useSaleCart,
  useSaleItems,
} from "@/hooks/useSale";
import { getErrorMessage } from "@/lib/api";
import { cartTotalCents } from "@/lib/money";

/**
 * How many rows a picker reads. The number `AppointmentFormDrawer` uses, and for
 * the same reason: a cashier picks from the salon's own shelf, and a second search
 * box per picker is a request the handoff never asked for.
 */
const LIST_PAGE_SIZE = 200;

/** Typing must not fire a query per keystroke; the box still feels immediate. */
const SEARCH_DEBOUNCE_MS = 300;

/** The kinds that hand something to a customer, and so need one to hand it to. */
const GRANTING_KINDS: ReadonlySet<SaleItemKind> = new Set<SaleItemKind>([
  "PACKAGE",
  "VALUE_PACKAGE",
  "GIFT_CARD",
]);

export default function Sale() {
  const { isReadOnly } = useAuth();

  const [kind, setKind] = useState<SaleItemKind>("SERVICE");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<SaleDetail | null>(null);

  // Typing should not fire a query per keystroke, but the box must still feel
  // immediate, so the term is debounced rather than submitted.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const cart = useSaleCart();
  const createSale = useCreateSale();
  // No `kind` filter: one request answers every searchable kind, and the response
  // names the kinds this salon may sell. See the module comment.
  const items = useSaleItems({ search: search || undefined });
  const services = useServiceList({ page: 1, pageSize: LIST_PAGE_SIZE, status: "ACTIVE" });
  const staff = useStaffList({ page: 1, pageSize: LIST_PAGE_SIZE, status: "active" });

  const isMember = customer?.memberId != null;

  const kinds = items.data?.searchableKinds ?? [];
  // `SERVICE` is the fallback only while the first answer is in flight (the sales
  // module is core, so a service is always sellable): it names the skeleton's
  // `aria-label` and nothing else.
  const activeKind = (kinds.includes(kind) ? kind : kinds[0]) ?? "SERVICE";

  const staffRows = staff.data?.data ?? [];
  const serviceRows = useMemo(() => services.data?.data ?? [], [services.data]);
  const departmentOfService = useMemo(
    () => new Map(serviceRows.map((service) => [service.id, service.departmentId])),
    [serviceRows],
  );

  /**
   * The people a service line may be credited to.
   *
   * One the salon has not tied to a branch offers the whole team — the rule
   * `AppointmentFormDrawer` applies too, because a branch-less service has no
   * department to intersect with.
   */
  function staffForService(serviceId: string): StaffOption[] {
    const departmentId = departmentOfService.get(serviceId);
    if (departmentId === null || departmentId === undefined) return staffRows;
    return staffRows.filter((person) =>
      person.departments.some((link) => link.id === departmentId),
    );
  }

  // The page's own estimate of the cart total, derived through the same
  // `lineUnitPrice` the panel draws with so the two cannot disagree. The server
  // re-prices from the catalogue regardless (the schema's "no price" rule).
  const totalCents = cartTotalCents(
    cart.lines.map((line) => ({
      unitPrice: lineUnitPrice(line, isMember),
      quantity: line.quantity,
    })),
  );
  const needsCustomer = cart.lines.some((line) => GRANTING_KINDS.has(line.itemType));

  function handleAdd(item: SaleItem) {
    // A suspended salon may look but not write (TENANCY.md §6). The API would
    // refuse the sale at the end of the cart, but filling one first would be a
    // till that lets a cashier take someone's money and then fails.
    if (isReadOnly) {
      showToast("error", "This salon's subscription is suspended, so the till cannot take money.");
      return;
    }

    // No staff at add time: who performed a service is the cashier's pick on the
    // line itself, and pre-choosing one would attribute work nobody claimed.
    const added = cart.addItem(item, undefined, isMember);
    if (!added) {
      showToast("info", `The cart holds at most ${MAX_SALE_LINES} lines. Remove one to add this.`);
    }
  }

  function openCheckout() {
    setCheckoutError(null);
    setCheckoutOpen(true);
  }

  async function takePayment(payments: SalePaymentInput[], idempotencyKey: string) {
    setCheckoutError(null);
    try {
      const sale = await createSale.mutateAsync({
        ...(customer ? { customerId: customer.id } : {}),
        lines: toSaleLineInputs(cart.lines),
        payments,
        // Q16: the key of *this* attempt, so a double-tap cannot ring the sale up
        // twice (see `PaymentDialog`).
        idempotencyKey,
      });
      // The cart is cleared by `useCreateSale`'s own success handler, so the rail
      // badge drops with the sale rather than waiting for the receipt to close.
      setCheckoutOpen(false);
      setReceipt(sale);
      showToast(
        "success",
        sale.receiptNumber === null
          ? "Sale rung up."
          : `Sale rung up as receipt #${sale.receiptNumber}.`,
      );
    } catch (error) {
      // Stay open: the message belongs beside the tenders it refused, and a retry
      // keeps this attempt's key.
      setCheckoutError(getErrorMessage(error));
    }
  }

  /** Back to an empty till. The cart is already empty — the sale consumed it. */
  function startNewSale() {
    setReceipt(null);
    setCheckoutOpen(false);
    setCheckoutError(null);
    setCustomer(null);
    setSearchInput("");
    setSearch("");
    setKind("SERVICE");
  }

  /** One tab's grid. `Tabs` renders only the active panel, so one is ever mounted. */
  function gridFor(itemKind: SaleItemKind) {
    return (
      <SaleItemGrid
        kind={itemKind}
        items={(items.data?.items ?? []).filter((item) => item.kind === itemKind)}
        isPending={items.isPending}
        isError={items.isError}
        search={search}
        isMember={isMember}
        onAdd={handleAdd}
        onRetry={() => void items.refetch()}
        onClearSearch={() => {
          setSearchInput("");
          setSearch("");
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h2 className="text-xl">Sale</h2>
        <p className="mt-1 text-sm text-ink-muted">
          {receipt
            ? "Rung up. This is the receipt the salon keeps."
            : "The grid shows what the search returned; the server charges what the catalogue says."}
        </p>
      </header>

      {/* After a sale the till is gone until "New sale" — see the module comment. */}
      {receipt ? (
        <ReceiptView sale={receipt} onNewSale={startNewSale} />
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex flex-col gap-4">
            <Card
              title="Customer"
              description="A walk-in sale needs nobody. A package, a card or prepaid credit does."
            >
              <div className="px-2 py-1">
                <CustomerPicker customer={customer} onSelect={setCustomer} disabled={isReadOnly} />
              </div>
            </Card>

            <section
              aria-label="Items to sell"
              className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4"
            >
              <div className="relative">
                <Search
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-muted"
                />
                <input
                  type="search"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search services, products, packages…"
                  aria-label="Search the catalogue"
                  className="h-control w-full rounded-md border border-line bg-surface pr-3 pl-9 text-sm text-ink transition-colors placeholder:text-ink-muted focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-purple"
                />
              </div>

              {kinds.length > 0 ? (
                <Tabs
                  label="Item categories"
                  activeId={activeKind}
                  onChange={(id) => {
                    const next = SALE_ITEM_KINDS.find((candidate) => candidate === id);
                    if (next) setKind(next);
                  }}
                  items={kinds.map((itemKind) => ({
                    id: itemKind,
                    label: SALE_KIND_LABELS[itemKind],
                    content: gridFor(itemKind),
                  }))}
                />
              ) : (
                // An empty tab row means the first search has not answered or
                // failed — the kinds the salon may sell are the server's answer,
                // and guessing them here is the drift this page exists to avoid.
                // The grid below says which of the two it is.
                gridFor(activeKind)
              )}
            </section>
          </div>

          <CartPanel
            lines={cart.lines}
            isMember={isMember}
            staffForService={staffForService}
            needsCustomer={needsCustomer}
            disabled={isReadOnly}
            onQuantity={cart.setQuantity}
            onStaff={cart.setStaff}
            onRemove={cart.removeLine}
            onClear={cart.clearCart}
            onCheckout={openCheckout}
          />
        </div>
      )}

      {checkoutOpen ? (
        <PaymentDialog
          totalCents={totalCents}
          hasCustomer={customer !== null}
          needsCustomer={needsCustomer}
          isPending={createSale.isPending}
          errorMessage={checkoutError}
          onClose={() => setCheckoutOpen(false)}
          onConfirm={(payments, key) => void takePayment(payments, key)}
        />
      ) : null}
    </div>
  );
}
