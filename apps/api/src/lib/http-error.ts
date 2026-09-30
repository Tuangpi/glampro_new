/**
 * Transport-agnostic HTTP error.
 *
 * Thrown anywhere in a handler/service and converted into an `ApiErrorBody` by
 * `middleware/errorHandler.ts`. Keeping it free of Express types means services
 * and utilities can throw it without importing the framework.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    message: string,
    options?: { code?: string; details?: unknown; cause?: unknown },
  ) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
    this.code = options?.code;
    this.details = options?.details;
    if (options?.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export const badRequest = (message: string, details?: unknown): HttpError =>
  new HttpError(400, message, { code: "BAD_REQUEST", details });

export const validationFailed = (details: unknown): HttpError =>
  new HttpError(422, "Validation failed", { code: "VALIDATION_FAILED", details });

export const unauthorized = (message = "Unauthorized", code = "UNAUTHORIZED"): HttpError =>
  new HttpError(401, message, { code });

export const forbidden = (message = "Forbidden", code = "FORBIDDEN"): HttpError =>
  new HttpError(403, message, { code });

export const notFound = (message = "Not found", code = "NOT_FOUND"): HttpError =>
  new HttpError(404, message, { code });

export const conflict = (message: string, code = "CONFLICT"): HttpError =>
  new HttpError(409, message, { code });
