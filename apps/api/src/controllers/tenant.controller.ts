import { Request, Response } from 'express';
import { tenantService } from '../services/tenant.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type {
  CreateTenantProfileInput,
  UpdateTenantProfileInput,
  ListTenantsQuery,
} from '../validations/tenant.schema';

export const tenantController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await tenantService.list(req.query as unknown as ListTenantsQuery, organisationId);
    res.status(200).json({ success: true, ...result });
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const tenant = await tenantService.getByUserId(req.params.userId, requesterId, role, organisationId);
    res.status(200).json({ success: true, data: tenant });
  }),

  createProfile: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const profile = await tenantService.createProfile(
      req.params.userId,
      requesterId,
      role,
      req.body as CreateTenantProfileInput,
      organisationId
    );
    res.status(201).json({ success: true, data: profile });
  }),

  updateProfile: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const profile = await tenantService.updateProfile(
      req.params.userId,
      requesterId,
      role,
      req.body as UpdateTenantProfileInput,
      organisationId
    );
    res.status(200).json({ success: true, data: profile });
  }),

  getLeases: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const leases = await tenantService.getLeases(req.params.userId, requesterId, role, organisationId);
    res.status(200).json({ success: true, data: leases });
  }),
};
