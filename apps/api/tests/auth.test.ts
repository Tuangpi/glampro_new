import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { hashRefreshToken } from '../src/modules/auth/tokens.js';
import { truncateAllTables } from './helpers/test-db.js';

const app = createApp();

const registrationInput = {
  firstName: 'Kai',
  lastName: 'Tan',
  email: 'owner@eurosense.test',
  password: 'SecurePassword123',
  organizationName: 'Eurosense Hair Studio',
  locationName: 'Tanjong Pagar',
};

type SessionCookies = { refreshToken: string; csrfToken: string };

const cookiesFrom = (response: request.Response): SessionCookies => {
  const raw = (response.headers['set-cookie'] ?? []) as unknown as string[];

  const valueOf = (name: string) => {
    const entry = raw.find((cookie) => cookie.startsWith(`${name}=`));
    if (!entry) {
      return '';
    }

    const separator = entry.indexOf('=');
    return decodeURIComponent((entry.slice(separator + 1).split(';')[0] ?? '').trim());
  };

  return { refreshToken: valueOf('glampro_refresh'), csrfToken: valueOf('glampro_csrf') };
};

const cookieHeader = (cookies: SessionCookies) =>
  [
    `glampro_refresh=${encodeURIComponent(cookies.refreshToken)}`,
    ...(cookies.csrfToken ? [`glampro_csrf=${encodeURIComponent(cookies.csrfToken)}`] : []),
  ].join('; ');

const register = () => request(app).post('/api/v1/auth/register').send(registrationInput);

const loginRequest = (password: string) =>
  request(app).post('/api/v1/auth/login').send({ email: registrationInput.email, password });

const login = async () => {
  const response = await loginRequest(registrationInput.password);
  expect(response.status).toBe(200);
  return response;
};

/** Registration also opens a session, so rotation assertions stay family-scoped. */
const familySessionsOf = async (refreshToken: string) => {
  const session = await prisma.authSession.findFirstOrThrow({
    where: { refreshTokenHash: hashRefreshToken(refreshToken) },
    select: { tokenFamilyId: true },
  });

  return prisma.authSession.findMany({
    where: { tokenFamilyId: session.tokenFamilyId },
    select: { refreshTokenHash: true, rotatedAt: true, revokedAt: true, tokenFamilyId: true },
    orderBy: { createdAt: 'asc' },
  });
};

beforeEach(async () => {
  await truncateAllTables();
});

describe('POST /api/v1/auth/register', () => {
  it('creates an organization owner, a location, and a session', async () => {
    const response = await register();
    expect(response.status).toBe(201);

    expect(response.body.data.user).toMatchObject({
      email: registrationInput.email,
      firstName: 'Kai',
      platformRole: 'USER',
      emailVerifiedAt: null,
    });
    expect(response.body.data.organizations).toHaveLength(1);
    expect(response.body.data.organizations[0]).toMatchObject({
      role: 'ORG_OWNER',
      status: 'ACTIVE',
      organization: { name: 'Eurosense Hair Studio', status: 'TRIAL', currency: 'SGD' },
    });
    expect(response.body.data.permissions).toContain('billing.manage');
    expect(response.body.data.accessToken).toEqual(expect.any(String));
    expect(response.body.meta.requestId).toEqual(expect.any(String));

    const cookies = cookiesFrom(response);
    expect(cookies.refreshToken).not.toBe('');
    expect(cookies.csrfToken).not.toBe('');
    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('HttpOnly')]),
    );

    const organization = await prisma.organization.findUniqueOrThrow({
      where: { slug: 'eurosense-hair-studio' },
      select: {
        status: true,
        locations: { select: { code: true, businessHours: { select: { dayOfWeek: true } } } },
        subscriptions: { select: { status: true, planCode: true } },
      },
    });

    expect(organization.status).toBe('TRIAL');
    expect(organization.locations).toHaveLength(1);
    expect(organization.locations[0]?.businessHours).toHaveLength(7);
    expect(organization.subscriptions[0]).toMatchObject({
      status: 'TRIALING',
      planCode: 'starter',
    });

    const auditEntry = await prisma.auditLog.findFirst({ where: { action: 'auth.registered' } });
    expect(auditEntry?.requestId).toEqual(expect.any(String));
  });

  it('rejects an email address that is already registered', async () => {
    await register();
    const response = await register();

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('rejects invalid input with the validation envelope', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ ...registrationInput, email: 'not-an-email', password: 'short' });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
    expect(response.body.error.details.fieldErrors).toHaveProperty('email');
    expect(response.body.error.details.fieldErrors).toHaveProperty('password');
  });
});

describe('POST /api/v1/auth/login', () => {
  it('signs in and resolves the organization context on /me', async () => {
    await register();
    const loginResponse = await login();
    const accessToken = loginResponse.body.data.accessToken as string;

    const meResponse = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${accessToken}`);

    expect(meResponse.status).toBe(200);
    expect(meResponse.body.data.membership).toMatchObject({ role: 'ORG_OWNER', status: 'ACTIVE' });
    expect(meResponse.body.data.activeOrganizationId).toBe(
      loginResponse.body.data.activeOrganizationId,
    );
    expect(meResponse.body.data.locations).toHaveLength(1);
    expect(meResponse.body.data.locations[0]).toMatchObject({
      name: 'Tanjong Pagar',
      code: 'TANJONGPAGAR',
      currency: 'SGD',
      isActive: true,
    });
    expect(meResponse.body.data.permissions).toEqual(
      expect.arrayContaining(['sales.create', 'sales.refund', 'members.manage']),
    );
  });

  it('rejects an unknown email and a wrong password with the same error', async () => {
    await register();

    const unknownEmail = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@eurosense.test', password: registrationInput.password });
    const wrongPassword = await loginRequest('WrongPassword123');

    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(wrongPassword.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(unknownEmail.body.error.message).toBe(wrongPassword.body.error.message);

    const failures = await prisma.auditLog.count({ where: { action: 'auth.login_failed' } });
    expect(failures).toBe(2);
  });

  it('requires authentication for protected routes', async () => {
    const response = await request(app).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });
});

describe('refresh token rotation', () => {
  it('issues a new refresh token on every use and retires the previous one', async () => {
    await register();
    const session = await login();
    const issued = cookiesFrom(session);
    const retiredAccessToken = session.body.data.accessToken as string;

    const refreshed = await request(app)
      .post('/api/v1/auth/refresh')
      .set('cookie', cookieHeader(issued))
      .set('x-csrf-token', issued.csrfToken);

    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.accessToken).toEqual(expect.any(String));

    const rotated = cookiesFrom(refreshed);
    expect(rotated.refreshToken).not.toBe(issued.refreshToken);

    const sessions = await familySessionsOf(issued.refreshToken);

    expect(sessions).toHaveLength(2);
    expect(sessions[0]?.refreshTokenHash).toBe(hashRefreshToken(issued.refreshToken));
    expect(sessions[0]?.rotatedAt).not.toBeNull();
    expect(sessions[0]?.revokedAt).toBeNull();
    expect(sessions[0]?.tokenFamilyId).toBe(sessions[1]?.tokenFamilyId);
    expect(sessions[1]?.rotatedAt).toBeNull();

    // The access token anchored to the retired session stops working at once.
    const retiredCall = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${retiredAccessToken}`);

    expect(retiredCall.status).toBe(401);
    expect(retiredCall.body.error.code).toBe('SESSION_REVOKED');

    // The live chain is listed once, not once per rotation.
    const listed = await request(app)
      .get('/api/v1/auth/sessions')
      .set('authorization', `Bearer ${refreshed.body.data.accessToken as string}`);

    expect(listed.status).toBe(200);
    const listedSessions = listed.body.data.sessions as { isCurrent: boolean }[];
    expect(listedSessions).toHaveLength(2);
    expect(listedSessions.filter((entry) => entry.isCurrent)).toHaveLength(1);

    const second = await request(app)
      .post('/api/v1/auth/refresh')
      .set('cookie', cookieHeader(rotated))
      .set('x-csrf-token', rotated.csrfToken);

    expect(second.status).toBe(200);
  });

  it('revokes the whole family when a retired token is replayed later', async () => {
    await register();
    const issued = cookiesFrom(await login());

    await request(app)
      .post('/api/v1/auth/refresh')
      .set('cookie', cookieHeader(issued))
      .set('x-csrf-token', issued.csrfToken)
      .expect(200);

    // Move the rotation outside the tolerated double-submit window.
    await prisma.authSession.updateMany({
      where: { refreshTokenHash: hashRefreshToken(issued.refreshToken) },
      data: { rotatedAt: new Date(Date.now() - 60_000) },
    });

    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set('cookie', cookieHeader(issued))
      .set('x-csrf-token', issued.csrfToken);

    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe('SESSION_REVOKED');

    const sessions = await familySessionsOf(issued.refreshToken);
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);

    const auditEntry = await prisma.auditLog.findFirst({
      where: { action: 'auth.refresh_reuse_detected' },
    });
    expect(auditEntry).not.toBeNull();
  });

  it('tolerates a repeated refresh inside the grace window without revoking the family', async () => {
    await register();
    const issued = cookiesFrom(await login());

    const first = await request(app)
      .post('/api/v1/auth/refresh')
      .set('cookie', cookieHeader(issued))
      .set('x-csrf-token', issued.csrfToken)
      .expect(200);
    const rotated = cookiesFrom(first);

    const duplicate = await request(app)
      .post('/api/v1/auth/refresh')
      .set('cookie', cookieHeader(issued))
      .set('x-csrf-token', issued.csrfToken);

    expect(duplicate.status).toBe(401);
    expect(duplicate.body.error.code).toBe('INVALID_TOKEN');

    const stillValid = await request(app)
      .post('/api/v1/auth/refresh')
      .set('cookie', cookieHeader(rotated))
      .set('x-csrf-token', rotated.csrfToken);

    expect(stillValid.status).toBe(200);
  });

  it('rejects a refresh without a CSRF token and without a session cookie', async () => {
    await register();
    const issued = cookiesFrom(await login());

    const withoutCsrf = await request(app)
      .post('/api/v1/auth/refresh')
      .set('cookie', `glampro_refresh=${encodeURIComponent(issued.refreshToken)}`);

    expect(withoutCsrf.status).toBe(403);
    expect(withoutCsrf.body.error.code).toBe('CSRF_INVALID');

    const withoutSession = await request(app).post('/api/v1/auth/refresh');

    expect(withoutSession.status).toBe(401);
    expect(withoutSession.body.error.code).toBe('AUTHENTICATION_REQUIRED');
  });
});

describe('session management', () => {
  it('lists active sessions and revokes the current one on logout', async () => {
    await register();
    const session = await login();
    const cookies = cookiesFrom(session);
    const accessToken = session.body.data.accessToken as string;

    const listed = await request(app)
      .get('/api/v1/auth/sessions')
      .set('authorization', `Bearer ${accessToken}`);

    expect(listed.status).toBe(200);
    const sessions = listed.body.data.sessions as { isCurrent: boolean }[];
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((entry) => entry.isCurrent)).toHaveLength(1);

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('cookie', cookieHeader(cookies))
      .set('x-csrf-token', cookies.csrfToken);

    expect(logout.status).toBe(200);
    expect(logout.body.data.revokedSessions).toBe(1);

    const afterLogout = await request(app)
      .get('/api/v1/auth/me')
      .set('authorization', `Bearer ${accessToken}`);

    expect(afterLogout.status).toBe(401);
    expect(afterLogout.body.error.code).toBe('SESSION_REVOKED');

    const refreshAfterLogout = await request(app)
      .post('/api/v1/auth/refresh')
      .set('cookie', cookieHeader(cookies))
      .set('x-csrf-token', cookies.csrfToken);

    expect(refreshAfterLogout.status).toBe(401);
    expect(refreshAfterLogout.body.error.code).toBe('SESSION_REVOKED');
  });
});

describe('password reset and email verification', () => {
  it('does not reveal whether an account exists and issues a reset token otherwise', async () => {
    const unknown = await request(app)
      .post('/api/v1/auth/password/forgot')
      .send({ email: 'stranger@eurosense.test' });

    expect(unknown.status).toBe(202);
    expect(unknown.body.data).toEqual({ requested: true });
    expect(await prisma.passwordResetToken.count()).toBe(0);

    await register();
    const known = await request(app)
      .post('/api/v1/auth/password/forgot')
      .send({ email: registrationInput.email });

    expect(known.status).toBe(202);
    expect(await prisma.passwordResetToken.count()).toBe(1);
  });

  it('resets the password, revokes every session, and refuses to reuse the token', async () => {
    await register();
    await request(app)
      .post('/api/v1/auth/password/forgot')
      .send({ email: registrationInput.email })
      .expect(202);

    // The raw token only exists in the email, so the stored hash is replaced
    // with the hash of a token the test controls.
    const resetToken = 'known-reset-token';
    await prisma.passwordResetToken.updateMany({
      data: { tokenHash: hashRefreshToken(resetToken) },
    });

    const reset = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token: resetToken, password: 'NewSecurePassword123' });

    expect(reset.status).toBe(200);
    expect(reset.body.data).toEqual({ completed: true });

    const liveSessions = await prisma.authSession.count({ where: { revokedAt: null } });
    expect(liveSessions).toBe(0);

    const reused = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ token: resetToken, password: 'AnotherSecurePassword123' });

    expect(reused.status).toBe(400);
    expect(reused.body.error.code).toBe('INVALID_TOKEN');

    const oldPassword = await loginRequest(registrationInput.password);
    expect(oldPassword.status).toBe(401);

    const newPassword = await loginRequest('NewSecurePassword123');
    expect(newPassword.status).toBe(200);
  });

  it('verifies an email address once', async () => {
    await register();
    const verificationToken = 'known-verification-token';
    await prisma.emailVerificationToken.updateMany({
      data: { tokenHash: hashRefreshToken(verificationToken) },
    });

    const verified = await request(app)
      .post('/api/v1/auth/email/verify')
      .send({ token: verificationToken });

    expect(verified.status).toBe(200);
    expect(verified.body.data).toEqual({ verified: true });

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: registrationInput.email },
      select: { emailVerifiedAt: true },
    });
    expect(user.emailVerifiedAt).not.toBeNull();

    const replay = await request(app)
      .post('/api/v1/auth/email/verify')
      .send({ token: verificationToken });

    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('INVALID_TOKEN');
  });
});
