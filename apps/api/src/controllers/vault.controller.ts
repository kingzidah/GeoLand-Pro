import { Request, Response } from 'express';
import { vaultService } from '../services/vault.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type { SubscribeVaultInput, RequestPhysicalVaultInput } from '../validations/vault.schema';

export const vaultController = {
  getStatus: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await vaultService.getStatus(req.params.propertyId, userId, role, organisationId);
    res.status(200).json({ success: true, data: result });
  }),

  subscribe: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const subscription = await vaultService.subscribe(
      req.params.propertyId,
      userId,
      role,
      req.body as SubscribeVaultInput,
      organisationId
    );
    res.status(200).json({ success: true, data: subscription });
  }),

  generatePack: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await vaultService.generatePack(req.params.propertyId, userId, role, organisationId);
    res.status(201).json({ success: true, data: result });
  }),

  requestPhysicalVault: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await vaultService.requestPhysicalVault(
      req.params.propertyId,
      userId,
      role,
      req.body as RequestPhysicalVaultInput,
      organisationId
    );
    res.status(201).json({ success: true, data: result });
  }),

  confirmDelivery: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const subscription = await vaultService.confirmDelivery(req.params.propertyId, userId, role, organisationId);
    res.status(200).json({ success: true, data: subscription });
  }),
};
