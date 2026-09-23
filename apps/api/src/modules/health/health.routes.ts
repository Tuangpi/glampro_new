import { Router } from 'express';
import { prisma } from '../../database/prisma.js';
import { responseMeta } from '../../shared/http/response.js';

export const healthRouter = Router();

healthRouter.get('/health', (request, response) => {
  response.json({
    data: {
      service: 'glampro-api',
      status: 'ok',
      uptimeSeconds: process.uptime(),
    },
    meta: responseMeta(request),
  });
});

healthRouter.get('/ready', async (request, response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    response.json({
      data: {
        service: 'glampro-api',
        status: 'ok',
        database: 'connected',
        uptimeSeconds: process.uptime(),
      },
      meta: responseMeta(request),
    });
  } catch {
    response.status(503).json({
      data: {
        service: 'glampro-api',
        status: 'degraded',
        database: 'unavailable',
        uptimeSeconds: process.uptime(),
      },
      meta: responseMeta(request),
    });
  }
});
