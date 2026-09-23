import type { AuditLogPage, AuditLogQuery } from '@glampro/contracts';
import { prisma } from '../../database/prisma.js';

/** The audit viewer reads only its own tenant's trail, newest first. */
export const listAuditEntries = async (
  organizationId: string,
  query: AuditLogQuery,
): Promise<AuditLogPage> => {
  const where = { organizationId };
  const take = query.pageSize;
  const skip = (query.page - 1) * query.pageSize;

  const [total, entries] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        action: true,
        actorType: true,
        actorUserId: true,
        entityType: true,
        entityId: true,
        requestId: true,
        ipAddress: true,
        createdAt: true,
        metadata: true,
        actorUser: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  return {
    items: entries.map((entry) => ({
      id: entry.id,
      action: entry.action,
      actorType: entry.actorType,
      actorUserId: entry.actorUserId,
      actor: entry.actorUser,
      entityType: entry.entityType,
      entityId: entry.entityId,
      requestId: entry.requestId,
      ipAddress: entry.ipAddress,
      createdAt: entry.createdAt.toISOString(),
      metadata: entry.metadata ?? null,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
};
