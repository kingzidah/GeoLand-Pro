import { Router } from 'express';
import { vaultController } from '../controllers/vault.controller';
import { authenticate } from '../middleware/authenticate';
import { requireCapability } from '../middleware/requireCapability';
import { Capability } from '@geolandpro/rbac';
import { scopeToOrganisation } from '../middleware/tenant.middleware';
import { validate } from '../middleware/validate';
import { documentRateLimiter } from '../middleware/rateLimit';
import { vaultPropertyIdParamSchema, subscribeVaultSchema, requestPhysicalVaultSchema } from '../validations/vault.schema';

const router = Router();

router.use(authenticate);
router.use(scopeToOrganisation);
router.use(requireCapability(Capability.VAULT_MANAGE));

router.get(
  '/:propertyId/status',
  validate({ params: vaultPropertyIdParamSchema }),
  vaultController.getStatus
);

router.post(
  '/:propertyId/subscribe',
  validate({ params: vaultPropertyIdParamSchema, body: subscribeVaultSchema }),
  vaultController.subscribe
);

router.post(
  '/:propertyId/generate-pack',
  documentRateLimiter,
  validate({ params: vaultPropertyIdParamSchema }),
  vaultController.generatePack
);

router.post(
  '/:propertyId/request-physical-vault',
  validate({ params: vaultPropertyIdParamSchema, body: requestPhysicalVaultSchema }),
  vaultController.requestPhysicalVault
);

router.patch(
  '/:propertyId/confirm-delivery',
  validate({ params: vaultPropertyIdParamSchema }),
  vaultController.confirmDelivery
);

export default router;
