import {
  acceptedInvitationDataSchema,
  apiErrorSchema,
  auditLogPageSchema,
  authenticatedSessionDataSchema,
  businessHoursDataSchema,
  currentUserDataSchema,
  customerDataSchema,
  customerDetailDataSchema,
  customerNoteDataSchema,
  customerNotesDataSchema,
  customersDataSchema,
  emailVerifiedDataSchema,
  healthResponseSchema,
  inventoryLevelsDataSchema,
  inventoryMovementDataSchema,
  inventoryMovementsDataSchema,
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
  productCategoriesDataSchema,
  productCategoryDataSchema,
  productDataSchema,
  productsDataSchema,
  refreshSessionDataSchema,
  serviceCategoriesDataSchema,
  serviceCategoryDataSchema,
  serviceDataSchema,
  servicesDataSchema,
  staffCandidatesDataSchema,
  staffProfileDataSchema,
  staffProfileDetailDataSchema,
  staffProfilesDataSchema,
  staffScheduleDataSchema,
  staffServicesDataSchema,
  staffTimeOffDataSchema,
  staffTimeOffEntryDataSchema,
} from '@glampro/contracts';
import type {
  AcceptInvitationRequest,
  AuditLogPage,
  AuthenticatedSession,
  BusinessHour,
  ChangeMemberRoleRequest,
  ChangeMemberStatusRequest,
  CreateCustomerNoteRequest,
  CreateLocationRequest,
  CustomerDetail,
  CustomerNoteSummary,
  CustomerRequest,
  CustomerSummary,
  EmailVerificationRequest,
  ForgotPasswordRequest,
  HealthResponse,
  InventoryLevelSummary,
  InventoryMovementRequest,
  InventoryMovementSummary,
  InviteMemberRequest,
  LocationDetail,
  LoginRequest,
  MembershipSummary,
  OrganizationSettings,
  ProductCategoryRequest,
  ProductCategorySummary,
  ProductRequest,
  ProductSummary,
  RegistrationRequest,
  ReplaceStaffServicesRequest,
  ResetPasswordRequest,
  ServiceCategoryRequest,
  ServiceCategorySummary,
  ServiceRequest,
  ServiceSummary,
  StaffCandidate,
  StaffProfileDetail,
  StaffProfileRequest,
  StaffProfileSummary,
  StaffScheduleRequest,
  StaffScheduleSummary,
  StaffTimeOffRequest,
  StaffTimeOffSummary,
  UpdateCustomerRequest,
  UpdateLocationRequest,
  UpdateOrganizationRequest,
  UpdateProductCategoryRequest,
  UpdateProductRequest,
  UpdateServiceCategoryRequest,
  UpdateServiceRequest,
  UpdateStaffProfileRequest,
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

/** Catalog: service and product categories, services, and products. */

export const fetchServiceCategories = async (): Promise<{
  serviceCategories: ServiceCategorySummary[];
}> => serviceCategoriesDataSchema.parse(await apiRequest<unknown>('/api/v1/service-categories'));

export const createServiceCategory = async (input: ServiceCategoryRequest) =>
  serviceCategoryDataSchema.parse(
    await apiRequest<unknown>('/api/v1/service-categories', { method: 'POST', body: input }),
  );

export const updateServiceCategory = async (
  serviceCategoryId: string,
  input: UpdateServiceCategoryRequest,
) =>
  serviceCategoryDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/service-categories/${serviceCategoryId}`, {
      method: 'PATCH',
      body: input,
    }),
  );

export const fetchServices = async (
  query: {
    serviceCategoryId?: string;
  } = {},
): Promise<{ services: ServiceSummary[] }> =>
  servicesDataSchema.parse(
    await apiRequest<unknown>(
      query.serviceCategoryId
        ? `/api/v1/services?serviceCategoryId=${query.serviceCategoryId}`
        : '/api/v1/services',
    ),
  );

export const createService = async (input: ServiceRequest) =>
  serviceDataSchema.parse(
    await apiRequest<unknown>('/api/v1/services', { method: 'POST', body: input }),
  );

export const updateService = async (serviceId: string, input: UpdateServiceRequest) =>
  serviceDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/services/${serviceId}`, { method: 'PATCH', body: input }),
  );

export const fetchProductCategories = async (): Promise<{
  productCategories: ProductCategorySummary[];
}> => productCategoriesDataSchema.parse(await apiRequest<unknown>('/api/v1/product-categories'));

export const createProductCategory = async (input: ProductCategoryRequest) =>
  productCategoryDataSchema.parse(
    await apiRequest<unknown>('/api/v1/product-categories', { method: 'POST', body: input }),
  );

export const updateProductCategory = async (
  productCategoryId: string,
  input: UpdateProductCategoryRequest,
) =>
  productCategoryDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/product-categories/${productCategoryId}`, {
      method: 'PATCH',
      body: input,
    }),
  );

export const fetchProducts = async (
  query: {
    productCategoryId?: string;
  } = {},
): Promise<{ products: ProductSummary[] }> =>
  productsDataSchema.parse(
    await apiRequest<unknown>(
      query.productCategoryId
        ? `/api/v1/products?productCategoryId=${query.productCategoryId}`
        : '/api/v1/products',
    ),
  );

export const createProduct = async (input: ProductRequest) =>
  productDataSchema.parse(
    await apiRequest<unknown>('/api/v1/products', { method: 'POST', body: input }),
  );

export const updateProduct = async (productId: string, input: UpdateProductRequest) =>
  productDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/products/${productId}`, { method: 'PATCH', body: input }),
  );

/** Inventory: current levels and the append-only movement ledger. */

export const fetchInventoryLevels = async (
  query: {
    locationId?: string;
  } = {},
): Promise<{ inventoryLevels: InventoryLevelSummary[] }> =>
  inventoryLevelsDataSchema.parse(
    await apiRequest<unknown>(
      query.locationId
        ? `/api/v1/inventory/levels?locationId=${query.locationId}`
        : '/api/v1/inventory/levels',
    ),
  );

export const fetchInventoryMovements = async (
  query: {
    productId?: string;
  } = {},
): Promise<{ inventoryMovements: InventoryMovementSummary[] }> =>
  inventoryMovementsDataSchema.parse(
    await apiRequest<unknown>(
      query.productId
        ? `/api/v1/inventory/movements?productId=${query.productId}`
        : '/api/v1/inventory/movements',
    ),
  );

export const createInventoryMovement = async (input: InventoryMovementRequest) =>
  inventoryMovementDataSchema.parse(
    await apiRequest<unknown>('/api/v1/inventory/movements', { method: 'POST', body: input }),
  );

type CustomerListQuery = { q?: string; limit?: number; isActive?: boolean };

/** Query values are optional, so anything undefined is left out entirely. */
const queryStringOf = (params: Record<string, string | number | boolean | undefined>) => {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      search.set(key, String(value));
    }
  }

  const query = search.toString();
  return query === '' ? '' : `?${query}`;
};

/** Customers: search, profiles, and the append-only note timeline. */

export const fetchCustomers = async (
  query: CustomerListQuery = {},
): Promise<{ customers: CustomerSummary[] }> =>
  customersDataSchema.parse(await apiRequest<unknown>(`/api/v1/customers${queryStringOf(query)}`));

export const fetchCustomer = async (customerId: string): Promise<{ customer: CustomerDetail }> =>
  customerDetailDataSchema.parse(await apiRequest<unknown>(`/api/v1/customers/${customerId}`));

export const createCustomer = async (input: CustomerRequest) =>
  customerDataSchema.parse(
    await apiRequest<unknown>('/api/v1/customers', { method: 'POST', body: input }),
  );

export const updateCustomer = async (customerId: string, input: UpdateCustomerRequest) =>
  customerDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/customers/${customerId}`, { method: 'PATCH', body: input }),
  );

export const fetchCustomerNotes = async (
  customerId: string,
): Promise<{ notes: CustomerNoteSummary[] }> =>
  customerNotesDataSchema.parse(await apiRequest<unknown>(`/api/v1/customers/${customerId}/notes`));

export const createCustomerNote = async (customerId: string, input: CreateCustomerNoteRequest) =>
  customerNoteDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/customers/${customerId}/notes`, {
      method: 'POST',
      body: input,
    }),
  );

type StaffListQuery = { serviceId?: string; isActive?: boolean };

/** Staff: the roster, its service assignments, its week, and its time off. */

export const fetchStaffProfiles = async (
  query: StaffListQuery = {},
): Promise<{ staffProfiles: StaffProfileSummary[] }> =>
  staffProfilesDataSchema.parse(await apiRequest<unknown>(`/api/v1/staff${queryStringOf(query)}`));

export const fetchStaffProfile = async (
  staffProfileId: string,
): Promise<{ staffProfile: StaffProfileDetail }> =>
  staffProfileDetailDataSchema.parse(await apiRequest<unknown>(`/api/v1/staff/${staffProfileId}`));

/** Active members without a profile yet — the choices in the create form. */
export const fetchStaffCandidates = async (): Promise<{ candidates: StaffCandidate[] }> =>
  staffCandidatesDataSchema.parse(await apiRequest<unknown>('/api/v1/staff/candidates'));

export const createStaffProfile = async (input: StaffProfileRequest) =>
  staffProfileDataSchema.parse(
    await apiRequest<unknown>('/api/v1/staff', { method: 'POST', body: input }),
  );

export const updateStaffProfile = async (
  staffProfileId: string,
  input: UpdateStaffProfileRequest,
) =>
  staffProfileDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/staff/${staffProfileId}`, { method: 'PATCH', body: input }),
  );

export const fetchStaffServices = async (
  staffProfileId: string,
): Promise<{ services: ServiceSummary[] }> =>
  staffServicesDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/staff/${staffProfileId}/services`),
  );

export const replaceStaffServices = async (
  staffProfileId: string,
  input: ReplaceStaffServicesRequest,
) =>
  staffServicesDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/staff/${staffProfileId}/services`, {
      method: 'PUT',
      body: input,
    }),
  );

export const fetchStaffSchedule = async (
  staffProfileId: string,
): Promise<{ schedule: StaffScheduleSummary[] }> =>
  staffScheduleDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/staff/${staffProfileId}/schedule`),
  );

export const replaceStaffSchedule = async (staffProfileId: string, input: StaffScheduleRequest) =>
  staffScheduleDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/staff/${staffProfileId}/schedule`, {
      method: 'PUT',
      body: input,
    }),
  );

export const fetchStaffTimeOff = async (
  staffProfileId: string,
): Promise<{ timeOff: StaffTimeOffSummary[] }> =>
  staffTimeOffDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/staff/${staffProfileId}/time-off`),
  );

export const createStaffTimeOff = async (staffProfileId: string, input: StaffTimeOffRequest) =>
  staffTimeOffEntryDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/staff/${staffProfileId}/time-off`, {
      method: 'POST',
      body: input,
    }),
  );

export const removeStaffTimeOff = async (staffProfileId: string, timeOffId: string) =>
  staffTimeOffEntryDataSchema.parse(
    await apiRequest<unknown>(`/api/v1/staff/${staffProfileId}/time-off/${timeOffId}`, {
      method: 'DELETE',
    }),
  );
