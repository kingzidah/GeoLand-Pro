import { Prisma } from '@prisma/client';
import { prisma } from '../config/database';
import { pdfService } from './pdf.service';
import type { ListPlatformAuditLogsQuery } from '../validations/organisation.schema';

const PDF_EXPORT_LIMIT = 500;

function buildWhere(query: Omit<ListPlatformAuditLogsQuery, 'page' | 'limit'>): Prisma.AuditLogWhereInput {
  return {
    ...(query.action && { action: { contains: query.action, mode: 'insensitive' } }),
    ...(query.entityType && { entityType: query.entityType }),
    ...((query.organisationId || query.actor) && {
      user: {
        ...(query.organisationId && { organisationId: query.organisationId }),
        ...(query.actor && {
          OR: [
            { email: { contains: query.actor, mode: 'insensitive' } },
            { firstName: { contains: query.actor, mode: 'insensitive' } },
            { lastName: { contains: query.actor, mode: 'insensitive' } },
          ],
        }),
      },
    }),
    ...((query.from || query.to) && {
      createdAt: {
        ...(query.from && { gte: query.from }),
        ...(query.to && { lte: query.to }),
      },
    }),
  };
}

const auditLogSelect = {
  id: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      organisationId: true,
      organisation: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.AuditLogSelect;

export const platformAuditService = {
  async listAuditLogs(query: ListPlatformAuditLogsQuery) {
    const skip = (query.page - 1) * query.limit;
    const where = buildWhere(query);

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        select: auditLogSelect,
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      data: logs,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  },

  async listAuditLogsForExport(query: Omit<ListPlatformAuditLogsQuery, 'page' | 'limit'>) {
    const where = buildWhere(query);

    return prisma.auditLog.findMany({
      where,
      select: auditLogSelect,
      take: PDF_EXPORT_LIMIT,
      orderBy: { createdAt: 'desc' },
    });
  },

  async exportAuditLogsPdf(query: Omit<ListPlatformAuditLogsQuery, 'page' | 'limit'>) {
    const [logs, organisation] = await Promise.all([
      this.listAuditLogsForExport(query),
      query.organisationId
        ? prisma.organisation.findUnique({ where: { id: query.organisationId }, select: { name: true } })
        : null,
    ]);

    return pdfService.generateAuditLogReport({
      generatedAt: new Date(),
      filters: {
        organisation: organisation?.name,
        actor: query.actor,
        action: query.action,
        entityType: query.entityType,
        from: query.from?.toISOString(),
        to: query.to?.toISOString(),
      },
      rows: logs.map((log) => ({
        createdAt: log.createdAt,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        ipAddress: log.ipAddress,
        actor: log.user
          ? {
              name: `${log.user.firstName} ${log.user.lastName}`,
              email: log.user.email,
              organisationName: log.user.organisation?.name ?? null,
            }
          : null,
      })),
    });
  },
};
