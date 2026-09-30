import type { GlobalRole } from "@glampro/shared";
import type { IconType } from "react-icons";
import {
  FiBarChart2,
  FiCalendar,
  FiGrid,
  FiPackage,
  FiScissors,
  FiSettings,
  FiShoppingCart,
  FiUsers,
} from "react-icons/fi";

export interface NavItem {
  label: string;
  path: string;
  icon: IconType;
  /** Roles allowed to see the entry. Omitted = every signed-in user. */
  roles?: GlobalRole[];
  /** Which live counter to show on the rail badge, if any. */
  badge?: "openCart" | "lowStock";
}

/**
 * The Salon Pro app rail (see handoff screens 05–11).
 *
 * Icons come from react-icons for now; the handoff's own 40 SVG icons replace
 * them in the design-system phase without changing this shape.
 */
export const navItems: NavItem[] = [
  { label: "Dashboard", path: "/", icon: FiGrid },
  { label: "Sale", path: "/sale", icon: FiShoppingCart, badge: "openCart" },
  { label: "Appointments", path: "/appointments", icon: FiCalendar },
  { label: "Customers", path: "/customers", icon: FiUsers },
  { label: "Products", path: "/products", icon: FiPackage, badge: "lowStock" },
  { label: "Services", path: "/services", icon: FiScissors },
  { label: "Reports", path: "/reports", icon: FiBarChart2, roles: ["SUPER_ADMIN", "MANAGER"] },
  { label: "Settings", path: "/settings", icon: FiSettings, roles: ["SUPER_ADMIN", "MANAGER"] },
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
