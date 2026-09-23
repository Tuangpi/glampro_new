import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';

export type EmailMessage = {
  to: string;
  subject: string;
  body: string;
};

export type EmailTransport = {
  send: (message: EmailMessage) => Promise<void>;
};

/**
 * Development transport: the message is written to the structured log so that
 * verification and password reset flows can be exercised without a provider.
 * It is never active in production.
 */
const logTransport: EmailTransport = {
  send: async (message) => {
    logger.info(
      { to: message.to, subject: message.subject, body: message.body },
      'Email delivery (log transport)',
    );
  },
};

const disabledTransport: EmailTransport = {
  send: async (message) => {
    logger.warn(
      { to: message.to, subject: message.subject },
      'Email transport is disabled; message dropped',
    );
  },
};

export const emailTransport: EmailTransport =
  env.EMAIL_TRANSPORT === 'log' && env.NODE_ENV !== 'production' ? logTransport : disabledTransport;
