import { Router, type Request, type Response } from "express";
import { APP_NAME } from "@glampro/shared";

import { env } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";

const startedAt = Date.now();

/**
 * Liveness probe (`GET /health`).
 *
 * Deliberately dependency-free: a stalled database must not make the container
 * look unhealthy, or the runtime would restart a perfectly good process.
 * Response shape is fixed because nginx and the mobile app poll it.
 */
export function liveness(_req: Request, res: Response): void {
  res.status(200).json({ status: "ok" });
}

/**
 * Readiness probe (`GET /health/ready`, also exposed as `GET /api/health`).
 *
 * Reports database connectivity. Answers 503 while the database is
 * unreachable so orchestrators hold traffic until migrations have finished.
 */
export async function readiness(_req: Request, res: Response): Promise<void> {
  const database = await pingDatabase();

  res.status(database === "up" ? 200 : 503).json({
    status: database === "up" ? "ok" : "degraded",
    app: APP_NAME,
    environment: env.nodeEnv,
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    database,
  });
}

async function pingDatabase(): Promise<"up" | "down"> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return "up";
  } catch {
    return "down";
  }
}

/** Mounted at `/health`. */
export const healthRouter = Router();
healthRouter.get("/", liveness);
healthRouter.get("/ready", readiness);
