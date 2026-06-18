import { Router } from 'express';
import { alertController } from '../controllers/alert.controller';
import { authenticate } from '../middleware/authenticate';
import { scopeToOrganisation } from '../middleware/tenant.middleware';
import { requireCapability, requireAnyCapability } from '../middleware/requireCapability';
import { Capability } from '@geolandpro/rbac';
import { validate } from '../middleware/validate';
import {
  alertIdParamSchema,
  createAlertSchema,
  updateAlertSchema,
  listAlertsQuerySchema,
  listAlertEventsQuerySchema,
  triggerCheckSchema,
} from '../validations/alert.schema';

const router = Router();

router.use(authenticate);
router.use(scopeToOrganisation);

// Report GPS position; server does PostGIS containment check. Field Surveyors
// (view-only on alerts) report from the field; SA/Admin/Manager can also trigger.
router.post(
  '/trigger',
  requireAnyCapability(Capability.ALERT_MANAGE, Capability.ALERT_VIEW),
  validate({ body: triggerCheckSchema }),
  alertController.triggerCheck
);

// Field Surveyors get view access to alert rules; SA/Admin/Manager manage them.
router.get(
  '/',
  requireAnyCapability(Capability.ALERT_MANAGE, Capability.ALERT_VIEW),
  validate({ query: listAlertsQuerySchema }),
  alertController.list
);

router.post(
  '/',
  requireCapability(Capability.ALERT_MANAGE),
  validate({ body: createAlertSchema }),
  alertController.create
);

// Specific sub-route before parameterised /:id
router.get(
  '/:id/events',
  requireAnyCapability(Capability.ALERT_MANAGE, Capability.ALERT_VIEW),
  validate({ params: alertIdParamSchema, query: listAlertEventsQuerySchema }),
  alertController.listEvents
);

router.get(
  '/:id',
  requireAnyCapability(Capability.ALERT_MANAGE, Capability.ALERT_VIEW),
  validate({ params: alertIdParamSchema }),
  alertController.getOne
);

router.patch(
  '/:id',
  requireCapability(Capability.ALERT_MANAGE),
  validate({ params: alertIdParamSchema, body: updateAlertSchema }),
  alertController.update
);

router.delete(
  '/:id',
  requireCapability(Capability.ALERT_MANAGE),
  validate({ params: alertIdParamSchema }),
  alertController.delete
);

export default router;
