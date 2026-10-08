/**
 * The idempotency key `POST /api/sales` needs (Q16, closed in Phase 5b.2).
 *
 * Legacy's `pay-by-cash` posted a payment with no key anywhere, so a double-tap
 * on a slow connection charged twice. The client mints one key per tender
 * attempt and the server returns the sale that already exists rather than
 * writing a second one. The key is minted in `PaymentDialog` and never stored:
 * the cart is cleared on success, so a key outlives nothing.
 *
 * `crypto.randomUUID()` is 36 characters of `8-4-4-4-12` hex and dashes —
 * inside the contract's 8–128 range (`createSaleSchema`). The fallback is the
 * same alphabet the UUID uses, so a host without `randomUUID` still sends a
 * valid key rather than a short or empty one.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const alphabet = "0123456789abcdef";
  let key = "";
  for (let index = 0; index < 32; index += 1) {
    key += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return key;
}
