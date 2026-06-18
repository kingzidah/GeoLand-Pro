import { Request, Response } from 'express';
import { platformAuditService } from '../services/platformAudit.service';
import { asyncHandler } from '../utils/asyncHandler';
import type { ListPlatformAuditLogsQuery } from '../validations/organisation.schema';

export const platformAuditController = {
  listAuditLogs: asyncHandler(async (req: Request, res: Response) => {
    const result = await platformAuditService.listAuditLogs(req.query as unknown as ListPlatformAuditLogsQuery);
    res.status(200).json({ success: true, ...result });
  }),

  exportAuditLogsPdf: asyncHandler(async (req: Request, res: Response) => {
    const query = req.query as unknown as ListPlatformAuditLogsQuery;
    const pdf = await platformAuditService.exportAuditLogsPdf(query);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log-report.pdf"');
    res.status(200).send(pdf);
  }),
};
