import type {
  ChangeMemberRoleRequest,
  ChangeMemberStatusRequest,
  InvitationSummary,
  InviteMemberRequest,
  MemberSummary,
  MembershipSummary,
} from '@glampro/contracts';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import type { MembershipRole, Prisma } from '../../generated/prisma/client.js';
import { sendEmail } from '../../services/email/email-transport.js';
import { type AuditContext, recordAuditEvent } from '../../shared/audit.js';
import { AppError } from '../../shared/http/app-error.js';
import { generateRefreshToken, hashRefreshToken } from '../auth/tokens.js';

const hourMs = 60 * 60 * 1000;

const memberSelection = {
  id: true,
  userId: true,
  role: true,
  status: true,
  joinedAt: true,
  createdAt: true,
  user: {
    select: { id: true, email: true, firstName: true, lastName: true, avatarUrl: true },
  },
} as const;

const invitationSelection = {
  id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
  createdAt: true,
  invitedBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

const membershipSummarySelection = {
  id: true,
  organizationId: true,
  role: true,
  status: true,
  organization: {
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      defaultCurrency: true,
      defaultTimezone: true,
    },
  },
} as const;

type MemberRow = Prisma.OrganizationMembershipGetPayload<{ select: typeof memberSelection }>;
type InvitationRow = Prisma.OrganizationInvitationGetPayload<{
  select: typeof invitationSelection;
}>;
type MembershipRow = Prisma.OrganizationMembershipGetPayload<{
  select: typeof membershipSummarySelection;
}>;

const toMemberSummary = (row: MemberRow, currentUserId: string): MemberSummary => ({
  id: row.id,
  userId: row.userId,
  role: row.role,
  status: row.status,
  joinedAt: row.joinedAt ? row.joinedAt.toISOString() : null,
  createdAt: row.createdAt.toISOString(),
  isSelf: row.userId === currentUserId,
  user: row.user,
});

/** Pending invitations past their expiry read as expired without a background job. */
const toInvitationSummary = (row: InvitationRow): InvitationSummary => ({
  id: row.id,
  email: row.email,
  role: row.role,
  status:
    row.status === 'PENDING' && row.expiresAt.getTime() <= Date.now() ? 'EXPIRED' : row.status,
  expiresAt: row.expiresAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
  invitedBy: row.invitedBy,
});

const toMembershipSummary = (row: MembershipRow): MembershipSummary => ({
  id: row.id,
  organizationId: row.organizationId,
  role: row.role,
  status: row.status,
  organization: {
    id: row.organization.id,
    name: row.organization.name,
    slug: row.organization.slug,
    status: row.organization.status,
    currency: row.organization.defaultCurrency,
    timezone: row.organization.defaultTimezone,
  },
});

/** Every membership lookup is tenant-scoped, so a foreign ID surfaces as 404. */
const scopedMembershipRow = async (organizationId: string, membershipId: string) => {
  const membership = await prisma.organizationMembership.findFirst({
    where: { id: membershipId, organizationId },
    select: { id: true, userId: true, role: true, status: true },
  });

  if (!membership) {
    throw new AppError(404, 'NOT_FOUND', 'Member was not found');
  }

  return membership;
};

const activeOwnerCount = (organizationId: string, excludingMembershipId: string | null) =>
  prisma.organizationMembership.count({
    where: {
      organizationId,
      role: 'ORG_OWNER',
      status: 'ACTIVE',
      ...(excludingMembershipId ? { id: { not: excludingMembershipId } } : {}),
    },
  });

/** Refuses a change that would leave the organization without an active owner. */
const assertKeepsAnOwner = async (
  organizationId: string,
  membership: { id: string; role: MembershipRole },
) => {
  if (membership.role !== 'ORG_OWNER') {
    return;
  }

  const remainingOwners = await activeOwnerCount(organizationId, membership.id);
  if (remainingOwners === 0) {
    throw new AppError(409, 'CONFLICT', 'The organization must keep at least one active owner');
  }
};

const assertNotSelf = (membership: { id: string }, actorMembershipId: string) => {
  if (membership.id === actorMembershipId) {
    throw new AppError(409, 'CONFLICT', 'You cannot change your own membership');
  }
};

export const listMembers = async (
  organizationId: string,
  currentUserId: string,
): Promise<MemberSummary[]> => {
  const members = await prisma.organizationMembership.findMany({
    where: { organizationId },
    select: memberSelection,
    orderBy: { createdAt: 'asc' },
  });

  return members.map((member) => toMemberSummary(member, currentUserId));
};

export const changeMemberRole = async (
  organizationId: string,
  membershipId: string,
  input: ChangeMemberRoleRequest,
  actor: { userId: string; membershipId: string },
  context: AuditContext,
): Promise<MemberSummary> => {
  const membership = await scopedMembershipRow(organizationId, membershipId);
  assertNotSelf(membership, actor.membershipId);

  if (membership.role === 'ORG_OWNER' && input.role !== 'ORG_OWNER') {
    await assertKeepsAnOwner(organizationId, membership);
  }

  await prisma.organizationMembership.update({
    where: { id: membership.id },
    data: { role: input.role },
  });

  await recordAuditEvent(context, {
    action: 'members.role_changed',
    actorType: 'USER',
    organizationId,
    actorUserId: actor.userId,
    entityType: 'OrganizationMembership',
    entityId: membership.id,
    metadata: { from: membership.role, to: input.role, targetUserId: membership.userId },
  });

  const updated = await prisma.organizationMembership.findUniqueOrThrow({
    where: { id: membership.id },
    select: memberSelection,
  });

  return toMemberSummary(updated, actor.userId);
};

export const changeMemberStatus = async (
  organizationId: string,
  membershipId: string,
  input: ChangeMemberStatusRequest,
  actor: { userId: string; membershipId: string },
  context: AuditContext,
): Promise<MemberSummary> => {
  const membership = await scopedMembershipRow(organizationId, membershipId);
  assertNotSelf(membership, actor.membershipId);

  if (input.status !== 'ACTIVE') {
    await assertKeepsAnOwner(organizationId, membership);
  }

  await prisma.organizationMembership.update({
    where: { id: membership.id },
    data: { status: input.status },
  });

  const action =
    input.status === 'SUSPENDED'
      ? 'members.suspended'
      : input.status === 'REMOVED'
        ? 'members.removed'
        : 'members.reactivated';

  await recordAuditEvent(context, {
    action,
    actorType: 'USER',
    organizationId,
    actorUserId: actor.userId,
    entityType: 'OrganizationMembership',
    entityId: membership.id,
    metadata: { from: membership.status, to: input.status, targetUserId: membership.userId },
  });

  const updated = await prisma.organizationMembership.findUniqueOrThrow({
    where: { id: membership.id },
    select: memberSelection,
  });

  return toMemberSummary(updated, actor.userId);
};

const roleLabels: Record<MembershipRole, string> = {
  ORG_OWNER: 'Owner',
  ORG_ADMIN: 'Administrator',
  MANAGER: 'Manager',
  RECEPTIONIST: 'Receptionist',
  STAFF: 'Staff',
};

export const listInvitations = async (organizationId: string): Promise<InvitationSummary[]> => {
  const invitations = await prisma.organizationInvitation.findMany({
    where: { organizationId },
    select: invitationSelection,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return invitations.map(toInvitationSummary);
};

export const createInvitation = async (
  organizationId: string,
  input: InviteMemberRequest,
  invitedById: string,
  context: AuditContext,
): Promise<InvitationSummary> => {
  const existingMember = await prisma.organizationMembership.findFirst({
    where: {
      organizationId,
      user: { email: input.email },
      status: { in: ['ACTIVE', 'INVITED'] },
    },
    select: { id: true },
  });

  if (existingMember) {
    throw new AppError(409, 'CONFLICT', 'This person is already a member of the organization');
  }

  const livePending = await prisma.organizationInvitation.findFirst({
    where: {
      organizationId,
      email: input.email,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
    select: { id: true },
  });

  if (livePending) {
    throw new AppError(409, 'CONFLICT', 'An invitation is already pending for this email address');
  }

  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { name: true },
  });

  if (!organization) {
    throw new AppError(404, 'NOT_FOUND', 'Organization was not found');
  }

  // Only the hash is stored; the raw token exists solely in the email link.
  const token = generateRefreshToken();

  const created = await prisma.organizationInvitation.create({
    data: {
      organizationId,
      email: input.email,
      role: input.role,
      tokenHash: hashRefreshToken(token),
      invitedById,
      expiresAt: new Date(Date.now() + env.INVITATION_TTL_HOURS * hourMs),
    },
    select: invitationSelection,
  });

  await sendEmail({
    to: input.email,
    subject: `You have been invited to join ${organization.name} on GlamPro`,
    body: `Hi, you have been invited to join ${organization.name} on GlamPro as ${roleLabels[input.role]}. Accept the invitation: ${env.WEB_ORIGIN}/invitations/accept?token=${encodeURIComponent(token)}`,
  });

  await recordAuditEvent(context, {
    action: 'members.invited',
    actorType: 'USER',
    organizationId,
    actorUserId: invitedById,
    entityType: 'OrganizationInvitation',
    entityId: created.id,
    metadata: { email: input.email, role: input.role },
  });

  return toInvitationSummary(created);
};

export const revokeInvitation = async (
  organizationId: string,
  invitationId: string,
  actorUserId: string,
  context: AuditContext,
): Promise<InvitationSummary> => {
  const invitation = await prisma.organizationInvitation.findFirst({
    where: { id: invitationId, organizationId },
    select: { id: true, email: true, status: true },
  });

  if (!invitation) {
    throw new AppError(404, 'NOT_FOUND', 'Invitation was not found');
  }

  if (invitation.status !== 'PENDING') {
    throw new AppError(409, 'CONFLICT', 'Only pending invitations can be revoked');
  }

  const revoked = await prisma.organizationInvitation.update({
    where: { id: invitation.id },
    data: { status: 'REVOKED' },
    select: invitationSelection,
  });

  await recordAuditEvent(context, {
    action: 'members.invitation_revoked',
    actorType: 'USER',
    organizationId,
    actorUserId,
    entityType: 'OrganizationInvitation',
    entityId: invitation.id,
    metadata: { email: invitation.email },
  });

  return toInvitationSummary(revoked);
};

/**
 * Acceptance is the one tenant write that runs without `withTenant`: the
 * acceptor cannot hold an active membership yet. The email on the invitation
 * must match the signed-in user, and the raw token is never persisted.
 */
export const acceptInvitation = async (
  token: string,
  userId: string,
  context: AuditContext,
): Promise<MembershipSummary> => {
  const invitation = await prisma.organizationInvitation.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
    select: {
      id: true,
      organizationId: true,
      email: true,
      role: true,
      status: true,
      expiresAt: true,
    },
  });

  if (
    !invitation ||
    invitation.status !== 'PENDING' ||
    invitation.expiresAt.getTime() <= Date.now()
  ) {
    throw new AppError(400, 'INVALID_TOKEN', 'This invitation link is invalid or has expired');
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });

  if (!user || user.email !== invitation.email) {
    throw new AppError(
      403,
      'PERMISSION_DENIED',
      'This invitation was sent to a different email address',
    );
  }

  const membership = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.organizationMembership.findUnique({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId } },
      select: { id: true, joinedAt: true },
    });

    const member = existing
      ? await transaction.organizationMembership.update({
          where: { id: existing.id },
          data: {
            role: invitation.role,
            status: 'ACTIVE',
            joinedAt: existing.joinedAt ?? new Date(),
          },
          select: membershipSummarySelection,
        })
      : await transaction.organizationMembership.create({
          data: {
            organizationId: invitation.organizationId,
            userId,
            role: invitation.role,
            status: 'ACTIVE',
          },
          select: membershipSummarySelection,
        });

    await transaction.organizationInvitation.update({
      where: { id: invitation.id },
      data: { status: 'ACCEPTED', acceptedById: userId, acceptedAt: new Date() },
    });

    return member;
  });

  await recordAuditEvent(context, {
    action: 'members.invitation_accepted',
    actorType: 'USER',
    organizationId: invitation.organizationId,
    actorUserId: userId,
    entityType: 'OrganizationMembership',
    entityId: membership.id,
    metadata: { invitationId: invitation.id, role: invitation.role },
  });

  return toMembershipSummary(membership);
};
