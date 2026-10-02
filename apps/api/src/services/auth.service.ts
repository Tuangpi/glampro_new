import {
  WEB_REALM,
  type AuthProfile,
  type AuthRealm,
  type AuthSession,
  type ChangePasswordInput,
  type LoginInput,
  type ModuleEntitlement,
} from "@glampro/shared";

import { forbidden, unauthorized } from "../lib/http-error.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import { prisma } from "../lib/prisma.js";
import { canSignIn, resolveTenantStatus } from "../lib/tenant-status.js";
import { runAsPlatform, runAsTenant } from "../lib/tenant-context.js";
import {
  createRefreshToken,
  hashRefreshToken,
  refreshTokenExpiry,
  signAccessToken,
} from "../lib/tokens.js";
import type { AuthenticatedUser } from "../types/index.js";

/**
 * Session operations.
 *
 * Each function is explicit about its scope. The ones that run before a tenant is
 * trusted (`login`, `refresh`, `logout`) use `runAsPlatform`; the ones that act on a
 * tenant's own data enter `runAsTenant` themselves, so they cannot be called from an
 * unscoped context by accident.
 */

/** Request metadata recorded against a refresh token, for support and revocation. */
export interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

/**
 * A real bcrypt hash, compared against when the email is unknown so a failed login
 * costs the same time whether or not the address exists. Without it, response latency
 * answers "is this person one of your customers?" for an attacker.
 */
const DUMMY_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

/** Loads a session subject without a tenant scope, by primary key. */
async function loadUserForSession(userId: string) {
  return runAsPlatform(() =>
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenantId: true,
        name: true,
        email: true,
        globalRole: true,
        tokenVersion: true,
        disabled: true,
      },
    }),
  );
}

/** Refuses a salon that may not sign in, with the code the UI keys its message off. */
async function assertTenantMaySignIn(tenantId: string): Promise<void> {
  const tenant = await runAsPlatform(() =>
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        status: true,
        subscriptions: { orderBy: { endDate: "desc" }, take: 1, select: { endDate: true } },
      },
    }),
  );

  if (!tenant) {
    throw unauthorized("Your salon is no longer available.", "TENANT_NOT_FOUND");
  }

  const status = resolveTenantStatus(tenant.status, tenant.subscriptions[0]?.endDate ?? null);

  if (!canSignIn(status)) {
    throw forbidden(
      status === "CANCELLED"
        ? "This account is closed. Please contact your provider."
        : "This salon's subscription has ended. Please contact your provider.",
      status === "CANCELLED" ? "TENANT_CANCELLED" : "TENANT_EXPIRED",
    );
  }
}

/** Mints an access/refresh pair and records the refresh token's hash. */
async function issueSession(
  user: {
    id: string;
    tenantId: string;
    name: string;
    email: string;
    globalRole: AuthSession["user"]["globalRole"];
    tokenVersion: number;
  },
  realm: AuthRealm,
  meta: SessionMeta,
): Promise<AuthSession> {
  const { token: accessToken, expiresIn } = signAccessToken({
    id: user.id,
    email: user.email,
    globalRole: user.globalRole,
    realm,
    tenantId: user.tenantId,
    tokenVersion: user.tokenVersion,
  });

  const { token: refreshToken, tokenHash } = createRefreshToken();

  // `RefreshToken` is not tenant-scoped: it is looked up by hash before a tenant is
  // trusted, exactly like the session lookup in the auth middleware.
  await runAsPlatform(() =>
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash,
        realm,
        expiresAt: refreshTokenExpiry(),
        userAgent: meta.userAgent,
        ipAddress: meta.ipAddress,
      },
    }),
  );

  return {
    accessToken,
    refreshToken,
    expiresIn,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      globalRole: user.globalRole,
      tenantId: user.tenantId,
    },
  };
}

/**
 * Signs a salon user in.
 *
 * The email is globally unique on `users` (unlike `customers.email`, which ADR 0003
 * scoped to the tenant), so the address alone identifies the account before any
 * tenant is known.
 */
export async function login(input: LoginInput, meta: SessionMeta): Promise<AuthSession> {
  // Phase 3 serves the web portal. `pos` and `mobile` sign in through their own
  // surfaces, which land with the phases that own them; `/api/mobile/*` is a frozen
  // contract and is deliberately not re-implemented here.
  if (input.realm !== WEB_REALM) {
    throw forbidden(
      `The "${input.realm}" surface does not sign in through this endpoint.`,
      "REALM_NOT_SUPPORTED",
    );
  }

  const user = await runAsPlatform(() => prisma.user.findUnique({ where: { email: input.email } }));

  // Always spend the same time, and always answer the same way: which half was wrong
  // is not the client's business.
  const passwordMatches = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);

  if (!user || user.disabled || !passwordMatches) {
    throw unauthorized("That email and password combination is not right.", "INVALID_CREDENTIALS");
  }

  await assertTenantMaySignIn(user.tenantId);

  await runAsPlatform(() =>
    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
  );

  return issueSession(user, WEB_REALM, meta);
}

/**
 * Exchanges a refresh token for a new pair, rotating it.
 *
 * Rotation is the replay defence: the presented token is revoked in the same
 * statement that validates it, so two concurrent uses cannot both succeed — the
 * second finds it already revoked and is refused.
 *
 * A *reused* token is treated as theft rather than noise. A legitimate client rotates
 * on every use, so a token arriving twice means a copy exists somewhere it should
 * not; the whole family is revoked and every session for that user must sign in
 * again. Losing a session is a far better outcome than leaving an attacker with one.
 */
export async function refresh(refreshToken: string, meta: SessionMeta): Promise<AuthSession> {
  const tokenHash = hashRefreshToken(refreshToken);

  const row = await runAsPlatform(() => prisma.refreshToken.findUnique({ where: { tokenHash } }));

  if (!row) {
    throw unauthorized(
      "Your session is no longer valid. Please log in again.",
      "SESSION_INVALIDATED",
    );
  }

  if (row.revokedAt) {
    // Reuse of a rotated token: revoke the whole family.
    await runAsPlatform(() =>
      prisma.refreshToken.updateMany({
        where: { userId: row.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    );
    throw unauthorized(
      "Your session is no longer valid. Please log in again.",
      "SESSION_INVALIDATED",
    );
  }

  if (row.expiresAt < new Date()) {
    throw unauthorized("Your session has expired. Please log in again.", "SESSION_EXPIRED");
  }

  const user = await loadUserForSession(row.userId);

  if (!user || user.disabled) {
    throw unauthorized(
      "Your session is no longer valid. Please log in again.",
      "SESSION_INVALIDATED",
    );
  }

  await assertTenantMaySignIn(user.tenantId);

  // The atomic claim: only the request that flips `revokedAt` from null may issue
  // the replacement.
  const claimed = await runAsPlatform(() =>
    prisma.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  );

  if (claimed.count === 0) {
    throw unauthorized(
      "Your session is no longer valid. Please log in again.",
      "SESSION_INVALIDATED",
    );
  }

  return issueSession(user, row.realm, meta);
}

/**
 * Revokes a refresh token. Idempotent, and never reveals whether the token existed:
 * logging out an already-dead session is a success, not an error.
 *
 * Deliberately does **not** bump `User.tokenVersion`: signing out of one client must
 * not sign the user out of the others. The access token survives until it expires
 * (15 minutes), and a password change moves `tokenVersion` when every session really
 * does have to end — see `docs/decisions/0007-logout-revokes-the-refresh-token-not-the-user.md`.
 */
export async function logout(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);

  await runAsPlatform(() =>
    prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  );
}

/**
 * Changes a user's password.
 *
 * Bumping `tokenVersion` invalidates every access token already issued, and revoking
 * the refresh rows ends every session — including the caller's own, which is the
 * point: a password change is how someone evicts an intruder, so it must not leave
 * the intruder's session running.
 */
export async function changePassword(
  userId: string,
  tenantId: string,
  input: ChangePasswordInput,
): Promise<void> {
  await runAsTenant(tenantId, async () => {
    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      throw unauthorized(
        "Your session is no longer valid. Please log in again.",
        "SESSION_INVALIDATED",
      );
    }

    const currentMatches = await verifyPassword(input.currentPassword, user.passwordHash);
    if (!currentMatches) {
      throw unauthorized("Your current password is not right.", "INVALID_CREDENTIALS");
    }

    const passwordHash = await hashPassword(input.newPassword);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
  });

  await runAsPlatform(() =>
    prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  );
}

/**
 * Builds the payload of `GET /api/auth/me`.
 *
 * Entitlements are the tenant's *effective* set: every core module, plus each add-on
 * whose `TenantModule` row exists and has not lapsed. The front end uses them to hide
 * navigation; `requireModule` on the server stays the boundary, because hidden is not
 * secured.
 */
export async function loadProfile(user: AuthenticatedUser): Promise<AuthProfile> {
  const tenantId = user.tenantId;

  if (!tenantId) {
    throw forbidden("This session is not attached to a salon.", "TENANT_CONTEXT_REQUIRED");
  }

  return runAsTenant(tenantId, async () => {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true, slug: true, status: true },
    });

    if (!tenant) {
      throw unauthorized("Your salon is no longer available.", "TENANT_NOT_FOUND");
    }

    const [modules, held, latestSubscription] = await Promise.all([
      prisma.module.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.tenantModule.findMany(),
      prisma.subscription.findFirst({ orderBy: { endDate: "desc" }, select: { endDate: true } }),
    ]);

    const now = new Date();
    const entitlements = new Map(held.map((row) => [row.moduleId, row]));

    const effective: ModuleEntitlement[] = modules
      .filter((module) => {
        if (module.isCore) return true;
        const row = entitlements.get(module.id);
        if (!row) return false;
        return row.expiresAt === null || row.expiresAt > now;
      })
      .map((module) => ({
        code: module.code,
        name: module.name,
        category: module.category,
        isCore: module.isCore,
        expiresAt: entitlements.get(module.id)?.expiresAt?.toISOString() ?? null,
      }));

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        globalRole: user.globalRole,
        tenantId,
      },
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: resolveTenantStatus(tenant.status, latestSubscription?.endDate ?? null),
      },
      entitlements: effective,
    };
  });
}
