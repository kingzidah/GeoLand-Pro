import { Router } from 'express';
import { tenantController } from '../controllers/tenant.controller';
import { authenticate } from '../middleware/authenticate';
import { scopeToOrganisation } from '../middleware/tenant.middleware';
import { requireCapability, requireAnyCapability } from '../middleware/requireCapability';
import { Capability } from '@geolandpro/rbac';
import { validate } from '../middleware/validate';
import {
  userIdParamSchema,
  listTenantsQuerySchema,
  createTenantProfileSchema,
  updateTenantProfileSchema,
} from '../validations/tenant.schema';

const router = Router();

router.use(authenticate);
router.use(scopeToOrganisation);

// ─── Tenant list (staff only) ─────────────────────────────────────────────────

router.get(
  '/',
  requireCapability(Capability.TENANT_MANAGE),
  validate({ query: listTenantsQuerySchema }),
  tenantController.list
);

// ─── Individual tenant (self-access for the tenant; Manager+ for others) ──────
// Phase 5 will enforce the OWN-scoping (req.user.id) for TENANT_VIEW_OWN.

router.get(
  '/:userId',
  requireAnyCapability(Capability.TENANT_MANAGE, Capability.TENANT_VIEW_OWN),
  validate({ params: userIdParamSchema }),
  tenantController.getOne
);

// ─── KYC profile management ───────────────────────────────────────────────────

router.post(
  '/:userId/profile',
  requireAnyCapability(Capability.TENANT_MANAGE, Capability.TENANT_VIEW_OWN),
  validate({ params: userIdParamSchema, body: createTenantProfileSchema }),
  tenantController.createProfile
);

router.patch(
  '/:userId/profile',
  requireAnyCapability(Capability.TENANT_MANAGE, Capability.TENANT_VIEW_OWN),
  validate({ params: userIdParamSchema, body: updateTenantProfileSchema }),
  tenantController.updateProfile
);

// ─── Tenant's lease history ───────────────────────────────────────────────────

router.get(
  '/:userId/leases',
  requireAnyCapability(Capability.TENANT_MANAGE, Capability.TENANT_VIEW_OWN),
  validate({ params: userIdParamSchema }),
  tenantController.getLeases
);

export default router;
