import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  catalogueListQuerySchema,
  createProductSchema,
  createServiceSchema,
  productSummarySchema,
} from "./catalogue.js";

describe("catalogueListQuerySchema", () => {
  it("coerces the lowStock flag from either boolean or query-string form", () => {
    assert.equal(catalogueListQuerySchema.parse({ lowStock: "true" }).lowStock, true);
    assert.equal(catalogueListQuerySchema.parse({ lowStock: true }).lowStock, true);
    assert.equal(catalogueListQuerySchema.parse({ lowStock: "false" }).lowStock, false);
  });

  it("leaves lowStock absent when not asked for, rather than defaulting to false", () => {
    // Defaulting to false would silently hide low stock from an unfiltered list.
    assert.equal(catalogueListQuerySchema.parse({}).lowStock, undefined);
  });

  it("rejects an unknown status rather than ignoring it", () => {
    assert.equal(catalogueListQuerySchema.safeParse({ status: "DISCONTINUED" }).success, false);
  });
});

describe("createProductSchema", () => {
  it("requires both prices, because a product cannot be rung up without them", () => {
    assert.equal(
      createProductSchema.safeParse({ name: "Shampoo", memberPrice: 12 }).success,
      false,
    );
    assert.equal(
      createProductSchema.safeParse({ name: "Shampoo", memberPrice: 12, nonmemberPrice: 15 })
        .success,
      true,
    );
  });

  it("refuses negative money and negative stock", () => {
    assert.equal(
      createProductSchema.safeParse({ name: "S", memberPrice: -1, nonmemberPrice: 5 }).success,
      false,
    );
    assert.equal(
      createProductSchema.safeParse({ name: "S", memberPrice: 1, nonmemberPrice: 5, quantity: -2 })
        .success,
      false,
    );
  });

  it("coerces numeric strings from a form", () => {
    const parsed = createProductSchema.parse({
      name: "S",
      memberPrice: "12.50",
      nonmemberPrice: "15",
    });
    assert.equal(parsed.memberPrice, 12.5);
  });
});

describe("createServiceSchema", () => {
  it("allows a missing duration, because legacy had no such column", () => {
    assert.equal(
      createServiceSchema.safeParse({ name: "Cut", memberPrice: 30, nonmemberPrice: 35 }).success,
      true,
    );
  });

  it("still refuses an absurd duration", () => {
    assert.equal(
      createServiceSchema.safeParse({
        name: "Cut",
        memberPrice: 30,
        nonmemberPrice: 35,
        durationMinutes: 2,
      }).success,
      false,
    );
  });
});

describe("productSummarySchema", () => {
  const row = {
    id: "p1",
    name: "Shampoo",
    status: "ACTIVE",
    memberPrice: "12.50",
    nonmemberPrice: "15.00",
    quantity: 3,
    points: 0,
    description: null,
    departmentId: null,
    departmentName: null,
    lowStock: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };

  it("carries prices as strings so a Decimal never becomes a lossy float", () => {
    assert.equal(typeof productSummarySchema.parse(row).memberPrice, "string");
    assert.equal(productSummarySchema.parse(row).lowStock, true);
  });

  it("rejects a numeric price, so the mistake fails at the boundary", () => {
    assert.equal(productSummarySchema.safeParse({ ...row, memberPrice: 12.5 }).success, false);
  });
});
