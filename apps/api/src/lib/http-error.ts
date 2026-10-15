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

/**
 * 400 with an optional machine-readable `code`.
 *
 * `code` sits **third** because the sale flow passes field-level `details` as
 * the second argument in several places, and reordering those callers is not
 * this file's business. Both matter: `details` tells the browser which control
 * to highlight, `code` tells it what happened without matching prose
 * (`appointment.service.ts` and `shift.service.ts` both pass a code).
 */
export const badRequest = (message: string, details?: unknown, code = "BAD_REQUEST"): HttpError =>
  new HttpError(400, message, { code, details });

export const validationFailed = (details: unknown): HttpError =>
  new HttpError(422, "Validation failed", { code: "VALIDATION_FAILED", details });

export const unauthorized = (message = "Unauthorized", code = "UNAUTHORIZED"): HttpError =>
  new HttpError(401, message, { code });

export const forbidden = (
  message = "Forbidden",
  code = "FORBIDDEN",
  details?: unknown,
): HttpError => new HttpError(403, message, { code, details });

export const notFound = (message = "Not found", code = "NOT_FOUND"): HttpError =>
  new HttpError(404, message, { code });

/**
 * A 409, for a write that collides with something that already exists.
 *
 * `details` is the same `[{ path, message }]` shape a 422 carries, so the browser
 * puts a conflict on the **control that caused it** rather than at the top of the
 * form: the staff form is the first caller, and "that email already has an
 * account" belongs on the email field, not in a banner.
 */
export const conflict = (message: string, code = "CONFLICT", details?: unknown): HttpError =>
  new HttpError(409, message, { code, details });
