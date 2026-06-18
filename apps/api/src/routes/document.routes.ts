import { Router } from 'express';
import { documentController } from '../controllers/document.controller';
import { authenticate } from '../middleware/authenticate';
import { scopeToOrganisation } from '../middleware/tenant.middleware';
import { requireCapability, requireAnyCapability } from '../middleware/requireCapability';
import { Capability } from '@geolandpro/rbac';
import { validate } from '../middleware/validate';
import { documentRateLimiter, uploadRateLimiter } from '../middleware/rateLimit';
import {
  documentIdParamSchema,
  listDocumentsQuerySchema,
  presignedUploadSchema,
  confirmUploadSchema,
  generateLeaseDocParamSchema,
  generateReceiptDocParamSchema,
  generatePlotDocParamSchema,
  generateLeaseDemandParamSchema,
  generatePropertyDocParamSchema,
  generateAnnualReportQuerySchema,
} from '../validations/document.schema';

const router = Router();

router.use(authenticate);
router.use(scopeToOrganisation);

// ─── List & metadata ──────────────────────────────────────────────────────────

// Tenants can list their own lease documents (DOCUMENT_VIEW_OWN); staff see all
// documents they're permitted to generate within their scope.
router.get(
  '/',
  requireAnyCapability(
    Capability.DOCUMENT_GENERATE_ALL,
    Capability.DOCUMENT_GENERATE_RECEIPTS,
    Capability.DOCUMENT_VIEW_OWN
  ),
  validate({ query: listDocumentsQuerySchema }),
  documentController.list
);

// ─── Upload flow (two-step: presign → client uploads → confirm) ───────────────

// Step 1 — get a pre-signed S3 PUT URL (valid for 5 min). Field Surveyors upload
// survey evidence (SURVEY_IMPORT); Managers upload receipt attachments.
router.post(
  '/presigned-upload',
  requireAnyCapability(Capability.SURVEY_IMPORT, Capability.DOCUMENT_GENERATE_RECEIPTS),
  uploadRateLimiter,
  validate({ body: presignedUploadSchema }),
  documentController.getPresignedUploadUrl
);

// Step 2 — register the uploaded file in the database
router.post(
  '/confirm',
  requireAnyCapability(Capability.SURVEY_IMPORT, Capability.DOCUMENT_GENERATE_RECEIPTS),
  validate({ body: confirmUploadSchema }),
  documentController.confirmUpload
);

// ─── PDF generation (CPU-intensive — uses dedicated rate limiter) ─────────────

router.post(
  '/generate/lease/:id',
  requireCapability(Capability.DOCUMENT_GENERATE_ALL),
  documentRateLimiter,
  validate({ params: generateLeaseDocParamSchema }),
  documentController.generateLeaseDoc
);

router.post(
  '/generate/receipt/:id',
  requireAnyCapability(Capability.DOCUMENT_GENERATE_ALL, Capability.DOCUMENT_GENERATE_RECEIPTS),
  documentRateLimiter,
  validate({ params: generateReceiptDocParamSchema }),
  documentController.generateReceiptDoc
);

router.post(
  '/generate/boundary-cert/:plotId',
  requireCapability(Capability.DOCUMENT_GENERATE_ALL),
  documentRateLimiter,
  validate({ params: generatePlotDocParamSchema }),
  documentController.generateBoundaryCertificate
);

router.post(
  '/generate/plot-cert/:plotId',
  requireCapability(Capability.DOCUMENT_GENERATE_ALL),
  documentRateLimiter,
  validate({ params: generatePlotDocParamSchema }),
  documentController.generatePlotCertificate
);

// Managers may generate demand letters as part of arrears follow-up
// (DOCUMENT_GENERATE_RECEIPTS); other certificates are SA/Admin only.
router.post(
  '/generate/demand-letter/:leaseId',
  requireAnyCapability(Capability.DOCUMENT_GENERATE_ALL, Capability.DOCUMENT_GENERATE_RECEIPTS),
  documentRateLimiter,
  validate({ params: generateLeaseDemandParamSchema }),
  documentController.generateDemandLetter
);

router.post(
  '/generate/lc-package/:plotId',
  requireCapability(Capability.DOCUMENT_GENERATE_ALL),
  documentRateLimiter,
  validate({ params: generatePlotDocParamSchema }),
  documentController.generateLCSubmissionPackage
);

router.post(
  '/generate/annual-report/:propertyId',
  requireCapability(Capability.DOCUMENT_GENERATE_ALL),
  documentRateLimiter,
  validate({ params: generatePropertyDocParamSchema, query: generateAnnualReportQuerySchema }),
  documentController.generateAnnualReport
);

// ─── Single document — specific routes must precede /:id ─────────────────────

router.get(
  '/:id/download-url',
  requireAnyCapability(
    Capability.DOCUMENT_GENERATE_ALL,
    Capability.DOCUMENT_GENERATE_RECEIPTS,
    Capability.DOCUMENT_VIEW_OWN
  ),
  validate({ params: documentIdParamSchema }),
  documentController.getDownloadUrl
);

router.get(
  '/:id',
  requireAnyCapability(
    Capability.DOCUMENT_GENERATE_ALL,
    Capability.DOCUMENT_GENERATE_RECEIPTS,
    Capability.DOCUMENT_VIEW_OWN
  ),
  validate({ params: documentIdParamSchema }),
  documentController.getOne
);

router.delete(
  '/:id',
  requireCapability(Capability.DOCUMENT_GENERATE_ALL),
  validate({ params: documentIdParamSchema }),
  documentController.delete
);

export default router;
