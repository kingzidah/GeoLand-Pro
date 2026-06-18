import { Router } from 'express';
import { photoController } from '../controllers/photo.controller';
import { authenticate } from '../middleware/authenticate';
import { requireCapability } from '../middleware/requireCapability';
import { Capability } from '@geolandpro/rbac';
import { validate } from '../middleware/validate';
import { uploadPhoto } from '../middleware/upload';
import { uploadRateLimiter } from '../middleware/rateLimit';
import { uploadPhotoSchema, plotIdParamSchema } from '../validations/photo.schema';

const router = Router();

router.use(authenticate);

// ─── Upload — Field Surveyors capture GPS-tagged site photos as part of survey work ──

router.post(
  '/upload',
  requireCapability(Capability.SURVEY_IMPORT),
  uploadRateLimiter,
  uploadPhoto,
  validate({ body: uploadPhotoSchema }),
  photoController.upload
);

// ─── List photos for a plot — staff scoped to managed properties ────────────

router.get(
  '/plot/:plotId',
  requireCapability(Capability.SURVEY_IMPORT),
  validate({ params: plotIdParamSchema }),
  photoController.listByPlot
);

export default router;
