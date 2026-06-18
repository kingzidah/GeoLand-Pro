import { Request, Response } from 'express';
import { satelliteService } from '../services/satellite.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type { CreateSatelliteOrderInput } from '../validations/satellite.schema';

export const satelliteController = {
  getLatest: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const image = await satelliteService.getLatest(req.params.propertyId, userId, role);
    res.status(200).json({ success: true, data: image });
  }),

  getHistory: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const result = await satelliteService.getHistory(req.params.propertyId, userId, role);
    res.status(200).json({ success: true, ...result });
  }),

  createOrder: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const order = await satelliteService.createOrder(
      req.params.propertyId,
      userId,
      role,
      req.body as CreateSatelliteOrderInput
    );
    res.status(201).json({ success: true, data: order });
  }),

  getInfo: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const info = await satelliteService.getInfo(req.params.propertyId, userId, role);
    res.status(200).json({ success: true, data: info });
  }),

  health: asyncHandler(async (_req: Request, res: Response) => {
    const result = await satelliteService.health();
    res.status(200).json({ success: true, data: result });
  }),
};
