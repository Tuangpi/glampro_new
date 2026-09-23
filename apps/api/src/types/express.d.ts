import type { MembershipRole, PlatformRole } from '../generated/prisma/client.js';

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: {
        userId: string;
        platformRole: PlatformRole;
        sessionId: string;
      };
      tenant?: {
        organizationId: string;
        membershipId: string;
        role: MembershipRole;
        locationIds: string[];
      };
      /**
       * Values produced by the `validate` middleware. Express 5 keeps
       * `request.query` behind a prototype getter, so parsed query values are
       * also installed as an own property and read through these helpers.
       */
      validated?: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};
