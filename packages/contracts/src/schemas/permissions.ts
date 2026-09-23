import { z } from 'zod';

/**
 * Permission names are shared so that the web client can gate navigation
 * without duplicating strings. The role-to-permission grants stay server-side
 * in `apps/api/src/modules/auth/authorization.ts`; the API returns the
 * effective permission list for the active membership.
 */
export const permissions = [
  'appointments.read',
  'appointments.manage',
  'customers.read',
  'customers.manage',
  'services.read',
  'services.manage',
  'products.read',
  'products.manage',
  'inventory.read',
  'inventory.adjust',
  'sales.create',
  'sales.read',
  'sales.void',
  'sales.refund',
  'staff.read',
  'staff.manage',
  'reports.view',
  'settings.manage',
  'members.manage',
  'billing.manage',
  'audit.read',
] as const;

export type Permission = (typeof permissions)[number];

export const permissionSchema = z.enum(permissions);
