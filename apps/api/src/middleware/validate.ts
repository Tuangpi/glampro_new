import type { Request, RequestHandler } from 'express';
import type { ZodType } from 'zod';

export type ValidationSchemas = {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
};

/**
 * Parses request input with Zod and replaces it with the validated result.
 * Express 5 exposes `request.query` through a prototype getter, so parsed
 * query values are installed as an own property instead of being assigned.
 * Parse failures are forwarded to the error handler as `422 VALIDATION_ERROR`.
 */
export const validate =
  (schemas: ValidationSchemas): RequestHandler =>
  (request, _response, next) => {
    try {
      const validated: { body?: unknown; query?: unknown; params?: unknown } = {};

      if (schemas.params) {
        validated.params = schemas.params.parse(request.params);
        request.params = validated.params as Request['params'];
      }

      if (schemas.query) {
        validated.query = schemas.query.parse(request.query);
        Object.defineProperty(request, 'query', {
          value: validated.query,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      }

      if (schemas.body) {
        validated.body = schemas.body.parse(request.body);
        request.body = validated.body;
      }

      request.validated = validated;
      next();
    } catch (error) {
      next(error);
    }
  };

export const validatedBody = <TValue>(request: Request): TValue =>
  request.validated?.body as TValue;

export const validatedQuery = <TValue>(request: Request): TValue =>
  request.validated?.query as TValue;

export const validatedParams = <TValue>(request: Request): TValue =>
  request.validated?.params as TValue;
