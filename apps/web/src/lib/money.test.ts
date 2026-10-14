/**
 * The till's own money arithmetic — the part of it a server computes too.
 *
 * `discountedPrice` is the interesting one: `priceCart` in `sale.service.ts` rounds the
 * same rate on the same unit price, so a discrepancy would show the cashier one figure
 * and charge another (ADR 0017). The rounding cases below are the ones where "round the
 * unit" and "round the line" disagree.
 */
import { describe, expect, it } from "vitest";

import { cartTotalCents, discountedPrice, priceToCents } from "./money";

describe("discountedPrice", () => {
  it("takes a rate off the unit price in whole cents", () => {
    expect(discountedPrice("80.00", 25)).toBe("60.00");
    expect(discountedPrice("12.50", 10)).toBe("11.25");
  });

  it("rounds half-up on the unit price, which is the penny the server stores", () => {
    // 50.00 at 33.33% is 16.665. Half-up is 16.67, so the discounted unit is 33.33 — the
    // figure `priceCart` writes and the API's own suite asserts.
    expect(discountedPrice("50.00", 33.33)).toBe("33.33");
    expect(priceToCents(discountedPrice("50.00", 33.33))).toBe(3333);
  });

  it("leaves the price alone when there is no discount", () => {
    expect(discountedPrice("12.50", undefined)).toBe("12.50");
    expect(discountedPrice("12.50", 0)).toBe("12.50");
  });

  it("takes the whole unit price off at 100%, without going negative", () => {
    expect(discountedPrice("12.50", 100)).toBe("0.00");
  });

  it("keeps a discounted cart's total equal to the discounted line totals", () => {
    // What the `Discount` row relies on: the discounted cart summed in cents is the same
    // number whether it is read per line or as a whole.
    const lines = [
      { price: "50.00", memberPrice: null, quantity: 3, discountPercent: 33.33 },
      { price: "12.50", memberPrice: null, quantity: 2 },
    ];

    const total = cartTotalCents(
      lines.map((line) => ({
        unitPrice: discountedPrice(line.price, line.discountPercent),
        quantity: line.quantity,
      })),
    );

    expect(total).toBe(9999 + 2500);
  });
});
