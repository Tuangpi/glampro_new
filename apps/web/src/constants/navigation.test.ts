import { describe, expect, it } from "vitest";

import { activeNavItem, navItems, visibleNavItems } from "./navigation";

describe("visibleNavItems", () => {
  it("hides role-restricted entries from unrestricted users", () => {
    const labels = visibleNavItems().map((item) => item.label);
    expect(labels).not.toContain("Reports");
    expect(labels).not.toContain("Settings");
    expect(labels).toContain("Sale");
  });

  it("shows reports and settings to managers", () => {
    const labels = visibleNavItems("MANAGER").map((item) => item.label);
    expect(labels).toContain("Reports");
    expect(labels).toContain("Settings");
  });

  it("shows reports and settings to super admins", () => {
    const labels = visibleNavItems("SUPER_ADMIN").map((item) => item.label);
    expect(labels).toContain("Reports");
  });

  it("keeps cashiers out of reporting", () => {
    const labels = visibleNavItems("CASHIER").map((item) => item.label);
    expect(labels).not.toContain("Reports");
  });
});

describe("activeNavItem", () => {
  it("matches the dashboard only on the exact path", () => {
    expect(activeNavItem("/")?.label).toBe("Dashboard");
    expect(activeNavItem("/sale")?.label).toBe("Sale");
  });

  it("keeps the parent highlighted for nested routes", () => {
    expect(activeNavItem("/customers/42")?.label).toBe("Customers");
  });

  it("returns undefined for unknown paths", () => {
    expect(activeNavItem("/nope")).toBeUndefined();
  });
});

describe("navItems", () => {
  it("uses unique paths", () => {
    expect(new Set(navItems.map((item) => item.path)).size).toBe(navItems.length);
  });
});
