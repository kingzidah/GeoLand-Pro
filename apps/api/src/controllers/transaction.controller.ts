import { Request, Response } from 'express';
import { transactionService } from '../services/transaction.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type {
  RecordPaymentInput,
  UpdateTransactionStatusInput,
  ListTransactionsQuery,
} from '../validations/transaction.schema';

export const transactionController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await transactionService.list(
      userId,
      role,
      req.query as unknown as ListTransactionsQuery,
      organisationId
    );
    res.status(200).json({ success: true, ...result });
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const transaction = await transactionService.getById(req.params.id, userId, role, organisationId);
    res.status(200).json({ success: true, data: transaction });
  }),

  recordPayment: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const transaction = await transactionService.recordPayment(
      userId,
      role,
      req.body as RecordPaymentInput,
      organisationId
    );
    res.status(201).json({ success: true, data: transaction });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const transaction = await transactionService.updateStatus(
      req.params.id,
      userId,
      role,
      req.body as UpdateTransactionStatusInput,
      organisationId
    );
    res.status(200).json({ success: true, data: transaction });
  }),
};
