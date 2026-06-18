import { Router } from 'express';
import { financeController } from '../controllers/finance.controller';
import { authenticate } from '../middleware/authenticate';
import { scopeToOrganisation } from '../middleware/tenant.middleware';
import { requireCapability, requireAnyCapability } from '../middleware/requireCapability';
import { Capability } from '@geolandpro/rbac';
import { validate } from '../middleware/validate';
import {
  financeSummaryQuerySchema,
  listArrearsQuerySchema,
  listCommissionsQuerySchema,
  commissionIdParamSchema,
} from '../validations/transaction.schema';

const router = Router();

router.use(authenticate);
router.use(scopeToOrganisation);

// Dashboard summary — Manager gets VIEW-only, Super Admin/Admin get the full dashboard
router.get(
  '/summary',
  requireAnyCapability(Capability.FINANCE_DASHBOARD_FULL, Capability.FINANCE_DASHBOARD_VIEW),
  validate({ query: financeSummaryQuerySchema }),
  financeController.getSummary
);

// Arrears report — Manager gets VIEW-only, Super Admin/Admin get the full dashboard
router.get(
  '/arrears',
  requireAnyCapability(Capability.FINANCE_DASHBOARD_FULL, Capability.FINANCE_DASHBOARD_VIEW),
  validate({ query: listArrearsQuerySchema }),
  financeController.getArrears
);

// Commission list — Super Admin/Admin only (financial visibility)
router.get(
  '/commissions',
  requireCapability(Capability.FINANCE_DASHBOARD_FULL),
  validate({ query: listCommissionsQuerySchema }),
  financeController.getCommissions
);

// Mark commission paid — Super Admin only (platform owner reconciliation)
router.patch(
  '/commissions/:id/mark-paid',
  requireCapability(Capability.FINANCE_COMMISSION_SETTLE),
  validate({ params: commissionIdParamSchema }),
  financeController.markCommissionPaid
);

export default router;
