import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@glampro/shared";

import { paginated, parsePagination } from "./pagination.js";

describe("parsePagination", () => {
  it("applies defaults when nothing is supplied", () => {
    assert.deepEqual(parsePagination(), {
      page: 1,
      pageSize: DEFAULT_PAGE_SIZE,
      skip: 0,
      take: DEFAULT_PAGE_SIZE,
    });
  });

  it("coerces numeric strings from the query string", () => {
    assert.deepEqual(parsePagination({ page: "3", pageSize: "25" }), {
      page: 3,
      pageSize: 25,
      skip: 50,
      take: 25,
    });
  });

  it("falls back to defaults for unusable values", () => {
    assert.equal(parsePagination({ page: "0" }).page, 1);
    assert.equal(parsePagination({ page: "-4" }).page, 1);
    assert.equal(parsePagination({ page: "abc" }).page, 1);
    assert.equal(parsePagination({ pageSize: "1.5" }).pageSize, DEFAULT_PAGE_SIZE);
  });

  it("caps pageSize at the shared maximum", () => {
    assert.equal(parsePagination({ pageSize: String(MAX_PAGE_SIZE * 10) }).pageSize, MAX_PAGE_SIZE);
  });
});

describe("paginated", () => {
  it("computes pageCount from the total", () => {
    assert.deepEqual(paginated(["a", "b"], 7, { page: 2, pageSize: 5 }), {
      data: ["a", "b"],
      total: 7,
      page: 2,
      pageSize: 5,
      pageCount: 2,
    });
  });

  it("reports zero pages for an empty result set", () => {
    assert.equal(paginated([], 0, { page: 1, pageSize: 20 }).pageCount, 0);
  });
});
