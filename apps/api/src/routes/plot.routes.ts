import { Router } from 'express';
import { plotController } from '../controllers/plot.controller';
import { plotTilesController } from '../controllers/plot.tiles.controller';
import { authenticate } from '../middleware/authenticate';
import { scopeToOrganisation, requireOrganisation } from '../middleware/tenant.middleware';
import { requireAnyCapability } from '../middleware/requireCapability';
import { Capability } from '@geolandpro/rbac';
import { validate } from '../middleware/validate';
import { plotIdParamSchema } from '../validations/property.schema';

const router = Router();

router.use(authenticate);
router.use(scopeToOrganisation);

// MVT tile feed for the 3D map (Map3D / Plot3DMap). Must be registered before
// the /:plotId route below so "tiles" isn't matched as a plotId.
router.get('/tiles/:z/:x/:y.pbf', requireOrganisation, plotTilesController.getTile);

// Standalone plot lookup (no propertyId in the URL) — used by the plot detail
// page reached from the map. Staff get org-scoped access (PLOT_VIEW); tenants
// may view only the plot tied to their own lease (PLOT_VIEW_OWN, enforced in
// plotService.getByIdGlobal via req.user.id).
router.get(
  '/:plotId',
  requireAnyCapability(Capability.PLOT_VIEW, Capability.PLOT_VIEW_OWN),
  validate({ params: plotIdParamSchema }),
  plotController.getOneGlobal
);

export default router;
