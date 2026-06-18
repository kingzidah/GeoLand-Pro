import { Request, Response } from 'express';
import { adminService } from '../services/admin.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type { ListUsersQuery, ChangeRoleInput, ListAuditLogsQuery } from '../validations/admin.schema';

export const adminController = {
  listUsers: asyncHandler(async (req: Request, res: Response) => {
    const { organisationId } = (req as AuthenticatedRequest).user;
    const result = await adminService.listUsers(req.query as unknown as ListUsersQuery, organisationId);
    res.status(200).json({ success: true, ...result });
  }),

  getUser: asyncHandler(async (req: Request, res: Response) => {
    const { organisationId, isPlatformAdmin } = (req as AuthenticatedRequest).user;
    // Platform admins may read across orgs; org-level SUPER_ADMINs are scoped to their own org.
    const orgFilter = isPlatformAdmin ? null : organisationId;
    const user = await adminService.getUserById(req.params.id, orgFilter);
    res.status(200).json({ success: true, data: user });
  }),

  suspendUser: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId, organisationId, isPlatformAdmin } = (req as AuthenticatedRequest).user;
    const orgFilter = isPlatformAdmin ? null : organisationId;
    await adminService.suspendUser(requesterId, req.params.id, orgFilter);
    res.status(200).json({ success: true, message: 'User suspended and session revoked' });
  }),

  activateUser: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId, organisationId, isPlatformAdmin } = (req as AuthenticatedRequest).user;
    const orgFilter = isPlatformAdmin ? null : organisationId;
    await adminService.activateUser(requesterId, req.params.id, orgFilter);
    res.status(200).json({ success: true, message: 'User activated' });
  }),

  changeRole: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId, organisationId, isPlatformAdmin } = (req as AuthenticatedRequest).user;
    const orgFilter = isPlatformAdmin ? null : organisationId;
    await adminService.changeRole(requesterId, req.params.id, req.body as ChangeRoleInput, orgFilter);
    res.status(200).json({ success: true, message: 'Role updated and session revoked' });
  }),

  listAuditLogs: asyncHandler(async (req: Request, res: Response) => {
    const { organisationId, isPlatformAdmin } = (req as AuthenticatedRequest).user;
    const orgFilter = isPlatformAdmin ? null : organisationId;
    const result = await adminService.listAuditLogs(req.query as unknown as ListAuditLogsQuery, orgFilter);
    res.status(200).json({ success: true, ...result });
  }),

  getStats: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId, role, organisationId } = (req as AuthenticatedRequest).user;
    const stats = await adminService.getStats(requesterId, role, organisationId);
    res.status(200).json({ success: true, data: stats });
  }),
};
