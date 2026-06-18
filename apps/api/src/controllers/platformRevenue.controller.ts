import { Request, Response } from 'express';
import { platformRevenueService } from '../services/platformRevenue.service';
import { asyncHandler } from '../utils/asyncHandler';
import type { ListOrganisationsQuery } from '../validations/organisation.schema';

export const platformRevenueController = {
  getSummary: asyncHandler(async (_req: Request, res: Response) => {
    const summary = await platformRevenueService.getSummary();
    res.status(200).json({ success: true, data: summary });
  }),

  listOrganisationRevenue: asyncHandler(async (req: Request, res: Response) => {
    const result = await platformRevenueService.listOrganisationRevenue(req.query as unknown as ListOrganisationsQuery);
    res.status(200).json({ success: true, ...result });
  }),
};
