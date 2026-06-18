import { Request, Response } from 'express';
import { platformSupportService } from '../services/platformSupport.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type { ListSupportTicketsQuery, ReplySupportTicketInput } from '../validations/organisation.schema';

export const platformSupportController = {
  listTickets: asyncHandler(async (req: Request, res: Response) => {
    const result = await platformSupportService.listTickets(req.query as unknown as ListSupportTicketsQuery);
    res.status(200).json({ success: true, ...result });
  }),

  getTicket: asyncHandler(async (req: Request, res: Response) => {
    const ticket = await platformSupportService.getTicketById(req.params.id);
    res.status(200).json({ success: true, data: ticket });
  }),

  replyToTicket: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    const ticket = await platformSupportService.reply(req.params.id, req.body as ReplySupportTicketInput, requesterId);
    res.status(200).json({ success: true, data: ticket });
  }),

  escalateTicket: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    const ticket = await platformSupportService.escalate(req.params.id, requesterId);
    res.status(200).json({ success: true, data: ticket });
  }),

  closeTicket: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    const ticket = await platformSupportService.close(req.params.id, requesterId);
    res.status(200).json({ success: true, data: ticket });
  }),
};
