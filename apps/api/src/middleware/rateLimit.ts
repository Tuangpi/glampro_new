import rateLimit from "express-rate-limit";

const FIFTEEN_MINUTES = 15 * 60 * 1000;

const tooManyRequests = {
  statusCode: 429,
  message: "Too many requests. Please slow down and try again shortly.",
  code: "RATE_LIMITED",
};

/**
 * Baseline throttle for the whole API surface.
 * Generous enough for the POS item grid polling, strict enough to blunt
 * credential-stuffing and scraping.
 */
export const apiLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: tooManyRequests,
});

/** Stricter limit for login, refresh and password-reset endpoints. */
export const authLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    statusCode: 429,
    message: "Too many authentication attempts. Please try again in 15 minutes.",
    code: "RATE_LIMITED",
  },
});
