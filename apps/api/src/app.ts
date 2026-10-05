import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import { API_PREFIX } from "@glampro/shared";

import { env } from "./lib/env.js";
import { authRouter } from "./routes/auth.routes.js";
import { customersRouter } from "./routes/customers.routes.js";
import { departmentsRouter } from "./routes/departments.routes.js";
import { giftCardsRouter } from "./routes/gift-cards.routes.js";
import { healthRouter, readiness } from "./routes/health.routes.js";
import { packagesRouter } from "./routes/packages.routes.js";
import { productsRouter } from "./routes/products.routes.js";
import { servicesRouter } from "./routes/services.routes.js";
import { staffRouter } from "./routes/staff.routes.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiLimiter } from "./middleware/rateLimit.js";

/**
 * Builds the Express application without binding a port, so tests can import
 * it directly and `index.ts` owns the listen/shutdown lifecycle.
 */
export function createApp(): Express {
  const app = express();

  // nginx terminates TLS and forwards the real client IP.
  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // The SPA is served by Vite/nginx, not this process, so CSP is disabled here.
  // CORP is relaxed so images served from /uploads render in the portal.
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  // Strict CORS: only origins listed in CORS_ORIGINS. Requests without an
  // Origin header (curl, same-origin, native mobile clients) are allowed.
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not allowed by CORS"));
      },
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  // Throttle before any route work happens.
  app.use(API_PREFIX, apiLimiter);

  // Static uploads (avatars, product images) served by the API in development
  // and proxied by nginx in production.
  app.use("/uploads", express.static(env.uploadsDir, { maxAge: "7d" }));

  // Probes.
  app.use("/health", healthRouter);
  app.get(`${API_PREFIX}/health`, readiness);

  // Feature routes. Each phase mounts its router here.
  app.use(`${API_PREFIX}/auth`, authRouter);
  app.use(`${API_PREFIX}/customers`, customersRouter);
  // Screen 08 is one screen with two tabs, so it is two mounts: products and
  // services are separate resources that share the `catalogue` entitlement.
  app.use(`${API_PREFIX}/products`, productsRouter);
  app.use(`${API_PREFIX}/services`, servicesRouter);
  app.use(`${API_PREFIX}/departments`, departmentsRouter);
  // Screen 09. Reads are open to the salon; the writes are the first routes in the
  // app to mount `requireRole` (Q26).
  app.use(`${API_PREFIX}/staff`, staffRouter);
  // Screen 08's last two tabs. Both are **add-ons**, so these two mounts are the
  // first routes whose `requireModule` can actually refuse: every other module they
  // sit beside is core and passes as soon as the tenant exists.
  app.use(`${API_PREFIX}/packages`, packagesRouter);
  app.use(`${API_PREFIX}/gift-cards`, giftCardsRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
