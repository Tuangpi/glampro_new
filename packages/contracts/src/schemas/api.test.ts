import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { apiEnvelopeSchema, apiErrorCodes, apiErrorSchema, isApiErrorCode } from './api.js';

describe('apiErrorCodes', () => {
  it('lists unique codes', () => {
    expect(new Set(apiErrorCodes).size).toBe(apiErrorCodes.length);
  });

  it('narrows values to known codes', () => {
    expect(isApiErrorCode('PERMISSION_DENIED')).toBe(true);
    expect(isApiErrorCode('SOMETHING_UNKNOWN')).toBe(false);
  });
});

describe('apiErrorSchema', () => {
  it('parses the failure envelope', () => {
    const parsed = apiErrorSchema.parse({
      error: { code: 'PERMISSION_DENIED', message: 'You do not have permission for this action' },
      meta: { requestId: 'req_1', timestamp: '2026-09-23T02:00:00.000Z' },
    });

    expect(parsed.error.code).toBe('PERMISSION_DENIED');
    expect(parsed.meta.requestId).toBe('req_1');
  });

  it('rejects a failure envelope without metadata', () => {
    expect(() => apiErrorSchema.parse({ error: { code: 'X', message: 'y' } })).toThrow();
  });
});

describe('apiEnvelopeSchema', () => {
  it('wraps a payload schema in the success envelope', () => {
    const schema = apiEnvelopeSchema(z.object({ value: z.number() }));
    const parsed = schema.parse({
      data: { value: 1 },
      meta: { requestId: 'req_2', timestamp: '2026-09-23T02:00:00.000Z' },
    });

    expect(parsed.data.value).toBe(1);
  });
});
