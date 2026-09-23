import { createServer } from 'node:http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { prisma } from './database/prisma.js';
import { createApp } from './app.js';

const app = createApp();
const server = createServer(app);

server.listen(env.API_PORT, () => {
  logger.info({ port: env.API_PORT }, 'GlamPro API listening');
});

const shutdown = async (signal: NodeJS.Signals) => {
  logger.info({ signal }, 'Graceful shutdown started');

  server.close(async (error) => {
    await prisma.$disconnect();

    if (error) {
      logger.error({ err: error }, 'HTTP server failed to close cleanly');
      process.exit(1);
    }

    logger.info('Graceful shutdown complete');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Graceful shutdown timed out');
    process.exit(1);
  }, 10_000).unref();
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
