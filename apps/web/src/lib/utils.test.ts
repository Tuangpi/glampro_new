import { describe, expect, it } from "vitest";

import {
  cn,
  formatDate,
  formatDateInputValue,
  formatDuration,
  formatMoney,
  formatStatus,
  getInitials,
} from "./utils";

describe("formatDate", () => {
  it("renders an em dash for missing values", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
    expect(formatDate("not-a-date")).toBe("—");
  });

  it("formats an ISO string", () => {
    expect(formatDate("2026-03-04T10:30:00.000Z")).toBe("4 Mar 2026");
  });
});

describe("formatDateInputValue", () => {
  it("keeps the local calendar day instead of shifting to UTC", () => {
    // 00:30 local on the 1st would become the previous day via toISOString().
    expect(formatDateInputValue(new Date(2026, 0, 1, 0, 30))).toBe("2026-01-01");
  });
});

describe("formatMoney", () => {
  it("formats minor units as currency", () => {
    expect(formatMoney(123456)).toBe("$1,234.56");
    expect(formatMoney(0)).toBe("$0.00");
  });

  it("renders an em dash for missing values", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(Number.NaN)).toBe("—");
  });
});

describe("formatDuration", () => {
  it("switches to hours once past 60 minutes", () => {
    expect(formatDuration(45)).toBe("45m");
    expect(formatDuration(60)).toBe("1h 0m");
    expect(formatDuration(75)).toBe("1h 15m");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("getInitials", () => {
  it("takes at most two initials", () => {
    expect(getInitials("Ava Owner")).toBe("AO");
    expect(getInitials("Rita")).toBe("R");
    expect(getInitials("  maya   manager  ")).toBe("MM");
    expect(getInitials("")).toBe("");
  });
});

describe("formatStatus", () => {
  it("humanises enum values", () => {
    expect(formatStatus("IN_PROGRESS")).toBe("in progress");
    expect(formatStatus(null)).toBe("—");
  });
});

describe("cn", () => {
  it("drops falsy entries", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });
});
