/**
 * Cents-exact arithmetic for the till.
 *
 * Prices cross the wire as major-unit strings (`"12.50"`) with two decimals
 * (`saleItemBase` in `packages/shared/src/schemas/sales.ts`), but the till
 * totals them — `unitPrice × quantity`, summed over every line — and a float
 * product would drift from the server's `Decimal` total by a cent on exactly
 * the receipts a salon reconciles. Every public function here works in **whole
 * cents** (`number`): a string is converted once on entry, all arithmetic is
 * integer, and the result is converted back only for display or posting.
 *
 * `formatPrice` in `./utils` is still the one place a string becomes a display
 * string — this file only computes.
 */

/** Whole cents for a `"12.50"`-shaped price. `""` and junk are `0`, never NaN. */
export function priceToCents(value: string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 0;
  // Half up, matching the database: Decimal rounds 12.345 to 12.35.
  return Math.round(amount * 100);
}

/** Two-decimal `"12.50"`-shaped string for whole cents — what `moneySchema` coerces. */
export function centsToPrice(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** `unitPrice × quantity` in cents. Integer multiply, so no float is involved. */
export function lineTotalCents(unitPrice: string, quantity: number): number {
  return priceToCents(unitPrice) * quantity;
}

/** The cart total in cents, over lines that already carry their unit price. */
export function cartTotalCents(
  lines: ReadonlyArray<{ unitPrice: string; quantity: number }>,
): number {
  return lines.reduce((sum, line) => sum + lineTotalCents(line.unitPrice, line.quantity), 0);
}
