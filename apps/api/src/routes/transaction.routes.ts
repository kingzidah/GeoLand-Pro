import { Router } from 'express';
import { transactionController } from '../controllers/transaction.controller';
import { authenticate } from '../middleware/authenticate';
import { scopeToOrganisation } from '../middleware/tenant.middleware';
import { requireCapability } from '../middleware/requireCapability';
import { Capability } from '@geolandpro/rbac';
import { validate } from '../middleware/validate';
import {
  transactionIdParamSchema,
  listTransactionsQuerySchema,
  recordPaymentSchema,
  updateTransactionStatusSchema,
} from '../validations/transaction.schema';

const router = Router();

router.use(authenticate);
router.use(scopeToOrganisation);

router.get(
  '/',
  requireCapability(Capability.PAYMENT_MANAGE),
  validate({ query: listTransactionsQuerySchema }),
  transactionController.list
);

router.post(
  '/',
  requireCapability(Capability.PAYMENT_MANAGE),
  validate({ body: recordPaymentSchema }),
  transactionController.recordPayment
);

router.get(
  '/:id',
  requireCapability(Capability.PAYMENT_MANAGE),
  validate({ params: transactionIdParamSchema }),
  transactionController.getOne
);

// Status updates: Super Admin/Admin only (e.g. reversing a completed transaction)
router.patch(
  '/:id/status',
  requireCapability(Capability.PAYMENT_STATUS_OVERRIDE),
  validate({ params: transactionIdParamSchema, body: updateTransactionStatusSchema }),
  transactionController.updateStatus
);

export default router;
