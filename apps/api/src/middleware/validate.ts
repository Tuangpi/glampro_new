import type { Request, RequestHandler } from "express";
import type { ZodType } from "zod";

import { validationFailed } from "../lib/http-error.js";

type Source = "body" | "query" | "params";

/**
 * Validates and coerces one part of the request with a Zod schema.
 *
 * Parsed output is written to `req.validated[source]` rather than back onto
 * `req.query`/`req.params`, which Express 5 exposes as read-only getters.
 */
export function validate<T>(schema: ZodType<T>, source: Source = "body"): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      next(
        validationFailed(
          result.error.issues.map((issue) => ({
            path: [source, ...issue.path].join("."),
            message: issue.message,
          })),
        ),
      );
      return;
    }

    req.validated = { ...req.validated, [source]: result.data };
    next();
  };
}

/** Reads a value previously parsed by `validate`, falling back to the raw request. */
export function validated<T>(req: Request, source: Source): T {
  const parsed = req.validated?.[source];
  return (parsed ?? req[source]) as T;
}
