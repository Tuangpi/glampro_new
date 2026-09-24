import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { createSaleRequestSchema, paymentMethods } from '@glampro/contracts';
import type {
  CreateSaleRequest,
  CustomerSummary,
  PaymentMethod,
  ProductSummary,
  SaleSummary,
  ServiceSummary,
  StaffProfileSummary,
} from '@glampro/contracts';
import { PageHeader } from '../../components/layout/PageHeader';
import {
  apiErrorMessage,
  createSale,
  fetchCustomers,
  fetchInventoryLevels,
  fetchProducts,
  fetchSales,
  fetchServices,
  fetchStaffProfiles,
  refundSale,
  voidSale,
} from '../../lib/api';
import { formatDateTime, formatSgd } from '../../lib/format';
import { useAuth } from '../auth/useAuth';
import {
  Field,
  PermissionNotice,
  SectionCard,
  StatusMessage,
  inputClass,
  primaryButtonClass,
  subtleButtonClass,
} from '../shared/FormControls';
import {
  cartTotals,
  displayStaffName,
  fromCents,
  paymentMethodLabels,
  saleStatusLabels,
  saleStatusTone,
  toCents,
  type CartLine,
} from './saleView';

type PaymentDraft = { method: PaymentMethod; amount: string; reference: string };

const emptyPayment = (amount = ''): PaymentDraft => ({ method: 'CASH', amount, reference: '' });
const customerName = (customer: CustomerSummary) =>
  [customer.firstName, customer.lastName].filter(Boolean).join(' ');
const lineKey = (line: CartLine) =>
  line.type === 'SERVICE'
    ? `SERVICE:${line.item.id}:${line.staffProfileId ?? ''}`
    : `PRODUCT:${line.item.id}`;

export const SalesPage = () => {
  const { hasPermission, activeMembership, locations } = useAuth();
  const canRead = hasPermission('sales.read');
  const canReadInventory = hasPermission('inventory.read');
  const canReadStaff = hasPermission('staff.read');
  const canCreate = hasPermission('sales.create');
  const canVoid = hasPermission('sales.void');
  const canRefund = hasPermission('sales.refund');
  const [locationId, setLocationId] = useState('');
  const [services, setServices] = useState<ServiceSummary[]>([]);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [inventory, setInventory] = useState<Record<string, number>>({});
  const [staff, setStaff] = useState<StaffProfileSummary[]>([]);
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [staffId, setStaffId] = useState('');
  const [catalogQuery, setCatalogQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payments, setPayments] = useState<PaymentDraft[]>([emptyPayment()]);
  const [notes, setNotes] = useState('');
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [selectedSale, setSelectedSale] = useState<SaleSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<PaymentMethod>('CASH');

  const activeLocation =
    locations.find((location) => location.id === locationId) ?? locations[0] ?? null;
  const totals = useMemo(() => cartTotals(cart), [cart]);

  const loadSales = useCallback(
    (targetLocationId: string) => {
      if (targetLocationId === '') return;
      setLoading(true);
      const inventoryRequest = canReadInventory
        ? fetchInventoryLevels({ locationId: targetLocationId })
        : Promise.resolve({ inventoryLevels: [] });
      Promise.all([fetchSales({ locationId: targetLocationId }), inventoryRequest])
        .then(([saleData, levelData]) => {
          setSales(saleData.sales);
          setInventory(
            Object.fromEntries(
              levelData.inventoryLevels.map((level) => [level.productId, level.quantityOnHand]),
            ),
          );
          setError(null);
        })
        .catch((loadError: unknown) => setError(apiErrorMessage(loadError)))
        .finally(() => setLoading(false));
    },
    [canReadInventory],
  );

  useEffect(() => {
    if (activeLocation !== null && locationId === '') setLocationId(activeLocation.id);
  }, [activeLocation, locationId]);

  useEffect(() => {
    if (!canRead) return;
    const staffRequest = canReadStaff
      ? fetchStaffProfiles({ isActive: true })
      : Promise.resolve({ staffProfiles: [] });
    Promise.all([fetchServices(), fetchProducts(), staffRequest])
      .then(([serviceData, productData, staffData]) => {
        setServices(serviceData.services.filter((service) => service.isAvailable));
        setProducts(productData.products.filter((product) => product.isAvailable));
        setStaff(staffData.staffProfiles);
      })
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, [canRead, canReadStaff]);

  useEffect(() => {
    if (canRead && locationId !== '') loadSales(locationId);
  }, [canRead, loadSales, locationId]);

  useEffect(() => {
    if (staffId === '' && staff[0]) setStaffId(staff[0].id);
  }, [staff, staffId]);

  const searchCustomers = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      const result = await fetchCustomers(
        customerQuery.trim() === '' ? { limit: 20 } : { q: customerQuery.trim(), limit: 20 },
      );
      setCustomers(result.customers.filter((customer) => customer.isActive));
    } catch (searchError) {
      setError(apiErrorMessage(searchError));
    }
  };

  const addService = (service: ServiceSummary) => {
    setCart((current) => {
      const existing = current.find(
        (line) =>
          line.type === 'SERVICE' &&
          line.item.id === service.id &&
          line.staffProfileId === (staffId || null),
      );
      if (existing)
        return current.map((line) =>
          line === existing ? { ...line, quantity: line.quantity + 1 } : line,
        );
      return [
        ...current,
        {
          type: 'SERVICE',
          item: service,
          quantity: 1,
          staffProfileId: staffId || null,
        } satisfies CartLine,
      ];
    });
  };

  const addProduct = (product: ProductSummary) => {
    setCart((current) => {
      const existing = current.find(
        (line) => line.type === 'PRODUCT' && line.item.id === product.id,
      );
      if (existing)
        return current.map((line) =>
          line === existing ? { ...line, quantity: line.quantity + 1 } : line,
        );
      return [...current, { type: 'PRODUCT', item: product, quantity: 1 } satisfies CartLine];
    });
  };

  const changeQuantity = (key: string, delta: number) => {
    setCart((current) =>
      current.flatMap((line) => {
        if (lineKey(line) !== key) return [line];
        const quantity = line.quantity + delta;
        return quantity > 0 ? [{ ...line, quantity }] : [];
      }),
    );
  };

  const clearCart = () => {
    setCart([]);
    setPayments([emptyPayment()]);
    setNotes('');
  };

  const checkout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (!activeLocation || cart.length === 0) {
      setError('Add at least one catalog item before checking out.');
      return;
    }

    const input: CreateSaleRequest = {
      locationId: activeLocation.id,
      customerId: customerId || null,
      notes: notes.trim() || null,
      lines: cart.map((line) =>
        line.type === 'SERVICE'
          ? {
              type: 'SERVICE',
              serviceId: line.item.id,
              quantity: line.quantity,
              staffProfileId: line.staffProfileId,
              discountInCents: 0,
            }
          : {
              type: 'PRODUCT',
              productId: line.item.id,
              quantity: line.quantity,
              discountInCents: 0,
            },
      ),
      payments: payments.map((payment) => ({
        method: payment.method,
        amountInCents: toCents(payment.amount),
        reference: payment.reference.trim() || null,
      })),
    };
    const parsed = createSaleRequestSchema.safeParse(input);
    if (!parsed.success) {
      setError('Check the cart quantities and enter a positive amount for every payment.');
      return;
    }

    setPending(true);
    try {
      const result = await createSale(parsed.data);
      setSelectedSale(result.sale);
      setNotice(`Receipt ${result.sale.receiptCode} issued.`);
      clearCart();
      setPayments([emptyPayment(fromCents(result.sale.totalInCents))]);
      loadSales(activeLocation.id);
    } catch (checkoutError) {
      setError(apiErrorMessage(checkoutError));
    } finally {
      setPending(false);
    }
  };

  const updatePayment = (index: number, patch: Partial<PaymentDraft>) => {
    setPayments((current) =>
      current.map((payment, paymentIndex) =>
        paymentIndex === index ? { ...payment, ...patch } : payment,
      ),
    );
  };

  const submitVoid = async () => {
    if (!selectedSale || !canVoid || voidReason.trim() === '') return;
    setPending(true);
    setError(null);
    try {
      const result = await voidSale(selectedSale.id, { reason: voidReason.trim() });
      setSelectedSale(result.sale);
      setVoidReason('');
      setNotice(`Receipt ${result.sale.receiptCode} was voided.`);
      loadSales(result.sale.locationId);
    } catch (voidError) {
      setError(apiErrorMessage(voidError));
    } finally {
      setPending(false);
    }
  };

  const submitRefund = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSale || !canRefund) return;
    setPending(true);
    setError(null);
    try {
      const result = await refundSale(selectedSale.id, {
        amountInCents: toCents(refundAmount),
        method: refundMethod,
        reason: refundReason.trim(),
        reference: null,
        returns: [],
      });
      setSelectedSale(result.sale);
      setRefundAmount('');
      setRefundReason('');
      setNotice(`Refund recorded for receipt ${result.sale.receiptCode}.`);
      loadSales(result.sale.locationId);
    } catch (refundError) {
      setError(apiErrorMessage(refundError));
    } finally {
      setPending(false);
    }
  };

  const CatalogList = ({
    services,
    products,
    inventory,
    query,
    onService,
    onProduct,
  }: {
    services: ServiceSummary[];
    products: ProductSummary[];
    inventory: Record<string, number>;
    query: string;
    onService: (service: ServiceSummary) => void;
    onProduct: (product: ProductSummary) => void;
  }) => {
    const normalized = query.trim().toLowerCase();
    const matchingServices = services.filter((service) =>
      service.name.toLowerCase().includes(normalized),
    );
    const matchingProducts = products.filter((product) =>
      product.name.toLowerCase().includes(normalized),
    );

    return (
      <div className="grid gap-5 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-extrabold">Services</h3>
            <span className="text-[11px] font-bold text-muted">
              {matchingServices.length} available
            </span>
          </div>
          <div className="grid gap-2">
            {matchingServices.map((service) => (
              <button
                key={service.id}
                type="button"
                onClick={() => onService(service)}
                className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5 text-left transition hover:border-brand"
              >
                <span className="min-w-0">
                  <span className="block truncate text-xs font-extrabold">{service.name}</span>
                  <span className="text-[11px] font-medium text-muted">
                    {service.durationMinutes} min
                  </span>
                </span>
                <span className="text-xs font-extrabold text-brand">
                  {formatSgd(service.priceInCents)}
                </span>
              </button>
            ))}
            {matchingServices.length === 0 ? (
              <p className="text-xs font-bold text-muted">No matching services.</p>
            ) : null}
          </div>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-extrabold">Products</h3>
            <span className="text-[11px] font-bold text-muted">
              {matchingProducts.length} available
            </span>
          </div>
          <div className="grid gap-2">
            {matchingProducts.map((product) => {
              const stock = product.trackInventory ? inventory[product.id] : undefined;
              const unavailable = stock !== undefined && stock <= 0;
              return (
                <button
                  key={product.id}
                  type="button"
                  disabled={unavailable}
                  onClick={() => onProduct(product)}
                  className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2.5 text-left transition hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-extrabold">{product.name}</span>
                    <span className="text-[11px] font-medium text-muted">
                      {product.trackInventory
                        ? stock === undefined
                          ? 'Stock checked at checkout'
                          : `${stock} in stock`
                        : 'Stock not tracked'}
                    </span>
                  </span>
                  <span className="text-xs font-extrabold text-brand">
                    {formatSgd(product.priceInCents)}
                  </span>
                </button>
              );
            })}
            {matchingProducts.length === 0 ? (
              <p className="text-xs font-bold text-muted">No matching products.</p>
            ) : null}
          </div>
        </section>
      </div>
    );
  };

  const PaymentEditor = ({
    payments,
    totalInCents,
    onChange,
    onAdd,
    onRemove,
  }: {
    payments: PaymentDraft[];
    totalInCents: number;
    onChange: (index: number, patch: Partial<PaymentDraft>) => void;
    onAdd: () => void;
    onRemove: (index: number) => void;
  }) => {
    const paid = payments.reduce((sum, payment) => sum + toCents(payment.amount), 0);
    const remaining = totalInCents - paid;

    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-extrabold">Payment</span>
          <button type="button" className={subtleButtonClass} onClick={onAdd}>
            Add split
          </button>
        </div>
        {payments.map((payment, index) => (
          <div
            key={`${index}-${payment.method}`}
            className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
          >
            <Field label="Method">
              <select
                className={inputClass}
                value={payment.method}
                onChange={(event) =>
                  onChange(index, { method: event.target.value as PaymentMethod })
                }
              >
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {paymentMethodLabels[method]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Amount (SGD)">
              <input
                className={inputClass}
                type="number"
                min="0"
                step="0.01"
                value={payment.amount}
                onChange={(event) => onChange(index, { amount: event.target.value })}
              />
            </Field>
            <button
              type="button"
              className="mb-1 px-2 text-xs font-extrabold text-red-600"
              onClick={() => onRemove(index)}
              aria-label="Remove payment"
            >
              ×
            </button>
          </div>
        ))}
        <div
          className={`flex items-center justify-between text-xs font-extrabold ${remaining === 0 ? 'text-[#1C8A5A]' : 'text-[#B26B00]'}`}
        >
          <span>
            {remaining === 0
              ? 'Payment balanced'
              : `${formatSgd(Math.abs(remaining))} ${remaining > 0 ? 'remaining' : 'over'}`}
          </span>
          <span>
            {formatSgd(paid)} / {formatSgd(totalInCents)}
          </span>
        </div>
      </div>
    );
  };

  if (!canRead) return <PermissionNotice permission="sales.read" />;

  return (
    <>
      <PageHeader
        title="Point of sale"
        subtitle={activeMembership?.organization.name ?? 'GlamPro'}
        actions={
          canCreate ? (
            <button
              type="button"
              className={primaryButtonClass}
              onClick={() =>
                document.getElementById('sale-cart')?.scrollIntoView({ behavior: 'smooth' })
              }
            >
              New sale
            </button>
          ) : null
        }
      />
      <div className="flex flex-col gap-5 p-5 sm:p-7">
        <section className="panel grid gap-3 p-4 sm:grid-cols-3">
          <Field label="Location">
            <select
              className={inputClass}
              value={activeLocation?.id ?? ''}
              onChange={(event) => setLocationId(event.target.value)}
            >
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Default stylist" hint="Applied to new service lines.">
            <select
              className={inputClass}
              value={staffId}
              onChange={(event) => setStaffId(event.target.value)}
            >
              <option value="">No stylist</option>
              {staff.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {displayStaffName(profile)}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex items-end">
            <form className="flex w-full gap-2" onSubmit={searchCustomers}>
              <input
                className={inputClass}
                value={customerQuery}
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder="Search customer"
              />
              <button type="submit" className={subtleButtonClass}>
                Find
              </button>
            </form>
          </div>
          {customers.length > 0 ? (
            <Field label="Customer">
              <select
                className={inputClass}
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
              >
                <option value="">Walk-in / no customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customerName(customer)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </section>

        {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        {notice ? <StatusMessage tone="success">{notice}</StatusMessage> : null}

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.8fr)]">
          <div className="flex min-w-0 flex-col gap-5">
            <SectionCard
              title="Catalog"
              description="Choose services and products to build the cart."
            >
              <input
                className={inputClass}
                value={catalogQuery}
                onChange={(event) => setCatalogQuery(event.target.value)}
                placeholder="Search the catalog"
              />
              <CatalogList
                services={services}
                products={products}
                inventory={inventory}
                query={catalogQuery}
                onService={addService}
                onProduct={addProduct}
              />
            </SectionCard>

            <div id="sale-cart">
              <SectionCard
                title="Current sale"
                description={
                  cart.length === 0
                    ? 'The cart is empty.'
                    : `${cart.length} line${cart.length === 1 ? '' : 's'} ready for checkout.`
                }
              >
                <div className="flex flex-col divide-y divide-line">
                  {cart.map((line) => {
                    const key = lineKey(line);
                    const stylist =
                      line.type === 'SERVICE' && line.staffProfileId
                        ? staff.find((profile) => profile.id === line.staffProfileId)
                        : null;
                    return (
                      <div key={key} className="flex items-center gap-3 py-3">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-extrabold">{line.item.name}</p>
                          <p className="text-[11px] font-medium text-muted">
                            {line.type === 'SERVICE' ? 'Service' : 'Product'}{' '}
                            {line.type === 'SERVICE' && stylist
                              ? `· ${displayStaffName(stylist)}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            className="h-7 w-7 rounded-lg border border-line text-sm font-extrabold"
                            onClick={() => changeQuantity(key, -1)}
                            aria-label={`Remove one ${line.item.name}`}
                          >
                            −
                          </button>
                          <span className="w-6 text-center text-xs font-extrabold">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            className="h-7 w-7 rounded-lg border border-line text-sm font-extrabold"
                            onClick={() => changeQuantity(key, 1)}
                            aria-label={`Add one ${line.item.name}`}
                          >
                            +
                          </button>
                        </div>
                        <span className="w-20 text-right text-xs font-extrabold">
                          {formatSgd(line.item.priceInCents * line.quantity)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {cart.length > 0 ? (
                  <form
                    className="flex flex-col gap-4 border-t border-line pt-4"
                    onSubmit={checkout}
                  >
                    <div className="flex items-center justify-between text-sm font-extrabold">
                      <span>Total</span>
                      <span className="text-lg text-brand">{formatSgd(totals.totalInCents)}</span>
                    </div>
                    <Field label="Notes" hint="Optional sale note.">
                      <input
                        className={inputClass}
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        maxLength={1000}
                      />
                    </Field>
                    <PaymentEditor
                      payments={payments}
                      totalInCents={totals.totalInCents}
                      onChange={updatePayment}
                      onAdd={() => setPayments((current) => [...current, emptyPayment()])}
                      onRemove={(index) =>
                        setPayments((current) =>
                          current.length === 1
                            ? current
                            : current.filter((_, paymentIndex) => paymentIndex !== index),
                        )
                      }
                    />
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="submit"
                        disabled={pending || !canCreate}
                        className={primaryButtonClass}
                      >
                        {pending ? 'Processing…' : 'Complete sale'}
                      </button>
                      <button
                        type="button"
                        className={subtleButtonClass}
                        onClick={clearCart}
                        disabled={pending}
                      >
                        Clear
                      </button>
                    </div>
                  </form>
                ) : null}
              </SectionCard>
            </div>
          </div>

          <aside className="flex min-w-0 flex-col gap-5">
            <SectionCard
              title="Recent sales"
              description={loading ? 'Loading…' : 'Newest receipts for this location.'}
            >
              {sales.length === 0 ? (
                <p className="text-xs font-bold text-muted">No sales recorded yet.</p>
              ) : (
                <div className="flex flex-col divide-y divide-line">
                  {sales.map((sale) => (
                    <button
                      key={sale.id}
                      type="button"
                      onClick={() => setSelectedSale(sale)}
                      className="flex items-center gap-3 py-3 text-left hover:bg-canvas"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-extrabold">{sale.receiptCode}</p>
                        <p className="truncate text-[11px] font-medium text-muted">
                          {sale.customer ? customerName(sale.customer) : 'Walk-in'} ·{' '}
                          {formatDateTime(sale.createdAt)}
                        </p>
                      </div>
                      <span className="text-xs font-extrabold">{formatSgd(sale.totalInCents)}</span>
                    </button>
                  ))}
                </div>
              )}
            </SectionCard>
            {selectedSale ? (
              <SaleDetail
                sale={selectedSale}
                canVoid={canVoid}
                canRefund={canRefund}
                pending={pending}
                voidReason={voidReason}
                refundAmount={refundAmount}
                refundReason={refundReason}
                refundMethod={refundMethod}
                onVoidReason={setVoidReason}
                onRefundAmount={setRefundAmount}
                onRefundReason={setRefundReason}
                onRefundMethod={setRefundMethod}
                onVoid={submitVoid}
                onRefund={submitRefund}
              />
            ) : (
              <SectionCard
                title="Receipt"
                description="Select a sale to see its receipt and financial history."
              >
                <p className="text-xs font-bold text-muted">Nothing selected.</p>
              </SectionCard>
            )}
          </aside>
        </div>
      </div>
    </>
  );
};

type SaleDetailProps = {
  sale: SaleSummary;
  canVoid: boolean;
  canRefund: boolean;
  pending: boolean;
  voidReason: string;
  refundAmount: string;
  refundReason: string;
  refundMethod: PaymentMethod;
  onVoidReason: (value: string) => void;
  onRefundAmount: (value: string) => void;
  onRefundReason: (value: string) => void;
  onRefundMethod: (value: PaymentMethod) => void;
  onVoid: () => void;
  onRefund: (event: FormEvent<HTMLFormElement>) => void;
};

const SaleDetail = ({
  sale,
  canVoid,
  canRefund,
  pending,
  voidReason,
  refundAmount,
  refundReason,
  refundMethod,
  onVoidReason,
  onRefundAmount,
  onRefundReason,
  onRefundMethod,
  onVoid,
  onRefund,
}: SaleDetailProps) => {
  const remaining = sale.totalInCents - sale.refundedInCents;
  const canReverse = sale.status === 'COMPLETED' || sale.status === 'PARTIALLY_REFUNDED';

  return (
    <SectionCard
      title={sale.receiptCode}
      description={`${formatDateTime(sale.createdAt)} · ${sale.location.name}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className={`status-pill ${saleStatusTone[sale.status]}`}>
          {saleStatusLabels[sale.status]}
        </span>
        <button type="button" className={subtleButtonClass} onClick={() => window.print()}>
          Print
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="block text-[11px] font-bold text-muted">Customer</span>
          <span className="font-extrabold">
            {sale.customer ? customerName(sale.customer) : 'Walk-in'}
          </span>
        </div>
        <div>
          <span className="block text-[11px] font-bold text-muted">Processed by</span>
          <span className="font-extrabold">
            {sale.createdBy ? `${sale.createdBy.firstName} ${sale.createdBy.lastName}` : 'Unknown'}
          </span>
        </div>
      </div>
      <div className="flex flex-col divide-y divide-line border-y border-line">
        {sale.lines.map((line) => (
          <div key={line.id} className="flex items-center gap-2 py-2 text-xs">
            <div className="min-w-0 flex-1">
              <p className="truncate font-extrabold">
                {line.quantity} × {line.name}
              </p>
              <p className="text-[10px] font-medium text-muted">
                {line.type === 'SERVICE' ? 'Service' : 'Product'}
                {line.staff ? ` · ${displayStaffName(line.staff)}` : ''}
              </p>
            </div>
            <span className="font-extrabold">{formatSgd(line.totalInCents)}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-1 text-xs font-bold">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatSgd(sale.subtotalInCents)}</span>
        </div>
        {sale.discountInCents > 0 ? (
          <div className="flex justify-between text-[#1C8A5A]">
            <span>Discount</span>
            <span>−{formatSgd(sale.discountInCents)}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span>Tax</span>
          <span>{formatSgd(sale.taxInCents)}</span>
        </div>
        <div className="flex justify-between text-sm font-extrabold">
          <span>Total</span>
          <span className="text-brand">{formatSgd(sale.totalInCents)}</span>
        </div>
        {sale.refundedInCents > 0 ? (
          <div className="flex justify-between text-[#B26B00]">
            <span>Refunded</span>
            <span>−{formatSgd(sale.refundedInCents)}</span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-1 border-t border-line pt-3 text-[11px] font-bold text-muted">
        <span>Payments</span>
        {sale.payments.map((payment) => (
          <div key={payment.id} className="flex justify-between">
            <span>
              {paymentMethodLabels[payment.method]}
              {payment.reference ? ` · ${payment.reference}` : ''}
            </span>
            <span>{formatSgd(payment.amountInCents)}</span>
          </div>
        ))}
        {sale.refunds.map((refund) => (
          <div key={refund.id} className="flex justify-between text-[#B26B00]">
            <span>Refund · {paymentMethodLabels[refund.method]}</span>
            <span>−{formatSgd(refund.amountInCents)}</span>
          </div>
        ))}
      </div>

      {canVoid && sale.status === 'COMPLETED' ? (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <Field label="Void reason">
            <input
              className={inputClass}
              value={voidReason}
              onChange={(event) => onVoidReason(event.target.value)}
              placeholder="Why is this sale being voided?"
              maxLength={255}
            />
          </Field>
          <button
            type="button"
            disabled={pending || voidReason.trim() === ''}
            className={subtleButtonClass}
            onClick={onVoid}
          >
            Void sale
          </button>
        </div>
      ) : null}

      {canRefund && canReverse ? (
        <form className="flex flex-col gap-2 border-t border-line pt-3" onSubmit={onRefund}>
          <span className="text-xs font-extrabold">Record refund</span>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Amount (SGD)">
              <input
                className={inputClass}
                type="number"
                min="0.01"
                step="0.01"
                value={refundAmount}
                onChange={(event) => onRefundAmount(event.target.value)}
              />
            </Field>
            <Field label="Method">
              <select
                className={inputClass}
                value={refundMethod}
                onChange={(event) => onRefundMethod(event.target.value as PaymentMethod)}
              >
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>
                    {paymentMethodLabels[method]}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Reason">
            <input
              className={inputClass}
              value={refundReason}
              onChange={(event) => onRefundReason(event.target.value)}
              maxLength={500}
            />
          </Field>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending || toCents(refundAmount) <= 0 || refundReason.trim() === ''}
              className={subtleButtonClass}
            >
              Record refund
            </button>
            <button
              type="button"
              disabled={pending}
              className={subtleButtonClass}
              onClick={() => onRefundAmount(fromCents(remaining))}
            >
              Full remaining
            </button>
          </div>
        </form>
      ) : null}
    </SectionCard>
  );
};
