import { describe, expect, it } from "vitest";

import { normalisePaginated } from "./apiUtils";

describe("normalisePaginated", () => {
  it("passes through a page whose rows are already flattened", () => {
    // Not the shape a list route sends: it nests this inside the `ApiResponse`
    // envelope, and `getPaginated` unwraps that before calling here. This is what
    // it hands over, so it must survive untouched — unwrapping again would take
    // the rows away.
    expect(
      normalisePaginated({ data: [1, 2], total: 2, page: 1, pageSize: 20, pageCount: 1 }),
    ).toEqual({ data: [1, 2], total: 2, page: 1, pageSize: 20, pageCount: 1 });
  });

  it("maps legacy paging field names", () => {
    expect(
      normalisePaginated({ data: ["a"], total: 41, currentPage: 2, perPage: 20, totalPages: 3 }),
    ).toEqual({ data: ["a"], total: 41, page: 2, pageSize: 20, pageCount: 3 });
  });

  it("accepts bare collections and derives the metadata", () => {
    expect(normalisePaginated({ items: [1, 2, 3] })).toEqual({
      data: [1, 2, 3],
      total: 3,
      page: 1,
      pageSize: 3,
      pageCount: 1,
    });
  });

  it("tolerates missing or malformed payloads", () => {
    expect(normalisePaginated(undefined)).toEqual({
      data: [],
      total: 0,
      page: 1,
      pageSize: 0,
      pageCount: 0,
    });
    expect(normalisePaginated({ data: "nope", total: "lots" })).toEqual({
      data: [],
      total: 0,
      page: 1,
      pageSize: 0,
      pageCount: 0,
    });
  });

  it("honours a custom data key", () => {
    expect(normalisePaginated({ rows: [7], total: 1 }, "rows").data).toEqual([7]);
  });
});
