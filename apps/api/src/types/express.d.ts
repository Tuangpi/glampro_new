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
    }
  }
}

export {};
