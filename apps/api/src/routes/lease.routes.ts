import { Router } from 'express';
import { leaseController } from '../controllers/lease.controller';
import { authenticate } from '../middleware/authenticate';
import { scopeToOrganisation } from '../middleware/tenant.middleware';
import { requireCapability, requireAnyCapability } from '../middleware/requireCapability';
import { Capability } from '@geolandpro/rbac';
import { validate } from '../middleware/validate';
import {
  leaseIdParamSchema,
  listLeasesQuerySchema,
  createLeaseSchema,
  updateLeaseSchema,
  signLeaseSchema,
  terminateLeaseSchema,
} from '../validations/tenant.schema';

const router = Router();

router.use(authenticate);
router.use(scopeToOrganisation);

// ─── List + Create ────────────────────────────────────────────────────────────

// Tenants see their own leases (LEASE_VIEW_OWN); Manager+ sees leases for
// their properties (LEASE_MANAGE). Field Surveyors get neither — 403.
router.get(
  '/',
  requireAnyCapability(Capability.LEASE_MANAGE, Capability.LEASE_VIEW_OWN),
  validate({ query: listLeasesQuerySchema }),
  leaseController.list
);

router.post(
  '/',
  requireCapability(Capability.LEASE_MANAGE),
  validate({ body: createLeaseSchema }),
  leaseController.create
);

// ─── Single lease ─────────────────────────────────────────────────────────────

router.get(
  '/:id',
  requireAnyCapability(Capability.LEASE_MANAGE, Capability.LEASE_VIEW_OWN),
  validate({ params: leaseIdParamSchema }),
  leaseController.getOne
);

// Terms can only be changed before any party has signed
router.patch(
  '/:id',
  requireCapability(Capability.LEASE_MANAGE),
  validate({ params: leaseIdParamSchema, body: updateLeaseSchema }),
  leaseController.update
);

// ─── Lease state machine ──────────────────────────────────────────────────────

// Both the tenant and Manager+ can sign — service layer determines which signature slot is used
router.post(
  '/:id/sign',
  requireAnyCapability(Capability.LEASE_MANAGE, Capability.LEASE_VIEW_OWN),
  validate({ params: leaseIdParamSchema, body: signLeaseSchema }),
  leaseController.sign
);

// Activation requires both signatures; sets lease ACTIVE + plot OCCUPIED + seeds rent records
router.post(
  '/:id/activate',
  requireCapability(Capability.LEASE_MANAGE),
  validate({ params: leaseIdParamSchema }),
  leaseController.activate
);

// Termination frees the plot and closes the lease — Super Admin / Admin only
router.post(
  '/:id/terminate',
  requireCapability(Capability.LEASE_TERMINATE),
  validate({ params: leaseIdParamSchema, body: terminateLeaseSchema }),
  leaseController.terminate
);

// ─── Rent records ─────────────────────────────────────────────────────────────

router.get(
  '/:id/rent-records',
  requireAnyCapability(Capability.LEASE_MANAGE, Capability.LEASE_VIEW_OWN),
  validate({ params: leaseIdParamSchema }),
  leaseController.getRentRecords
);

export default router;
