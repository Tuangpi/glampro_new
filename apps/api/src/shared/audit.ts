import type { Request } from 'express';
import type { AuditActorType, Prisma } from '../generated/prisma/client.js';
import { logger } from '../config/logger.js';
import { prisma } from '../database/prisma.js';

export type AuditContext = {
  requestId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
};

export type AuditEvent = {
  action: string;
  actorType: AuditActorType;
  organizationId?: string | null;
  actorUserId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

export const auditContextFromRequest = (request: Request): AuditContext => ({
  requestId: typeof request.id === 'string' ? request.id : null,
  ipAddress: request.ip ? request.ip.slice(0, 64) : null,
  userAgent: request.header('user-agent')?.slice(0, 500) ?? null,
});

/**
 * Writes an audit trail entry. Auditing must never break the request it
 * describes, so failures are logged and swallowed.
 */
export const recordAuditEvent = async (context: AuditContext, event: AuditEvent): Promise<void> => {
  try {
    await prisma.auditLog.create({
      data: {
        action: event.action,
        actorType: event.actorType,
        organizationId: event.organizationId ?? null,
        actorUserId: event.actorUserId ?? null,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        requestId: context.requestId,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
        ...(event.metadata ? { metadata: event.metadata as Prisma.InputJsonValue } : {}),
      },
    });
  } catch (error) {
    logger.error({ err: error, action: event.action }, 'Failed to write audit log entry');
  }
};
