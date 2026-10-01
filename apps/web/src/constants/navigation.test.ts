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

  it("puts Staff in the rail for every role, as the handoff rail does", () => {
    // The handoff draws a Staff entry beside Customers/Products on every main-nav
    // screen, so no role filter may hide it.
    const staff = navItems.find((item) => item.label === "Staff");
    expect(staff?.path).toBe("/staff");
    expect(staff?.roles).toBeUndefined();

    for (const role of ["CASHIER", "MANAGER", "SUPER_ADMIN"] as const) {
      expect(visibleNavItems(role).map((item) => item.label)).toContain("Staff");
    }
    expect(visibleNavItems().map((item) => item.label)).toContain("Staff");
  });

  it("carries the eight handoff rail entries and no Services destination", () => {
    // ADR 0005: the handoff rail draws seven destinations plus Settings in its
    // foot, and services are a tab on the Products screen rather than a
    // destination of their own. Eight entries in total, six for every role.
    expect(navItems).toHaveLength(8);
    expect(visibleNavItems()).toHaveLength(6);
    expect(navItems.map((item) => item.label)).not.toContain("Services");
    expect(navItems.some((item) => item.path.startsWith("/services"))).toBe(false);
  });
});
