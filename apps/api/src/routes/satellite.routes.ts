import { Router } from 'express';
import { satelliteController } from '../controllers/satellite.controller';
import { authenticate } from '../middleware/authenticate';
import { requireCapability, requireAnyCapability } from '../middleware/requireCapability';
import { Capability } from '@geolandpro/rbac';
import { validate } from '../middleware/validate';
import { propertyIdParamSchema, createSatelliteOrderSchema } from '../validations/satellite.schema';

const router = Router();

router.use(authenticate);
// Manager gets VIEW only (no ordering); Super Admin/Admin get full SATELLITE_MANAGE.
router.use(requireAnyCapability(Capability.SATELLITE_MANAGE, Capability.SATELLITE_VIEW));

router.get('/health', satelliteController.health);

router.get(
  '/:propertyId/info',
  validate({ params: propertyIdParamSchema }),
  satelliteController.getInfo
);

router.get(
  '/:propertyId/latest',
  validate({ params: propertyIdParamSchema }),
  satelliteController.getLatest
);

router.get(
  '/:propertyId/history',
  validate({ params: propertyIdParamSchema }),
  satelliteController.getHistory
);

// Ordering a new capture costs money — Manager (VIEW-only) is excluded.
router.post(
  '/:propertyId/order',
  requireCapability(Capability.SATELLITE_MANAGE),
  validate({ params: propertyIdParamSchema, body: createSatelliteOrderSchema }),
  satelliteController.createOrder
);

export default router;
