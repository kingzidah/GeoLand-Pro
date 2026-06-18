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
    const user = await adminService.getUserById(req.params.id);
    res.status(200).json({ success: true, data: user });
  }),

  suspendUser: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    await adminService.suspendUser(requesterId, req.params.id);
    res.status(200).json({ success: true, message: 'User suspended and session revoked' });
  }),

  activateUser: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    await adminService.activateUser(requesterId, req.params.id);
    res.status(200).json({ success: true, message: 'User activated' });
  }),

  changeRole: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    await adminService.changeRole(requesterId, req.params.id, req.body as ChangeRoleInput);
    res.status(200).json({ success: true, message: 'Role updated and session revoked' });
  }),

  listAuditLogs: asyncHandler(async (req: Request, res: Response) => {
    const result = await adminService.listAuditLogs(req.query as unknown as ListAuditLogsQuery);
    res.status(200).json({ success: true, ...result });
  }),

  getStats: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId, role, organisationId } = (req as AuthenticatedRequest).user;
    const stats = await adminService.getStats(requesterId, role, organisationId);
    res.status(200).json({ success: true, data: stats });
  }),
};
