import type { GlobalRole } from "@glampro/shared";
import type { ComponentType, SVGProps } from "react";

import {
  BarChart,
  Briefcase,
  Calendar,
  Cart,
  Grid,
  Package,
  Settings,
  Users,
} from "@/components/icons";

export interface NavItem {
  label: string;
  path: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Roles allowed to see the entry. Omitted = every signed-in user. */
  roles?: GlobalRole[];
  /** Which live counter to show on the rail badge, if any. */
  badge?: "openCart" | "lowStock";
}

/**
 * The Salon Pro app rail (see handoff screens 05–11).
 *
 * Icons come from the handoff set ported into `@/components/icons`
 * (see docs/design/HANDOFF.md §4).
 *
 * Staff is an unrestricted peer of Customers and Products because the handoff's
 * own rail draws it that way — screens 05–11 all render a Staff entry between
 * Products and Reports. The screen behind it lands in the phase that builds the
 * staff surface; until then the entry matches the other not-yet-built routes.
 *
 * The rail has **eight** entries, and there is deliberately none for Services:
 * the handoff rail draws seven destinations plus Settings in its foot, and
 * services are reached from the Products tab row and from the sale and
 * appointment flows. The count and the absence are both asserted in
 * navigation.test.ts, so do not add a ninth entry without a decision. See ADR
 * 0005 (docs/decisions/0005-rail-has-no-services-destination.md) and
 * docs/design/HANDOFF.md §5.
 */
export const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: Grid },
  { label: "Sale", path: "/sale", icon: Cart, badge: "openCart" },
  { label: "Appointments", path: "/appointments", icon: Calendar },
  { label: "Customers", path: "/customers", icon: Users },
  { label: "Products", path: "/products", icon: Package, badge: "lowStock" },
  { label: "Staff", path: "/staff", icon: Briefcase },
  { label: "Reports", path: "/reports", icon: BarChart, roles: ["SUPER_ADMIN", "MANAGER"] },
  { label: "Settings", path: "/settings", icon: Settings, roles: ["SUPER_ADMIN", "MANAGER"] },
];

/** Filters the rail for the signed-in role. */
export function visibleNavItems(role?: GlobalRole): NavItem[] {
  return navItems.filter(
    (item) => !item.roles || (role !== undefined && item.roles.includes(role)),
  );
}

/** Longest-prefix match so nested routes keep their parent highlighted. */
export function activeNavItem(pathname: string, role?: GlobalRole): NavItem | undefined {
  return visibleNavItems(role)
    .filter(
      (item) =>
        item.path === pathname || (item.path !== "/" && pathname.startsWith(`${item.path}/`)),
    )
    .sort((a, b) => b.path.length - a.path.length)[0];
}
