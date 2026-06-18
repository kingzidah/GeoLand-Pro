import { Prisma, TicketStatus } from '@prisma/client';
import { prisma } from '../config/database';
import { ApiError } from '../utils/ApiError';
import type { ListSupportTicketsQuery, ReplySupportTicketInput } from '../validations/organisation.schema';

const ticketSelect = {
  id: true,
  organisationId: true,
  subject: true,
  body: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  organisation: { select: { id: true, name: true, slug: true } },
} satisfies Prisma.SupportTicketSelect;

async function transitionStatus(id: string, status: TicketStatus, requesterId: string, action: string, metadata: Record<string, unknown>) {
  const existing = await prisma.supportTicket.findUnique({ where: { id }, select: { id: true, status: true } });
  if (!existing) throw ApiError.notFound('Support ticket');

  const ticket = await prisma.supportTicket.update({ where: { id }, data: { status }, select: ticketSelect });

  await prisma.auditLog.create({
    data: {
      userId: requesterId,
      action,
      entityType: 'SupportTicket',
      entityId: id,
      metadata: { ...metadata, previousStatus: existing.status, newStatus: status },
    },
  });

  return ticket;
}

export const platformSupportService = {
  async listTickets(query: ListSupportTicketsQuery) {
    const skip = (query.page - 1) * query.limit;
    const where: Prisma.SupportTicketWhereInput = {
      ...(query.status && { status: query.status }),
      ...(query.organisationId && { organisationId: query.organisationId }),
    };

    const [tickets, total] = await Promise.all([
      prisma.supportTicket.findMany({
        where,
        select: ticketSelect,
        skip,
        take: query.limit,
        orderBy: { updatedAt: 'desc' },
      }),
      prisma.supportTicket.count({ where }),
    ]);

    return {
      data: tickets,
      meta: { total, page: query.page, limit: query.limit, totalPages: Math.ceil(total / query.limit) },
    };
  },

  async getTicketById(id: string) {
    const ticket = await prisma.supportTicket.findUnique({ where: { id }, select: ticketSelect });
    if (!ticket) throw ApiError.notFound('Support ticket');

    const activity = await prisma.auditLog.findMany({
      where: { entityType: 'SupportTicket', entityId: id },
      select: {
        id: true,
        action: true,
        metadata: true,
        createdAt: true,
        user: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return { ...ticket, activity };
  },

  async reply(id: string, data: ReplySupportTicketInput, requesterId: string) {
    return transitionStatus(id, TicketStatus.IN_PROGRESS, requesterId, 'SUPPORT_TICKET_REPLIED', {
      message: data.message,
    });
  },

  async escalate(id: string, requesterId: string) {
    return transitionStatus(id, TicketStatus.IN_PROGRESS, requesterId, 'SUPPORT_TICKET_ESCALATED', {});
  },

  async close(id: string, requesterId: string) {
    return transitionStatus(id, TicketStatus.CLOSED, requesterId, 'SUPPORT_TICKET_CLOSED', {});
  },
};
