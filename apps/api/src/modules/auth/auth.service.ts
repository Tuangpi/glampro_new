import { randomBytes, randomUUID } from 'node:crypto';
import type {
  AuthenticatedSession,
  AuthenticatedUser,
  CurrentUser,
  LoginRequest,
  MembershipSummary,
  RegistrationRequest,
  SessionSummary,
} from '@glampro/contracts';
import { env } from '../../config/env.js';
import { prisma } from '../../database/prisma.js';
import type {
  MembershipRole,
  MembershipStatus,
  OrganizationStatus,
  PlatformRole,
} from '../../generated/prisma/client.js';
import { type AuditContext, recordAuditEvent } from '../../shared/audit.js';
import { AppError } from '../../shared/http/app-error.js';
import { sendEmail } from '../../services/email/email-transport.js';
import { permissionsForRole } from './authorization.js';
import { hashPassword, verifyPassword } from './password.js';
import {
  createTokenFamilyId,
  generateCsrfToken,
  generateRefreshToken,
  hashRefreshToken,
  issueAccessToken,
  refreshTokenExpiresAt,
} from './tokens.js';

const minuteMs = 60 * 1000;
const trialLengthMs = 14 * 24 * 60 * 60 * 1000;

/**
 * A rotated refresh token presented again inside this window is treated as a
 * benign double submit rather than a replay, so a family is not revoked
 * because a client fired two refreshes at once.
 */
const refreshReuseGraceMs = 10_000;

type UserRow = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  platformRole: PlatformRole;
  emailVerifiedAt: Date | null;
};

type MembershipRow = {
  id: string;
  organizationId: string;
  role: MembershipRole;
  status: MembershipStatus;
  organization: {
    id: string;
    name: string;
    slug: string;
    status: OrganizationStatus;
    defaultCurrency: string;
    defaultTimezone: string;
  };
};

type SessionTokens = {
  sessionId: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
  csrfToken: string;
};

/**
 * A new session returned by registration or login. The refresh token stays out
 * of the response body; routes place it in an HTTP-only cookie.
 */
export type IssuedSession = {
  payload: AuthenticatedSession;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

const membershipSelection = {
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

const userSelection = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
  platformRole: true,
  emailVerifiedAt: true,
} as const;

const slugify = (value: string) =>
  value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const uniqueOrganizationSlug = async (name: string) => {
  const base = slugify(name).slice(0, 80) || 'organization';

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${randomBytes(3).toString('hex')}`;
    const existing = await prisma.organization.findUnique({
      where: { slug: candidate },
      select: { id: true },
    });

    if (!existing) {
      return candidate;
    }
  }

  return `${base}-${randomUUID().slice(0, 8)}`;
};

const locationCode = (name: string) =>
  slugify(name).replace(/-/g, '').toUpperCase().slice(0, 30) || 'MAIN';

const defaultBusinessHours = () =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    isClosed: dayOfWeek === 0,
    opensAt: dayOfWeek === 0 ? null : '09:00',
    closesAt: dayOfWeek === 0 ? null : dayOfWeek >= 6 ? '21:00' : '20:00',
  }));

const toAuthenticatedUser = (user: UserRow): AuthenticatedUser => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  avatarUrl: user.avatarUrl,
  platformRole: user.platformRole,
  emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
});

const toMembershipSummary = (membership: MembershipRow): MembershipSummary => ({
  id: membership.id,
  organizationId: membership.organizationId,
  role: membership.role,
  status: membership.status,
  organization: {
    id: membership.organization.id,
    name: membership.organization.name,
    slug: membership.organization.slug,
    status: membership.organization.status,
    currency: membership.organization.defaultCurrency,
    timezone: membership.organization.defaultTimezone,
  },
});

const activeMembershipsFor = (userId: string, organizationId?: string) =>
  prisma.organizationMembership.findMany({
    where: {
      userId,
      status: 'ACTIVE',
      ...(organizationId ? { organizationId } : {}),
    },
    select: membershipSelection,
    orderBy: { createdAt: 'asc' },
  });

/** Creates the refresh session row and the access token that points at it. */
const openSession = async (user: UserRow, context: AuditContext): Promise<SessionTokens> => {
  const refreshToken = generateRefreshToken();
  const csrfToken = generateCsrfToken();

  const session = await prisma.authSession.create({
    data: {
      userId: user.id,
      tokenFamilyId: createTokenFamilyId(),
      refreshTokenHash: hashRefreshToken(refreshToken),
      userAgent: context.userAgent,
      ipAddress: context.ipAddress,
      expiresAt: refreshTokenExpiresAt(),
    },
    select: { id: true, expiresAt: true },
  });

  const { token: accessToken, expiresAt: accessTokenExpiresAt } = await issueAccessToken({
    userId: user.id,
    sessionId: session.id,
    platformRole: user.platformRole,
  });

  return {
    sessionId: session.id,
    accessToken,
    accessTokenExpiresAt,
    refreshToken,
    refreshTokenExpiresAt: session.expiresAt,
    csrfToken,
  };
};

const sessionPayload = (
  user: UserRow,
  memberships: MembershipRow[],
  tokens: SessionTokens,
  activeOrganizationId?: string,
): AuthenticatedSession => {
  const summaries = memberships.map(toMembershipSummary);
  const active =
    summaries.find((membership) => membership.organizationId === activeOrganizationId) ??
    summaries[0] ??
    null;

  return {
    user: toAuthenticatedUser(user),
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: tokens.accessTokenExpiresAt.toISOString(),
    organizations: summaries,
    activeOrganizationId: active ? active.organizationId : null,
    permissions: active ? permissionsForRole(active.role) : [],
    csrfToken: tokens.csrfToken,
  };
};

export const register = async (
  input: RegistrationRequest,
  context: AuditContext,
): Promise<IssuedSession> => {
  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    throw new AppError(
      409,
      'EMAIL_ALREADY_REGISTERED',
      'An account with this email address already exists',
    );
  }

  const passwordHash = await hashPassword(input.password);
  const slug = await uniqueOrganizationSlug(input.organizationName);
  const verificationToken = generateRefreshToken();

  const created = await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        credential: { create: { passwordHash } },
      },
      select: userSelection,
    });

    const organization = await transaction.organization.create({
      data: {
        name: input.organizationName,
        slug,
        status: 'TRIAL',
        defaultTimezone: input.timezone,
        memberships: { create: { userId: user.id, role: 'ORG_OWNER', status: 'ACTIVE' } },
        locations: {
          create: {
            name: input.locationName,
            code: locationCode(input.locationName),
            timezone: input.timezone,
            businessHours: { create: defaultBusinessHours() },
          },
        },
        subscriptions: {
          create: {
            planCode: 'starter',
            status: 'TRIALING',
            trialEndsAt: new Date(Date.now() + trialLengthMs),
          },
        },
      },
      select: { id: true },
    });

    await transaction.emailVerificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hashRefreshToken(verificationToken),
        expiresAt: new Date(Date.now() + env.EMAIL_VERIFICATION_TTL_HOURS * 60 * minuteMs),
      },
    });

    return { user, organization };
  });

  await sendEmail({
    to: created.user.email,
    subject: 'Verify your GlamPro email address',
    body: `Hi ${created.user.firstName}, confirm your email address: ${env.WEB_ORIGIN}/verify-email?token=${encodeURIComponent(verificationToken)}`,
  });

  await recordAuditEvent(context, {
    action: 'auth.registered',
    actorType: 'USER',
    organizationId: created.organization.id,
    actorUserId: created.user.id,
    entityType: 'Organization',
    entityId: created.organization.id,
  });

  const memberships = await activeMembershipsFor(created.user.id);
  const tokens = await openSession(created.user, context);

  return {
    payload: sessionPayload(created.user, memberships, tokens, created.organization.id),
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
  };
};

/** Placeholder hash so a missing account costs the same as a wrong password. */
let dummyPasswordHash: Promise<string> | undefined;
const passwordCheckHash = () => (dummyPasswordHash ??= hashPassword('glampro-timing-guard'));

export const login = async (input: LoginRequest, context: AuditContext): Promise<IssuedSession> => {
  const user = await prisma.user.findUnique({
    where: { email: input.email },
    select: { ...userSelection, credential: { select: { passwordHash: true } } },
  });

  const passwordHash = user?.credential?.passwordHash ?? (await passwordCheckHash());
  const passwordMatches = await verifyPassword(input.password, passwordHash);

  if (!user || !passwordMatches) {
    await recordAuditEvent(context, {
      action: 'auth.login_failed',
      actorType: 'USER',
      actorUserId: user?.id ?? null,
      entityType: 'User',
      entityId: user?.id ?? null,
      metadata: { email: input.email },
    });

    throw new AppError(401, 'INVALID_CREDENTIALS', 'The email address or password is incorrect');
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  await recordAuditEvent(context, {
    action: 'auth.login',
    actorType: 'USER',
    actorUserId: user.id,
    entityType: 'User',
    entityId: user.id,
  });

  const memberships = await activeMembershipsFor(user.id);
  const tokens = await openSession(user, context);

  return {
    payload: sessionPayload(user, memberships, tokens, memberships[0]?.organizationId),
    refreshToken: tokens.refreshToken,
    refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
  };
};

export type RefreshedSession = {
  accessToken: string;
  accessTokenExpiresAt: string;
  csrfToken: string;
  refreshToken: string;
  refreshTokenExpiresAt: Date;
};

const revokeTokenFamily = (tokenFamilyId: string) =>
  prisma.authSession.updateMany({
    where: { tokenFamilyId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

export const refresh = async (
  refreshToken: string,
  context: AuditContext,
): Promise<RefreshedSession> => {
  const session = await prisma.authSession.findUnique({
    where: { refreshTokenHash: hashRefreshToken(refreshToken) },
    select: {
      id: true,
      userId: true,
      tokenFamilyId: true,
      rotatedAt: true,
      revokedAt: true,
      expiresAt: true,
      ipAddress: true,
      userAgent: true,
      user: { select: userSelection },
    },
  });

  if (!session) {
    throw new AppError(401, 'INVALID_TOKEN', 'Your session has expired. Please sign in again.');
  }

  if (session.revokedAt) {
    throw new AppError(401, 'SESSION_REVOKED', 'Your session is no longer valid');
  }

  if (session.rotatedAt) {
    const rotatedAgoMs = Date.now() - session.rotatedAt.getTime();

    if (rotatedAgoMs <= refreshReuseGraceMs) {
      throw new AppError(401, 'INVALID_TOKEN', 'This session token has already been used');
    }

    // A rotated token came back long after rotation: treat it as a replay and
    // revoke the whole family so a stolen chain cannot be reused.
    await revokeTokenFamily(session.tokenFamilyId);
    await recordAuditEvent(context, {
      action: 'auth.refresh_reuse_detected',
      actorType: 'USER',
      actorUserId: session.userId,
      entityType: 'AuthSession',
      entityId: session.id,
      metadata: { tokenFamilyId: session.tokenFamilyId },
    });

    throw new AppError(401, 'SESSION_REVOKED', 'Your session is no longer valid');
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    await prisma.authSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    throw new AppError(401, 'SESSION_EXPIRED', 'Your session has expired. Please sign in again.');
  }

  const nextRefreshToken = generateRefreshToken();
  const csrfToken = generateCsrfToken();

  const nextSession = await prisma.$transaction(async (transaction) => {
    await transaction.authSession.update({
      where: { id: session.id },
      data: { rotatedAt: new Date() },
    });

    return transaction.authSession.create({
      data: {
        userId: session.userId,
        tokenFamilyId: session.tokenFamilyId,
        refreshTokenHash: hashRefreshToken(nextRefreshToken),
        userAgent: context.userAgent ?? session.userAgent,
        ipAddress: context.ipAddress ?? session.ipAddress,
        expiresAt: refreshTokenExpiresAt(),
      },
      select: { id: true, expiresAt: true },
    });
  });

  const { token: accessToken, expiresAt: accessTokenExpiresAt } = await issueAccessToken({
    userId: session.userId,
    sessionId: nextSession.id,
    platformRole: session.user.platformRole,
  });

  await recordAuditEvent(context, {
    action: 'auth.session_refreshed',
    actorType: 'USER',
    actorUserId: session.userId,
    entityType: 'AuthSession',
    entityId: nextSession.id,
  });

  return {
    accessToken,
    accessTokenExpiresAt: accessTokenExpiresAt.toISOString(),
    csrfToken,
    refreshToken: nextRefreshToken,
    refreshTokenExpiresAt: nextSession.expiresAt,
  };
};

export type RevokedSessions = { revokedSessions: number };

export const logout = async (
  refreshToken: string | undefined,
  context: AuditContext,
): Promise<RevokedSessions> => {
  if (!refreshToken) {
    return { revokedSessions: 0 };
  }

  const session = await prisma.authSession.findUnique({
    where: { refreshTokenHash: hashRefreshToken(refreshToken) },
    select: { id: true, userId: true, tokenFamilyId: true, revokedAt: true },
  });

  if (!session || session.revokedAt) {
    return { revokedSessions: 0 };
  }

  // Signing out ends the whole rotation chain, so every access token issued for
  // this device stops working immediately.
  const result = await revokeTokenFamily(session.tokenFamilyId);

  await recordAuditEvent(context, {
    action: 'auth.logout',
    actorType: 'USER',
    actorUserId: session.userId,
    entityType: 'AuthSession',
    entityId: session.id,
    metadata: { tokenFamilyId: session.tokenFamilyId },
  });

  return { revokedSessions: result.count };
};

export const currentUser = async (
  userId: string,
  organizationId?: string,
): Promise<CurrentUser> => {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userSelection });

  if (!user) {
    throw new AppError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required');
  }

  const memberships = await activeMembershipsFor(userId, organizationId);
  const membership = memberships[0] ?? null;

  const locations = membership
    ? await prisma.location.findMany({
        where: { organizationId: membership.organizationId, isActive: true },
        select: {
          id: true,
          organizationId: true,
          name: true,
          code: true,
          timezone: true,
          currency: true,
          isActive: true,
        },
        orderBy: { name: 'asc' },
      })
    : [];

  return {
    user: toAuthenticatedUser(user),
    activeOrganizationId: membership ? membership.organizationId : null,
    membership: membership ? toMembershipSummary(membership) : null,
    permissions: membership ? permissionsForRole(membership.role) : [],
    locations,
  };
};

export const listSessions = async (
  userId: string,
  currentSessionId: string | null,
): Promise<SessionSummary[]> => {
  const sessions = await prisma.authSession.findMany({
    where: { userId, revokedAt: null, rotatedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true, ipAddress: true, userAgent: true, createdAt: true, expiresAt: true },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  return sessions.map((session) => ({
    id: session.id,
    ipAddress: session.ipAddress,
    userAgent: session.userAgent,
    createdAt: session.createdAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
    isCurrent: session.id === currentSessionId,
  }));
};

export const revokeSession = async (
  userId: string,
  sessionId: string,
  context: AuditContext,
): Promise<RevokedSessions> => {
  const result = await prisma.authSession.updateMany({
    where: { id: sessionId, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (result.count === 0) {
    throw new AppError(404, 'NOT_FOUND', 'Session was not found');
  }

  await recordAuditEvent(context, {
    action: 'auth.session_revoked',
    actorType: 'USER',
    actorUserId: userId,
    entityType: 'AuthSession',
    entityId: sessionId,
  });

  return { revokedSessions: result.count };
};

export const forgotPassword = async (email: string, context: AuditContext): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, firstName: true },
  });

  if (!user) {
    // Never reveal whether an account exists.
    return;
  }

  const token = generateRefreshToken();

  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashRefreshToken(token),
      expiresAt: new Date(Date.now() + env.PASSWORD_RESET_TTL_MINUTES * minuteMs),
    },
  });

  await sendEmail({
    to: user.email,
    subject: 'Reset your GlamPro password',
    body: `Hi ${user.firstName}, choose a new password: ${env.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`,
  });

  await recordAuditEvent(context, {
    action: 'auth.password_reset_requested',
    actorType: 'USER',
    actorUserId: user.id,
    entityType: 'User',
    entityId: user.id,
  });
};

export const resetPassword = async (
  token: string,
  password: string,
  context: AuditContext,
): Promise<void> => {
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, 'INVALID_TOKEN', 'This password reset link is invalid or has expired');
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (transaction) => {
    await transaction.userCredential.upsert({
      where: { userId: record.userId },
      update: { passwordHash, passwordChangedAt: new Date() },
      create: { userId: record.userId, passwordHash },
    });

    await transaction.passwordResetToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    // Every existing session is invalidated when the password changes.
    await transaction.authSession.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  await recordAuditEvent(context, {
    action: 'auth.password_reset_completed',
    actorType: 'USER',
    actorUserId: record.userId,
    entityType: 'User',
    entityId: record.userId,
  });
};

export const verifyEmail = async (token: string, context: AuditContext): Promise<void> => {
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash: hashRefreshToken(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true },
  });

  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
    throw new AppError(400, 'INVALID_TOKEN', 'This verification link is invalid or has expired');
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: new Date() },
    });

    await transaction.emailVerificationToken.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });
  });

  await recordAuditEvent(context, {
    action: 'auth.email_verified',
    actorType: 'USER',
    actorUserId: record.userId,
    entityType: 'User',
    entityId: record.userId,
  });
};
