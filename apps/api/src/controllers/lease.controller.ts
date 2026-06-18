import { Request, Response } from 'express';
import { leaseService } from '../services/lease.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type {
  CreateLeaseInput,
  UpdateLeaseInput,
  SignLeaseInput,
  TerminateLeaseInput,
  ListLeasesQuery,
} from '../validations/tenant.schema';

export const leaseController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await leaseService.list(userId, role, req.query as unknown as ListLeasesQuery, organisationId);
    res.status(200).json({ success: true, ...result });
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const lease = await leaseService.getById(req.params.id, userId, role, organisationId);
    res.status(200).json({ success: true, data: lease });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const lease = await leaseService.create(userId, role, req.body as CreateLeaseInput, organisationId);
    res.status(201).json({ success: true, data: lease });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const lease = await leaseService.update(req.params.id, userId, role, req.body as UpdateLeaseInput, organisationId);
    res.status(200).json({ success: true, data: lease });
  }),

  sign: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const lease = await leaseService.sign(req.params.id, userId, role, req.body as SignLeaseInput, organisationId);
    res.status(200).json({ success: true, data: lease });
  }),

  activate: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const lease = await leaseService.activate(req.params.id, userId, role, organisationId);
    res.status(200).json({ success: true, data: lease });
  }),

  terminate: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const lease = await leaseService.terminate(
      req.params.id,
      userId,
      role,
      req.body as TerminateLeaseInput,
      organisationId
    );
    res.status(200).json({ success: true, data: lease });
  }),

  getRentRecords: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const records = await leaseService.getRentRecords(req.params.id, userId, role, organisationId);
    res.status(200).json({ success: true, data: records });
  }),
};
