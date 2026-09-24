import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  apiRequest,
  fetchDashboard,
  fetchRevenueReport,
  setSessionRefreshHandler,
} from './api';

const meta = { requestId: 'req_test', timestamp: '2026-09-23T02:00:00.000Z' };

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const stubFetch = (...responses: Response[]) => {
  const mock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
    async () => responses.shift() ?? jsonResponse(500, {}),
  );
  vi.stubGlobal('fetch', mock);
  return mock;
};

afterEach(() => {
  setSessionRefreshHandler(null);
  vi.unstubAllGlobals();
});

const DashboardPayload = {
  period: {
    location: {
      id: 'loc_1',
      organizationId: 'org_1',
      name: 'Tanjong Pagar',
      code: 'TPG',
      timezone: 'Asia/Singapore',
      currency: 'SGD',
      isActive: true,
    },
    from: '2026-09-24',
    to: '2026-09-24',
    startsAt: '2026-09-23T16:00:00.000Z',
    endsAt: '2026-09-24T16:00:00.000Z',
  },
  kpis: {
    netSalesInCents: 8100,
    appointmentCount: 1,
    uniquePayingCustomers: 1,
    averageTicketInCents: 8100,
  },
  appointments: [],
  recentSales: [],
  topItems: [],
};

describe('reporting API client', () => {
  it('serializes and unwraps the named dashboard response', async () => {
    const fetchMock = stubFetch(jsonResponse(200, { data: { dashboard: DashboardPayload }, meta }));

    await expect(fetchDashboard({ locationId: 'loc_1', date: '2026-09-24' })).resolves.toEqual(
      DashboardPayload,
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/v1/dashboard?locationId=loc_1&date=2026-09-24');
  });

  it('validates report ranges before making a request', async () => {
    const fetchMock = stubFetch();

    await expect(
      fetchRevenueReport({ locationId: 'loc_1', from: '2026-09-25', to: '2026-09-24' }),
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('apiRequest', () => {
  it('unwraps the success envelope', async () => {
    stubFetch(jsonResponse(200, { data: { value: 42 }, meta }));

    await expect(apiRequest<{ value: number }>('/api/v1/example')).resolves.toEqual({ value: 42 });
  });

  it('raises a typed error from the failure envelope', async () => {
    stubFetch(
      jsonResponse(403, {
        error: { code: 'PERMISSION_DENIED', message: 'You do not have permission' },
        meta,
      }),
    );

    await expect(apiRequest('/api/v1/example')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      code: 'PERMISSION_DENIED',
      message: 'You do not have permission',
    });
  });

  it('renewed the access token once and retried the request', async () => {
    const fetchMock = stubFetch(
      jsonResponse(401, { error: { code: 'SESSION_EXPIRED', message: 'expired' }, meta }),
      jsonResponse(200, { data: { value: 'retried' }, meta }),
    );
    setSessionRefreshHandler(async () => 'renewed-token');

    await expect(
      apiRequest<{ value: string }>('/api/v1/example', { accessToken: 'expired-token' }),
    ).resolves.toEqual({ value: 'retried' });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    expect((retryInit.headers as Record<string, string>).authorization).toBe(
      'Bearer renewed-token',
    );
  });

  it('does not retry without a refresh handler', async () => {
    const fetchMock = stubFetch(
      jsonResponse(401, { error: { code: 'SESSION_EXPIRED', message: 'expired' }, meta }),
    );

    await expect(
      apiRequest('/api/v1/example', { accessToken: 'expired-token' }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the session can no longer be renewed', async () => {
    const fetchMock = stubFetch(
      jsonResponse(401, { error: { code: 'SESSION_EXPIRED', message: 'expired' }, meta }),
    );
    setSessionRefreshHandler(async () => null);

    await expect(
      apiRequest('/api/v1/example', { accessToken: 'expired-token' }),
    ).rejects.toBeInstanceOf(ApiError);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
