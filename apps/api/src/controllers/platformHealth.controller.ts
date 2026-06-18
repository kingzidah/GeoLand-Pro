import { Request, Response } from 'express';
import { platformHealthService } from '../services/platformHealth.service';
import { asyncHandler } from '../utils/asyncHandler';

export const platformHealthController = {
  getSummary: asyncHandler(async (req: Request, res: Response) => {
    const summary = await platformHealthService.getSummary();
    res.status(200).json({ success: true, data: summary });
  }),
};
