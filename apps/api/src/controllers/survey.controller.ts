import { Request, Response } from 'express';
import { surveyService } from '../services/survey.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type {
  SurveyImportInput,
  SurveyValidateInput,
  SurveyPointCaptureInput,
  SurveySessionCloseInput,
} from '../validations/survey.schema';

export const surveyController = {
  getTemplate: asyncHandler(async (_req: Request, res: Response) => {
    const csv = surveyService.getTemplate();
    res.status(200)
      .set('Content-Type', 'text/csv')
      .set('Content-Disposition', 'attachment; filename="survey-template.csv"')
      .send(csv);
  }),

  validate: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await surveyService.validate(req.params.propertyId, userId, role, req.body as SurveyValidateInput, organisationId);
    res.status(200).json({ success: true, data: result });
  }),

  import: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const plots = await surveyService.import(req.params.propertyId, userId, role, req.body as SurveyImportInput, organisationId);
    res.status(201).json({ success: true, data: plots });
  }),

  addPoint: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const point = await surveyService.addPoint(req.params.propertyId, userId, role, req.body as SurveyPointCaptureInput, organisationId);
    res.status(201).json({ success: true, data: point });
  }),

  listSessions: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const sessions = await surveyService.listSessions(req.params.propertyId, userId, role, organisationId);
    res.status(200).json({ success: true, data: sessions });
  }),

  getSessionPoints: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const points = await surveyService.getSessionPoints(req.params.propertyId, req.params.sessionId, userId, role, organisationId);
    res.status(200).json({ success: true, data: points });
  }),

  closeSession: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const plot = await surveyService.closeSession(
      req.params.propertyId,
      req.params.sessionId,
      userId,
      role,
      req.body as SurveySessionCloseInput,
      organisationId
    );
    res.status(201).json({ success: true, data: plot });
  }),

  listImports: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const imports = await surveyService.listImports(req.params.propertyId, userId, role, organisationId);
    res.status(200).json({ success: true, data: imports });
  }),
};
