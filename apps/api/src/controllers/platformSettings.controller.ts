import { Request, Response } from 'express';
import { platformSettingsService } from '../services/platformSettings.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type { UpdatePlatformSettingsInput } from '../validations/organisation.schema';

export const platformSettingsController = {
  getSettings: asyncHandler(async (req: Request, res: Response) => {
    const settings = await platformSettingsService.getSettings();
    res.status(200).json({ success: true, data: settings });
  }),

  updateSettings: asyncHandler(async (req: Request, res: Response) => {
    const { id: requesterId } = (req as AuthenticatedRequest).user;
    const settings = await platformSettingsService.updateSettings(
      req.body as UpdatePlatformSettingsInput,
      requesterId
    );
    res.status(200).json({ success: true, data: settings });
  }),
};
