import {
  apiErrorSchema,
  authenticatedSessionDataSchema,
  currentUserDataSchema,
  emailVerifiedDataSchema,
  healthResponseSchema,
  logoutDataSchema,
  passwordResetCompletedDataSchema,
  passwordResetRequestedDataSchema,
  refreshSessionDataSchema,
} from '@glampro/contracts';
import type {
  AuthenticatedSession,
  EmailVerificationRequest,
  ForgotPasswordRequest,
  HealthResponse,
  LoginRequest,
  RegistrationRequest,
  ResetPasswordRequest,
} from '@glampro/contracts';

const apiBaseUrl = import.meta.env.VITE_API_URL ?? '';
const csrfCookieName = 'glampro_csrf';

export class ApiError extends Error {
  public readonly status: number;
  public readonly code: string;
  public readonly details?: unknown;

  public constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** The CSRF token is a readable cookie so the browser can echo it back. */
const readCookie = (name: string) => {
  const match = document.cookie.split('; ').find((entry) => entry.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
};

type ApiRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  accessToken?: string | null;
  organizationId?: string | null;
};

type RequestOutcome<TData> =
  { ok: true; data: TData } | { ok: false; status: number; error: ApiError };

type SessionRefreshHandler = () => Promise<string | null>;

let sessionRefreshHandler: SessionRefreshHandler | null = null;

/**
 * Lets the auth provider hand a fresh access token to API calls that raced the
 * token's expiry, so a screen does not have to handle renewal itself.
 */
export const setSessionRefreshHandler = (handler: SessionRefreshHandler | null) => {
  sessionRefreshHandler = handler;
};

const sendRequest = async <TData>(
  path: string,
  options: ApiRequestOptions,
): Promise<RequestOutcome<TData>> => {
  const { method = 'GET', body, accessToken, organizationId } = options;
  const csrfToken = method === 'GET' ? null : readCookie(csrfCookieName);

  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...(organizationId ? { 'x-organization-id': organizationId } : {}),
        ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      error: new ApiError(0, 'INTERNAL_SERVER_ERROR', 'The GlamPro API could not be reached'),
    };
  }

  const payload: unknown = await response.json().catch(() => null);

  if (response.ok) {
    return { ok: true, data: (payload as { data: TData }).data };
  }

  const parsed = apiErrorSchema.safeParse(payload);

  return {
    ok: false,
    status: response.status,
    error: parsed.success
      ? new ApiError(
          response.status,
          parsed.data.error.code,
          parsed.data.error.message,
          parsed.data.error.details,
        )
      : new ApiError(
          response.status,
          'INTERNAL_SERVER_ERROR',
          'The request could not be completed',
        ),
  };
};

/**
 * Performs a credentialed request and unwraps the `{ data, meta }` success
 * envelope. An expired access token is renewed once and the request retried;
 * every other failure is raised as `ApiError` so callers branch on codes.
 */
export const apiRequest = async <TData>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<TData> => {
  const attempt = await sendRequest<TData>(path, options);

  if (attempt.ok) {
    return attempt.data;
  }

  if (
    attempt.status === 401 &&
    attempt.error.code === 'SESSION_EXPIRED' &&
    options.accessToken &&
    sessionRefreshHandler
  ) {
    const renewedToken = await sessionRefreshHandler();

    if (renewedToken) {
      const retry = await sendRequest<TData>(path, { ...options, accessToken: renewedToken });

      if (retry.ok) {
        return retry.data;
      }

      throw retry.error;
    }
  }

  throw attempt.error;
};

export const apiErrorMessage = (error: unknown) =>
  error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';

export const getApiHealth = async (): Promise<HealthResponse> =>
  healthResponseSchema.parse(await apiRequest<unknown>('/api/v1/health'));

export const loginUser = async (input: LoginRequest): Promise<AuthenticatedSession> =>
  authenticatedSessionDataSchema.parse(
    await apiRequest<unknown>('/api/v1/auth/login', { method: 'POST', body: input }),
  );

export const registerOrganization = async (
  input: RegistrationRequest,
): Promise<AuthenticatedSession> =>
  authenticatedSessionDataSchema.parse(
    await apiRequest<unknown>('/api/v1/auth/register', { method: 'POST', body: input }),
  );

export const refreshSession = async () =>
  refreshSessionDataSchema.parse(
    await apiRequest<unknown>('/api/v1/auth/refresh', { method: 'POST' }),
  );

export const fetchCurrentUser = async (options: {
  accessToken: string;
  organizationId?: string | null;
}) =>
  currentUserDataSchema.parse(
    await apiRequest<unknown>('/api/v1/auth/me', {
      accessToken: options.accessToken,
      organizationId: options.organizationId ?? null,
    }),
  );

export const signOut = async () =>
  logoutDataSchema.parse(await apiRequest<unknown>('/api/v1/auth/logout', { method: 'POST' }));

export const requestPasswordReset = async (input: ForgotPasswordRequest) =>
  passwordResetRequestedDataSchema.parse(
    await apiRequest<unknown>('/api/v1/auth/password/forgot', { method: 'POST', body: input }),
  );

export const completePasswordReset = async (input: ResetPasswordRequest) =>
  passwordResetCompletedDataSchema.parse(
    await apiRequest<unknown>('/api/v1/auth/password/reset', { method: 'POST', body: input }),
  );

export const verifyEmailAddress = async (input: EmailVerificationRequest) =>
  emailVerifiedDataSchema.parse(
    await apiRequest<unknown>('/api/v1/auth/email/verify', { method: 'POST', body: input }),
  );
