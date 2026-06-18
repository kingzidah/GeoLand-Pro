import { Request, Response } from 'express';
import { alertService } from '../services/alert.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type {
  CreateAlertInput,
  UpdateAlertInput,
  ListAlertsQuery,
  TriggerCheckInput,
  ListAlertEventsQuery,
} from '../validations/alert.schema';

export const alertController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await alertService.list(userId, role, req.query as unknown as ListAlertsQuery, organisationId);
    res.status(200).json({ success: true, ...result });
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const alert = await alertService.getById(req.params.id, userId, role, organisationId);
    res.status(200).json({ success: true, data: alert });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const alert = await alertService.create(userId, role, req.body as CreateAlertInput, organisationId);
    res.status(201).json({ success: true, data: alert });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const alert = await alertService.update(
      req.params.id,
      userId,
      role,
      req.body as UpdateAlertInput,
      organisationId
    );
    res.status(200).json({ success: true, data: alert });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    await alertService.delete(req.params.id, userId, role, organisationId);
    res.status(200).json({ success: true, message: 'GeofenceAlert deleted' });
  }),

  listEvents: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await alertService.listEvents(
      req.params.id,
      userId,
      role,
      req.query as unknown as ListAlertEventsQuery,
      organisationId
    );
    res.status(200).json({ success: true, ...result });
  }),

  triggerCheck: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await alertService.triggerCheck(userId, req.body as TriggerCheckInput, organisationId);
    res.status(200).json({ success: true, data: result });
  }),
};
