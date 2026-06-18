import { Router } from 'express';
import { aiController } from '../controllers/ai.controller';
import { authenticate } from '../middleware/authenticate';
import { requireCapability } from '../middleware/requireCapability';
import { Capability } from '@geolandpro/rbac';
import { validate } from '../middleware/validate';
import { aiRateLimiter } from '../middleware/rateLimit';
import { assistantSchema, extractDocumentSchema } from '../validations/ai.schema';

const router = Router();

// ─── Public health check ─────────────────────────────────────────────────────

router.get('/health', aiController.health);

// ─── Property assistant — Super Admin / Admin / Manager ──────────────────────

router.post(
  '/assistant',
  authenticate,
  requireCapability(Capability.AI_ASSISTANT),
  aiRateLimiter,
  validate({ body: assistantSchema }),
  aiController.assistant
);

// ─── Document data extraction ────────────────────────────────────────────────

router.post(
  '/extract-document',
  authenticate,
  aiRateLimiter,
  validate({ body: extractDocumentSchema }),
  aiController.extractDocument
);

export default router;
