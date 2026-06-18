import { Request, Response } from 'express';
import { plotService } from '../services/plot.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type {
  CreatePlotInput,
  UpdatePlotInput,
  UpdatePlotStatusInput,
  ListPlotsQuery,
} from '../validations/property.schema';

export const plotController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await plotService.list(
      req.params.propertyId,
      userId,
      role,
      req.query as unknown as ListPlotsQuery,
      organisationId
    );
    res.status(200).json({ success: true, ...result });
  }),

  forMap: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await plotService.forMap(req.params.propertyId, userId, role, organisationId);
    res.status(200).json({ success: true, ...result });
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const plot = await plotService.getById(
      req.params.propertyId,
      req.params.plotId,
      userId,
      role,
      organisationId
    );
    res.status(200).json({ success: true, data: plot });
  }),

  getOneGlobal: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const plot = await plotService.getByIdGlobal(req.params.plotId, userId, role, organisationId);
    res.status(200).json({ success: true, data: plot });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const plot = await plotService.create(
      req.params.propertyId,
      userId,
      role,
      req.body as CreatePlotInput,
      organisationId
    );
    res.status(201).json({ success: true, data: plot });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const plot = await plotService.update(
      req.params.propertyId,
      req.params.plotId,
      userId,
      role,
      req.body as UpdatePlotInput,
      organisationId
    );
    res.status(200).json({ success: true, data: plot });
  }),

  updateStatus: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const plot = await plotService.updateStatus(
      req.params.propertyId,
      req.params.plotId,
      userId,
      role,
      req.body as UpdatePlotStatusInput,
      organisationId
    );
    res.status(200).json({ success: true, data: plot });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    await plotService.delete(req.params.propertyId, req.params.plotId, userId, role, organisationId);
    res.status(200).json({ success: true, message: 'Plot deleted successfully' });
  }),
};
