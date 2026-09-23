import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { AppError } from '../shared/http/app-error.js';
import { responseMeta } from '../shared/http/response.js';

export const notFoundHandler: RequestHandler = (request, _response, next) => {
  next(
    new AppError(404, 'ROUTE_NOT_FOUND', `Route ${request.method} ${request.path} was not found`),
  );
};

export const errorHandler: ErrorRequestHandler = (error: unknown, request, response, _next) => {
  if (error instanceof ZodError) {
    response.status(422).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The request contains invalid data',
        details: error.flatten(),
      },
      meta: responseMeta(request),
    });
    return;
  }

  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
      meta: responseMeta(request),
    });
    return;
  }

  logger.error({ err: error, requestId: request.id }, 'Unhandled request error');

  response.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      ...(env.NODE_ENV === 'development' && error instanceof Error
        ? { details: error.message }
        : {}),
    },
    meta: responseMeta(request),
  });
};
