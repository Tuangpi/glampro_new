import {
  acceptedInvitationDataSchema,
  apiErrorSchema,
  auditLogPageSchema,
  authenticatedSessionDataSchema,
  businessHoursDataSchema,
  currentUserDataSchema,
  emailVerifiedDataSchema,
  healthResponseSchema,
  invitationDataSchema,
  invitationsDataSchema,
  locationDataSchema,
  locationsDataSchema,
  logoutDataSchema,
  memberDataSchema,
  membersDataSchema,
  organizationSettingsSchema,
  passwordResetCompletedDataSchema,
  passwordResetRequestedDataSchema,
  refreshSessionDataSchema,
} from '@glampro/contracts';
import type {
  AcceptInvitationRequest,
  AuditLogPage,
  AuthenticatedSession,
  BusinessHour,
  ChangeMemberRoleRequest,
  ChangeMemberStatusRequest,
  CreateLocationRequest,
  EmailVerificationRequest,
  ForgotPasswordRequest,
  HealthResponse,
  InviteMemberRequest,
  LocationDetail,
  LoginRequest,
  MembershipSummary,
  OrganizationSettings,
  RegistrationRequest,
  ResetPasswordRequest,
  UpdateLocationRequest,
  UpdateOrganizationRequest,
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

/** Tenancy administration: organization and location settings. */

export const fetchOrganizationSettings = async (): Promise<OrganizationSettings> =>
  organizationSettingsSchema.parse(await apiRequest<unknown>('/api/v1/settings/organization'));

export const updateOrganizationSettings = async (
  input: UpdateOrganizationRequest,
): Promise<OrganizationSettings> =>
  organizationSettingsSchema.parse(
    await apiRequest<unknown>('/api/v1/settings/organization', { method: 'PATCH', body: input }),
  );

export const fetchLocations = async (): Promise<{ locations: LocationDetail[] }> =>
  locationsDataSchema.parse(await apiRequest<unknown>('/api/v1/locations'));

export const createLocation = async (
  input: CreateLocationRequest,
): Promise<{ location: LocationDetail }> =>
  locationDataSchema.parse(
    await apiRequest<unknown>('/api/v1/locations', { method: 'POST', body: input }),
  );

export const updateLocation = async (
  locationId: string,
  input: UpdateLocationRequest,
): Promise<{ location: LocationDetail }> =>
  locationDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/locations/${locationId}`, { method: 'PATCH', body: input }),
  );

export const fetchBusinessHours = async (locationId: string): Promise<{ hours: BusinessHour[] }> =>
  businessHoursDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/locations/${locationId}/business-hours`),
  );

export const updateBusinessHours = async (
  locationId: string,
  hours: BusinessHour[],
): Promise<{ hours: BusinessHour[] }> =>
  businessHoursDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/locations/${locationId}/business-hours`, {
      method: 'PUT',
      body: { hours },
    }),
  );

/** Tenancy administration: members and invitations. */

export const fetchMembers = async () =>
  membersDataSchema.parse(await apiRequest<unknown>('/api/v1/members'));

export const changeMemberRole = async (membershipId: string, input: ChangeMemberRoleRequest) =>
  memberDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/members/${membershipId}`, { method: 'PATCH', body: input }),
  );

export const changeMemberStatus = async (membershipId: string, input: ChangeMemberStatusRequest) =>
  memberDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/members/${membershipId}/status`, {
      method: 'PATCH',
      body: input,
    }),
  );

export const fetchInvitations = async () =>
  invitationsDataSchema.parse(await apiRequest<unknown>('/api/v1/invitations'));

export const createInvitation = async (input: InviteMemberRequest) =>
  invitationDataSchema.parse(
    await apiRequest<unknown>('/api/v1/invitations', { method: 'POST', body: input }),
  );

export const revokeInvitation = async (invitationId: string) =>
  invitationDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/invitations/${invitationId}`, { method: 'DELETE' }),
  );

export const acceptInvitation = async (
  input: AcceptInvitationRequest,
): Promise<{ membership: MembershipSummary }> =>
  acceptedInvitationDataSchema.parse(
    await apiRequest<unknown>('/api/v1/invitations/accept', { method: 'POST', body: input }),
  );

/** Tenancy administration: the tenant-scoped audit trail. */

export const fetchAuditLog = async (query: {
  page: number;
  pageSize: number;
}): Promise<AuditLogPage> =>
  auditLogPageSchema.parse(
    await apiRequest<unknown>(`/api/v1/audit?page=${query.page}&pageSize=${query.pageSize}`),
  );
