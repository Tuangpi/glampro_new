import type { MembershipRole } from '../../generated/prisma/client.js';
import type { NextFunction, Request, Response } from 'express';
import { permissions, type Permission } from '@glampro/contracts';
import { AppError } from '../../shared/http/app-error.js';

/**
 * Permission names live in `@glampro/contracts` so the web client can gate
 * navigation with the same identifiers. The grants below stay server-side.
 */
export { permissions, type Permission };

const allPermissions = new Set<Permission>(permissions);
const operationalPermissions = new Set<Permission>([
  'appointments.read',
  'appointments.manage',
  'customers.read',
  'customers.manage',
  'services.read',
  'products.read',
  'inventory.read',
  'inventory.adjust',
  'sales.create',
  'sales.read',
  'staff.read',
  'reports.view',
]);

const rolePermissions: Record<MembershipRole, ReadonlySet<Permission>> = {
  ORG_OWNER: allPermissions,
  ORG_ADMIN: allPermissions,
  MANAGER: new Set([...operationalPermissions, 'sales.void', 'sales.refund', 'staff.manage']),
  RECEPTIONIST: new Set([
    'appointments.read',
    'appointments.manage',
    'customers.read',
    'customers.manage',
    'services.read',
    'products.read',
    'inventory.read',
    'sales.create',
    'sales.read',
    'staff.read',
  ]),
  STAFF: new Set([
    'appointments.read',
    'customers.read',
    'services.read',
    'products.read',
    'sales.create',
    'sales.read',
  ]),
};

export const roleHasPermission = (role: MembershipRole, permission: Permission) =>
  rolePermissions[role].has(permission);

export const permissionsForRole = (role: MembershipRole): Permission[] => [
  ...rolePermissions[role],
];

export const requirePermission =
  (permission: Permission) => (request: Request, _response: Response, next: NextFunction) => {
    if (!request.tenant) {
      next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'));
      return;
    }

    if (!roleHasPermission(request.tenant.role, permission)) {
      next(new AppError(403, 'PERMISSION_DENIED', 'You do not have permission for this action'));
      return;
    }

    next();
  };
