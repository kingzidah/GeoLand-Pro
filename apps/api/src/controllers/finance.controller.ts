import { Request, Response } from 'express';
import { financeService } from '../services/finance.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type {
  FinanceSummaryQuery,
  ListArrearsQuery,
  ListCommissionsQuery,
} from '../validations/transaction.schema';

export const financeController = {
  getSummary: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const summary = await financeService.getSummary(
      userId,
      role,
      req.query as unknown as FinanceSummaryQuery,
      organisationId
    );
    res.status(200).json({ success: true, data: summary });
  }),

  getArrears: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await financeService.getArrears(
      userId,
      role,
      req.query as unknown as ListArrearsQuery,
      organisationId
    );
    res.status(200).json({ success: true, ...result });
  }),

  getCommissions: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await financeService.getCommissions(
      userId,
      role,
      req.query as unknown as ListCommissionsQuery,
      organisationId
    );
    res.status(200).json({ success: true, ...result });
  }),

  markCommissionPaid: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const commission = await financeService.markCommissionPaid(req.params.id, userId, organisationId);
    res.status(200).json({ success: true, data: commission });
  }),
};
