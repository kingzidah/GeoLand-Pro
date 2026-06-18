import { Request, Response } from 'express';
import { notificationService } from '../services/notification.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type { ListNotificationsQuery } from '../validations/alert.schema';

export const notificationController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const result = await notificationService.list(userId, role, req.query as unknown as ListNotificationsQuery);
    res.status(200).json({ success: true, ...result });
  }),
};
