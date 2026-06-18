import { Request, Response } from 'express';
import { documentService } from '../services/document.service';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthenticatedRequest } from '../middleware/authenticate';
import type {
  PresignedUploadInput,
  ConfirmUploadInput,
  ListDocumentsQuery,
  GenerateAnnualReportQuery,
} from '../validations/document.schema';

export const documentController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await documentService.list(
      userId,
      role,
      req.query as unknown as ListDocumentsQuery,
      organisationId
    );
    res.status(200).json({ success: true, ...result });
  }),

  getOne: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const document = await documentService.getById(req.params.id, userId, role, organisationId);
    res.status(200).json({ success: true, data: document });
  }),

  getPresignedUploadUrl: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const result = await documentService.getPresignedUploadUrl(
      userId,
      role,
      req.body as PresignedUploadInput
    );
    res.status(200).json({ success: true, data: result });
  }),

  confirmUpload: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const document = await documentService.confirmUpload(
      userId,
      role,
      req.body as ConfirmUploadInput,
      organisationId
    );
    res.status(201).json({ success: true, data: document });
  }),

  getDownloadUrl: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const result = await documentService.getDownloadUrl(req.params.id, userId, role, organisationId);
    res.status(200).json({ success: true, data: result });
  }),

  delete: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    await documentService.delete(req.params.id, userId, role, organisationId);
    res.status(200).json({ success: true, message: 'Document deleted successfully' });
  }),

  generateLeaseDoc: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const document = await documentService.generateLeaseDoc(req.params.id, userId, role, organisationId);
    res.status(201).json({ success: true, data: document });
  }),

  generateReceiptDoc: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const document = await documentService.generateReceiptDoc(req.params.id, userId, role, organisationId);
    res.status(201).json({ success: true, data: document });
  }),

  generateBoundaryCertificate: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const document = await documentService.generateBoundaryCertificate(
      req.params.plotId,
      userId,
      role,
      organisationId
    );
    res.status(201).json({ success: true, data: document });
  }),

  generatePlotCertificate: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const document = await documentService.generatePlotCertificate(
      req.params.plotId,
      userId,
      role,
      organisationId
    );
    res.status(201).json({ success: true, data: document });
  }),

  generateDemandLetter: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const document = await documentService.generateDemandLetter(
      req.params.leaseId,
      userId,
      role,
      organisationId
    );
    res.status(201).json({ success: true, data: document });
  }),

  generateLCSubmissionPackage: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const document = await documentService.generateLCSubmissionPackage(
      req.params.plotId,
      userId,
      role,
      organisationId
    );
    res.status(201).json({ success: true, data: document });
  }),

  generateAnnualReport: asyncHandler(async (req: Request, res: Response) => {
    const { id: userId, role } = (req as AuthenticatedRequest).user;
    const organisationId = (req as AuthenticatedRequest).organisationId ?? null;
    const { year } = req.query as unknown as GenerateAnnualReportQuery;
    const document = await documentService.generateAnnualReport(
      req.params.propertyId,
      year ?? new Date().getFullYear(),
      userId,
      role,
      organisationId
    );
    res.status(201).json({ success: true, data: document });
  }),
};
 