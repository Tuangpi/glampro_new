import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('health routes', () => {
  it('returns API liveness information and a request ID', async () => {
    const response = await request(createApp()).get('/api/v1/health').expect(200);

    expect(response.body.data).toMatchObject({ service: 'glampro-api', status: 'ok' });
    expect(response.body.meta.requestId).toEqual(expect.any(String));
    expect(response.headers['x-request-id']).toBe(response.body.meta.requestId);
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const response = await request(createApp()).get('/api/v1/missing').expect(404);

    expect(response.body.error.code).toBe('ROUTE_NOT_FOUND');
    expect(response.body.meta.requestId).toEqual(expect.any(String));
  });
});
