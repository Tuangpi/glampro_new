import type { Request, RequestHandler } from 'express';
import { prisma } from '../database/prisma.js';
import { AppError } from '../shared/http/app-error.js';

export const organizationHeader = 'x-organization-id';

/** Organizations that can no longer operate are refused at the tenant boundary. */
const inactiveOrganizationStatuses = new Set(['SUSPENDED', 'CANCELLED']);

/**
 * Resolves the organization membership that scopes the request. The scope is
 * never taken from the request body; a client-supplied organization ID only
 * selects among memberships the authenticated user already holds.
 */
export const withTenant: RequestHandler = async (request, _response, next) => {
  if (!request.auth) {
    next(new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'));
    return;
  }

  const requestedOrganizationId = request.header(organizationHeader);

  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId: request.auth.userId,
      status: 'ACTIVE',
      ...(requestedOrganizationId ? { organizationId: requestedOrganizationId } : {}),
    },
    select: {
      id: true,
      organizationId: true,
      role: true,
      organization: {
        select: {
          status: true,
          locations: { where: { isActive: true }, select: { id: true }, orderBy: { name: 'asc' } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
    take: 2,
  });

  const [membership] = memberships;

  if (!membership) {
    if (requestedOrganizationId) {
      // Matches the cross-tenant rule: do not confirm that the organization exists.
      next(new AppError(404, 'NOT_FOUND', 'Organization was not found'));
      return;
    }

    next(new AppError(403, 'TENANT_REQUIRED', 'No active organization membership was found'));
    return;
  }

  if (!requestedOrganizationId && memberships.length > 1) {
    next(
      new AppError(
        400,
        'TENANT_REQUIRED',
        `Multiple organizations are available. Send the ${organizationHeader} header`,
      ),
    );
    return;
  }

  if (inactiveOrganizationStatuses.has(membership.organization.status)) {
    next(
      new AppError(
        403,
        'ORGANIZATION_INACTIVE',
        'This organization is not currently active. Contact GlamPro support.',
      ),
    );
    return;
  }

  request.tenant = {
    organizationId: membership.organizationId,
    membershipId: membership.id,
    role: membership.role,
    locationIds: membership.organization.locations.map((location) => location.id),
  };

  next();
};

/**
 * Reads the tenant scope for handlers mounted behind `withTenant`, which
 * guarantees it is present.
 */
export const tenantOf = (request: Request) => {
  if (!request.tenant) {
    throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
  }

  return request.tenant;
};
