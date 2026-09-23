import type { Request } from 'express';

export const responseMeta = (request: Request) => ({
  requestId: request.id,
  timestamp: new Date().toISOString(),
});
