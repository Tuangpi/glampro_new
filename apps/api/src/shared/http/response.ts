import type { Request, Response } from 'express';

export const responseMeta = (request: Request) => ({
  requestId: request.id,
  timestamp: new Date().toISOString(),
});

/** Renders the standard success envelope so routes stay declarative. */
export const respondSuccess = <TData>(
  request: Request,
  response: Response,
  data: TData,
  statusCode = 200,
) => response.status(statusCode).json({ data, meta: responseMeta(request) });
