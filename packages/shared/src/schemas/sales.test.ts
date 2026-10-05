import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_SALE_ITEM_LIMIT, MAX_SALE_ITEM_LIMIT } from "../constants.js";
import { SALE_ITEM_KINDS, saleItemSchema, saleItemSearchQuerySchema } from "./sales.js";

/** The fields every kind carries, so each case below only states what differs. */
const base = { id: "item-1", name: "Aloha", price: "10.00", memberPrice: null };

describe("saleItemSearchQuerySchema", () => {
  it("defaults the limit and leaves search and kind absent rather than empty", () => {
    const parsed = saleItemSearchQuerySchema.parse({});

    assert.equal(parsed.limit, DEFAULT_SALE_ITEM_LIMIT);
    // An empty string is a search for nothing, and `kind: ""` would be a category
    // that does not exist — absent is the state that means "no filter".
    assert.equal(parsed.search, undefined);
    assert.equal(parsed.kind, undefined);
  });

  it("coerces a limit that arrived as a query string", () => {
    assert.equal(saleItemSearchQuerySchema.parse({ limit: "5" }).limit, 5);
  });

  it("rejects a limit above the ceiling instead of clamping it silently", () => {
    assert.equal(
      saleItemSearchQuerySchema.safeParse({ limit: String(MAX_SALE_ITEM_LIMIT + 1) }).success,
      false,
    );
  });

  it("rejects a kind that is not one of the five rather than searching everything", () => {
    // A typo in the picker's category must not widen the search to the whole
    // catalogue, which is the same rule `?status=` follows on the catalogue tabs.
    assert.equal(saleItemSearchQuerySchema.safeParse({ kind: "MEMBERSHIP" }).success, false);
    assert.equal(saleItemSearchQuerySchema.safeParse({ kind: "PRODUCT" }).success, true);
  });

  it("accepts each of the five kinds, because the picker has a tab for each", () => {
    for (const kind of SALE_ITEM_KINDS) {
      assert.equal(saleItemSearchQuerySchema.safeParse({ kind }).success, true, kind);
    }
  });
});

describe("saleItemSchema", () => {
  it("carries the columns a kind actually has, and no others", () => {
    const product = saleItemSchema.parse({
      ...base,
      kind: "PRODUCT",
      points: 5,
      quantity: 12,
      lowStock: false,
    });
    assert.equal(product.kind, "PRODUCT");
    assert.equal("durationMinutes" in product, false);

    const service = saleItemSchema.parse({
      ...base,
      kind: "SERVICE",
      points: 5,
      durationMinutes: 60,
    });
    assert.equal("quantity" in service, false);

    const bundle = saleItemSchema.parse({
      ...base,
      kind: "PACKAGE",
      sessionCount: 10,
      serviceCount: 3,
    });
    assert.equal("points" in bundle, false);
  });

  it("keeps a gift card's money in one field, so the two cannot disagree", () => {
    const card = saleItemSchema.parse({ ...base, kind: "GIFT_CARD", expiresAt: null });

    assert.equal(card.price, "10.00");
    assert.equal("value" in card, false, "a template's face value is its price");
    assert.equal("status" in card, false, "GiftCard has no status column to report");
  });

  it("separates what a value package costs from the credit it carries", () => {
    const prepaid = saleItemSchema.parse({
      ...base,
      kind: "VALUE_PACKAGE",
      credit: "120.00",
      serviceCount: 0,
    });

    // Narrowed rather than cast: the union is what tells the two apart, and a test that
    // reached into it with `as` would pass even if the discriminator were wrong.
    if (prepaid.kind !== "VALUE_PACKAGE") throw new Error("expected a value package");

    assert.equal(prepaid.price, "10.00");
    assert.equal(prepaid.credit, "120.00");
  });

  it("refuses a kind the cart could not store, rather than guessing one", () => {
    assert.equal(saleItemSchema.safeParse({ ...base, kind: "MEMBERSHIP" }).success, false);
  });

  it("requires the price of any kind, because a line cannot be rung up without one", () => {
    // Spelled out rather than spread-minus-`price`, so there is no unused binding to
    // keep a linter quiet about.
    const withoutPrice = { id: "item-1", name: "Aloha", memberPrice: null };

    assert.equal(
      saleItemSchema.safeParse({ ...withoutPrice, kind: "GIFT_CARD", expiresAt: null }).success,
      false,
    );
  });
});
