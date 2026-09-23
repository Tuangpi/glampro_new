import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createInventoryMovementRequestSchema } from '@glampro/contracts';
import type {
  InventoryLevelSummary,
  InventoryMovementSummary,
  InventoryMovementType,
  ProductSummary,
} from '@glampro/contracts';
import {
  apiErrorMessage,
  createInventoryMovement,
  fetchInventoryLevels,
  fetchInventoryMovements,
  fetchProducts,
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
} from '../shared/FormControls';

/**
 * Movement types the adjustment form offers. `SALE` and `RETURN` are written by
 * the point of sale in a later milestone, so they are not manual choices here.
 */
const adjustmentTypes: { value: InventoryMovementType; label: string }[] = [
  { value: 'ADJUST_IN', label: 'Adjustment in' },
  { value: 'ADJUST_OUT', label: 'Adjustment out' },
  { value: 'INITIAL_STOCK', label: 'Initial stock' },
  { value: 'STOCK_CORRECTION', label: 'Stock correction' },
  { value: 'DAMAGE', label: 'Damage' },
  { value: 'EXPIRY', label: 'Expiry' },
];

const movementLabels: Record<InventoryMovementType, string> = {
  ADJUST_IN: 'Adjustment in',
  ADJUST_OUT: 'Adjustment out',
  SALE: 'Sale',
  RETURN: 'Return',
  STOCK_CORRECTION: 'Stock correction',
  DAMAGE: 'Damage',
  EXPIRY: 'Expiry',
  INITIAL_STOCK: 'Initial stock',
};

/** Mirrors the API: `STOCK_CORRECTION` and the other non-listed types remove stock. */
const inboundTypes: InventoryMovementType[] = ['ADJUST_IN', 'RETURN', 'INITIAL_STOCK'];

const signedQuantity = (movement: InventoryMovementSummary) =>
  inboundTypes.includes(movement.movementType) ? movement.quantity : -movement.quantity;

export const InventorySection = () => {
  const { hasPermission, locations } = useAuth();
  const canRead = hasPermission('inventory.read');
  const canAdjust = hasPermission('inventory.adjust');

  const [levels, setLevels] = useState<InventoryLevelSummary[] | null>(null);
  const [movements, setMovements] = useState<InventoryMovementSummary[] | null>(null);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [locationId, setLocationId] = useState<string>(locations[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    productId: '',
    movementType: 'ADJUST_IN' as InventoryMovementType,
    quantity: '1',
    reason: '',
  });
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetchInventoryLevels(locationId === '' ? {} : { locationId }),
      fetchInventoryMovements(),
      fetchProducts(),
    ])
      .then(([levelData, movementData, productData]) => {
        setLevels(levelData.inventoryLevels);
        setMovements(movementData.inventoryMovements);
        setProducts(productData.products.filter((product) => product.trackInventory));
      })
      .catch((loadError: unknown) => setError(apiErrorMessage(loadError)));
  }, [locationId]);

  useEffect(() => {
    if (canRead) {
      load();
    }
  }, [canRead, load]);

  if (!canRead) {
    return <PermissionNotice permission="inventory.read" />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSaved(null);

    const parsed = createInventoryMovementRequestSchema.safeParse({
      locationId,
      productId: form.productId,
      movementType: form.movementType,
      quantity: Number(form.quantity),
      reason: form.reason.trim() === '' ? undefined : form.reason.trim(),
    });

    if (!parsed.success) {
      setError('Choose a location and a product, then enter a whole quantity of at least one.');
      return;
    }

    setPending(true);

    try {
      const { inventoryMovement } = await createInventoryMovement(parsed.data);
      setSaved(
        `${movementLabels[inventoryMovement.movementType]} of ${inventoryMovement.quantity} recorded.`,
      );
      setForm({ ...form, quantity: '1', reason: '' });
      load();
    } catch (createError) {
      setError(apiErrorMessage(createError));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <SectionCard
        title="Stock levels"
        description="Quantities are derived from the movement ledger and start at zero for every tracked product."
      >
        <Field label="Location">
          <select
            className={inputClass}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">All locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </Field>

        {levels === null ? (
          <p className="text-xs font-bold text-muted">Loading stock levels…</p>
        ) : levels.length === 0 ? (
          <p className="text-xs font-bold text-muted">
            No tracked products yet. Add a product with inventory tracking to see its stock here.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="text-[11px] font-extrabold uppercase tracking-wide text-muted">
                  <th className="border-b border-line py-2 pr-4">Product</th>
                  <th className="border-b border-line py-2 pr-4">SKU</th>
                  <th className="border-b border-line py-2 pr-4">Price</th>
                  <th className="border-b border-line py-2 text-right">On hand</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((level) => (
                  <tr key={`${level.productId}-${level.locationId}`}>
                    <td className="border-b border-line py-2 pr-4 font-bold text-ink">
                      {level.product.name}
                    </td>
                    <td className="border-b border-line py-2 pr-4 text-muted">
                      {level.product.sku ?? '—'}
                    </td>
                    <td className="border-b border-line py-2 pr-4 text-muted">
                      {formatSgd(level.product.priceInCents)}
                    </td>
                    <td className="border-b border-line py-2 text-right font-extrabold">
                      {level.quantityOnHand}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      {canAdjust ? (
        <SectionCard
          title="Record a stock adjustment"
          description="Adjustments append to the ledger rather than editing a quantity, so history stays intact."
        >
          {products.length === 0 ? (
            <p className="text-xs font-bold text-muted">
              Add a product that tracks inventory before recording a movement.
            </p>
          ) : (
            <form
              className="grid gap-3 sm:grid-cols-4"
              onSubmit={(event) => void handleSubmit(event)}
              noValidate
            >
              <Field label="Product">
                <select
                  className={inputClass}
                  value={form.productId}
                  onChange={(event) => setForm({ ...form, productId: event.target.value })}
                >
                  <option value="">Select a product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Movement">
                <select
                  className={inputClass}
                  value={form.movementType}
                  onChange={(event) =>
                    setForm({ ...form, movementType: event.target.value as InventoryMovementType })
                  }
                >
                  {adjustmentTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Quantity">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                />
              </Field>
              <Field label="Reason" hint="Optional note for the ledger.">
                <input
                  className={inputClass}
                  value={form.reason}
                  onChange={(event) => setForm({ ...form, reason: event.target.value })}
                  maxLength={255}
                />
              </Field>
              <div className="sm:col-span-4">
                <button type="submit" disabled={pending} className={primaryButtonClass}>
                  {pending ? 'Recording…' : 'Record movement'}
                </button>
              </div>
            </form>
          )}
          {saved ? <StatusMessage tone="success">{saved}</StatusMessage> : null}
          {error ? <StatusMessage tone="error">{error}</StatusMessage> : null}
        </SectionCard>
      ) : null}

      <SectionCard
        title="Movement history"
        description="The most recent 200 movements for this organization, newest first."
      >
        {movements === null ? (
          <p className="text-xs font-bold text-muted">Loading movements…</p>
        ) : movements.length === 0 ? (
          <p className="text-xs font-bold text-muted">No stock movements recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {movements.map((movement) => (
              <li
                key={movement.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-white px-3 py-2"
              >
                <span className="text-xs font-extrabold text-ink">{movement.product.name}</span>
                <span className="text-[11px] font-bold text-muted">
                  {movementLabels[movement.movementType]}
                  {movement.reason ? ` · ${movement.reason}` : ''}
                </span>
                <span className="text-[11px] font-bold text-muted">
                  {movement.performedBy
                    ? `${movement.performedBy.firstName} ${movement.performedBy.lastName}`
                    : 'System'}
                </span>
                <span
                  className={`text-xs font-extrabold ${
                    signedQuantity(movement) >= 0 ? 'text-[#1C8A5A]' : 'text-red-600'
                  }`}
                >
                  {signedQuantity(movement) >= 0 ? '+' : ''}
                  {signedQuantity(movement)}
                </span>
                <span className="text-[11px] font-medium text-muted">
                  {formatDateTime(movement.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
};
