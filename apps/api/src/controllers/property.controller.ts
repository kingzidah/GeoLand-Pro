import { Request, Response } from 'express';
import { propertyService } from '../services/property.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type {
  CreatePropertyInput,
  UpdatePropertyInput,
  ListPropertiesQuery,
  AddManagerInput,
} from '../validations/property.schema';
import type { UpdatePropertyBoundaryInput } from '../validations/survey.schema';

export const propertyController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await propertyService.list(
      userId,
      role,
      req.query as unknown as ListPropertiesQuery,
      organisationId
    );
    res.status(200).json({ success: true, ...result });
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const property = await propertyService.getById(req.params.id, userId, role, organisationId);
    res.status(200).json({ success: true, data: property });
  }),

  create: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const property = await propertyService.create(
      userId,
      req.body as CreatePropertyInput,
      organisationId
    );
    res.status(201).json({ success: true, data: property });
  }),

  update: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const property = await propertyService.update(
      req.params.id,
      userId,
      role,
      req.body as UpdatePropertyInput,
      organisationId
    );
    res.status(200).json({ success: true, data: property });
  }),

  updateBoundary: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const property = await propertyService.updateBoundary(
      req.params.propertyId,
      userId,
      role,
      req.body as UpdatePropertyBoundaryInput,
      organisationId
    );
    res.status(200).json({ success: true, data: property });
  }),

  deactivate: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    await propertyService.deactivate(req.params.id, userId, role, organisationId);
    res.status(200).json({ success: true, message: 'Property deactivated successfully' });
  }),

  addManager: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    await propertyService.addManager(
      req.params.id,
      userId,
      role,
      req.body as AddManagerInput,
      organisationId
    );
    res.status(200).json({ success: true, message: 'Manager added successfully' });
  }),

  removeManager: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    await propertyService.removeManager(
      req.params.id,
      userId,
      role,
      req.params.managerId,
      organisationId
    );
    res.status(200).json({ success: true, message: 'Manager removed successfully' });
  }),
};
