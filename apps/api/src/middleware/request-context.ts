import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const requestContext = (request: Request, response: Response, next: NextFunction) => {
  const suppliedRequestId = request.header('x-request-id');
  request.id = suppliedRequestId?.slice(0, 100) || randomUUID();
  response.setHeader('x-request-id', request.id);
  next();
};
