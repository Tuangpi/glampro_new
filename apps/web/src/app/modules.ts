import {
  BarChart3,
  Boxes,
  CalendarDays,
  Settings,
  ShoppingCart,
  UserRoundCog,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';
import type { Permission } from '@glampro/contracts';
import { CatalogPage } from '../features/catalog/CatalogPage';
import { SettingsPage } from '../features/settings/SettingsPage';

export type ModuleRoute = {
  path: string;
  label: string;
  title: string;
  description: string;
  /** `null` for modules every signed-in member can open. */
  permission: Permission | null;
  group: 'main' | 'account';
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  badge?: string;
  /** Real screen for implemented modules; others fall back to the placeholder. */
  element?: ComponentType;
};

/**
 * Single source for the module navigation and the module routes, so a screen
 * cannot drift between the sidebar and the router.
 */
export const moduleRoutes: ModuleRoute[] = [
  {
    path: 'sales',
    label: 'Sale',
    title: 'Sales',
    description: 'Build carts, record payments, and issue receipts.',
    permission: 'sales.read',
    group: 'main',
    icon: ShoppingCart,
    badge: '1',
  },
  {
    path: 'appointments',
    label: 'Calendar',
    title: 'Appointments',
    description: 'Manage the salon calendar, availability, and appointment status.',
    permission: 'appointments.read',
    group: 'main',
    icon: CalendarDays,
  },
  {
    path: 'customers',
    label: 'Customers',
    title: 'Customers',
    description: 'Manage customer profiles, visit history, and notes.',
    permission: 'customers.read',
    group: 'main',
    icon: Users,
  },
  {
    path: 'inventory',
    label: 'Products',
    title: 'Products & inventory',
    description: 'Maintain the product catalog and stock movement history.',
    permission: 'products.read',
    group: 'main',
    icon: Boxes,
    element: CatalogPage,
  },
  {
    path: 'staff',
    label: 'Staff',
    title: 'Staff',
    description: 'Manage staff profiles, services, schedules, and time off.',
    permission: 'staff.read',
    group: 'main',
    icon: UserRoundCog,
  },
  {
    path: 'reports',
    label: 'Reports',
    title: 'Reports',
    description: 'Review revenue, appointments, payments, and operational performance.',
    permission: 'reports.view',
    group: 'main',
    icon: BarChart3,
  },
  {
    path: 'settings',
    label: 'Settings',
    title: 'Settings',
    description: 'Configure business, location, tax, receipt, and user settings.',
    permission: 'settings.manage',
    group: 'account',
    icon: Settings,
    element: SettingsPage,
  },
];

/** Navigation and route access both derive from the effective permission list. */
export const visibleModuleRoutes = (permissions: readonly string[]): ModuleRoute[] =>
  moduleRoutes.filter(
    (route) => route.permission === null || permissions.includes(route.permission),
  );
