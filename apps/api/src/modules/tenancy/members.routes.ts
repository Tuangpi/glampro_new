import { Router } from 'express';
import { z } from 'zod';
import {
  acceptInvitationRequestSchema,
  changeMemberRoleRequestSchema,
  changeMemberStatusRequestSchema,
  inviteMemberRequestSchema,
} from '@glampro/contracts';
import type {
  AcceptInvitationRequest,
  ChangeMemberRoleRequest,
  ChangeMemberStatusRequest,
  InviteMemberRequest,
} from '@glampro/contracts';
import { authenticate, authenticationOf } from '../../middleware/authenticate.js';
import { requireCsrf } from '../../middleware/csrf.js';
import { invitationRateLimit } from '../../middleware/rate-limits.js';
import { tenantOf, withTenant } from '../../middleware/tenant.js';
import { validate, validatedBody, validatedParams } from '../../middleware/validate.js';
import { auditContextFromRequest } from '../../shared/audit.js';
import { respondSuccess } from '../../shared/http/response.js';
import { requirePermission } from '../auth/authorization.js';
import {
  acceptInvitation,
  changeMemberRole,
  changeMemberStatus,
  createInvitation,
  listInvitations,
  listMembers,
  revokeInvitation,
} from './members.service.js';

export const membersRouter = Router();
export const invitationsRouter = Router();

const idParamsSchema = z.object({ id: z.string().trim().min(1).max(64) });

type IdParams = { id: string };

membersRouter.get(
  '/',
  authenticate,
  withTenant,
  requirePermission('members.manage'),
  async (request, response) => {
    const tenant = tenantOf(request);
    const auth = authenticationOf(request);

    respondSuccess(request, response, {
      members: await listMembers(tenant.organizationId, auth.userId),
    });
  },
);

membersRouter.patch(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('members.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: changeMemberRoleRequestSchema }),
  async (request, response) => {
    const tenant = tenantOf(request);
    const auth = authenticationOf(request);

    const member = await changeMemberRole(
      tenant.organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<ChangeMemberRoleRequest>(request),
      { userId: auth.userId, membershipId: tenant.membershipId },
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { member });
  },
);

membersRouter.patch(
  '/:id/status',
  authenticate,
  withTenant,
  requirePermission('members.manage'),
  requireCsrf,
  validate({ params: idParamsSchema, body: changeMemberStatusRequestSchema }),
  async (request, response) => {
    const tenant = tenantOf(request);
    const auth = authenticationOf(request);

    const member = await changeMemberStatus(
      tenant.organizationId,
      validatedParams<IdParams>(request).id,
      validatedBody<ChangeMemberStatusRequest>(request),
      { userId: auth.userId, membershipId: tenant.membershipId },
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { member });
  },
);

// Acceptance runs without `withTenant`: the acceptor has no membership yet.
invitationsRouter.post(
  '/accept',
  authenticate,
  validate({ body: acceptInvitationRequestSchema }),
  async (request, response) => {
    const membership = await acceptInvitation(
      validatedBody<AcceptInvitationRequest>(request).token,
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { membership });
  },
);

invitationsRouter.get(
  '/',
  authenticate,
  withTenant,
  requirePermission('members.manage'),
  async (request, response) => {
    respondSuccess(request, response, {
      invitations: await listInvitations(tenantOf(request).organizationId),
    });
  },
);

invitationsRouter.post(
  '/',
  authenticate,
  withTenant,
  requirePermission('members.manage'),
  invitationRateLimit,
  requireCsrf,
  validate({ body: inviteMemberRequestSchema }),
  async (request, response) => {
    const invitation = await createInvitation(
      tenantOf(request).organizationId,
      validatedBody<InviteMemberRequest>(request),
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { invitation }, 201);
  },
);

invitationsRouter.delete(
  '/:id',
  authenticate,
  withTenant,
  requirePermission('members.manage'),
  requireCsrf,
  validate({ params: idParamsSchema }),
  async (request, response) => {
    const invitation = await revokeInvitation(
      tenantOf(request).organizationId,
      validatedParams<IdParams>(request).id,
      authenticationOf(request).userId,
      auditContextFromRequest(request),
    );

    respondSuccess(request, response, { invitation });
  },
);
