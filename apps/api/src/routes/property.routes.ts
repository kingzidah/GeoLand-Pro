import { Router } from 'express';
import { Role } from '@prisma/client';
import { propertyController } from '../controllers/property.controller';
import { plotController } from '../controllers/plot.controller';
import { surveyController } from '../controllers/survey.controller';
import { authenticate } from '../middleware/authenticate';
import { scopeToOrganisation } from '../middleware/tenant.middleware';
import { requireCapability, requireRole } from '../middleware/requireCapability';
import { Capability } from '@geolandpro/rbac';
import { validate } from '../middleware/validate';
import {
  createPropertySchema,
  updatePropertySchema,
  addManagerSchema,
  propertyIdParamSchema,
  managerParamSchema,
  listPropertiesQuerySchema,
  createPlotSchema,
  updatePlotSchema,
  updatePlotStatusSchema,
  nestedPropertyParamSchema,
  plotParamSchema,
  listPlotsQuerySchema,
} from '../validations/property.schema';
import {
  surveyImportSchema,
  surveyValidateSchema,
  surveyPointCaptureSchema,
  surveySessionParamSchema,
  surveySessionCloseSchema,
  updatePropertyBoundarySchema,
} from '../validations/survey.schema';

const router = Router();

// All routes require a valid JWT and an organisation context (or platform admin)
router.use(authenticate);
router.use(scopeToOrganisation);

// ─── Property CRUD ────────────────────────────────────────────────────────────

router.get(
  '/',
  requireCapability(Capability.PLOT_VIEW),
  validate({ query: listPropertiesQuerySchema }),
  propertyController.list
);

router.post(
  '/',
  requireCapability(Capability.PROPERTY_EDIT),
  validate({ body: createPropertySchema }),
  propertyController.create
);

router.get(
  '/:id',
  requireCapability(Capability.PLOT_VIEW),
  validate({ params: propertyIdParamSchema }),
  propertyController.getOne
);

router.patch(
  '/:id',
  requireCapability(Capability.PROPERTY_EDIT),
  validate({ params: propertyIdParamSchema, body: updatePropertySchema }),
  propertyController.update
);

// Soft-delete: sets isActive = false (does not destroy data). Super Admin only — Admin gets create/edit.
router.delete(
  '/:id',
  requireRole(Role.SUPER_ADMIN),
  validate({ params: propertyIdParamSchema }),
  propertyController.deactivate
);

// ─── Property manager assignment ──────────────────────────────────────────────

router.post(
  '/:id/managers',
  requireCapability(Capability.PROPERTY_EDIT),
  validate({ params: propertyIdParamSchema, body: addManagerSchema }),
  propertyController.addManager
);

router.delete(
  '/:id/managers/:managerId',
  requireCapability(Capability.PROPERTY_EDIT),
  validate({ params: managerParamSchema }),
  propertyController.removeManager
);

// ─── Plots (nested under /properties/:propertyId/plots) ───────────────────────

router.get(
  '/:propertyId/plots',
  requireCapability(Capability.PLOT_VIEW),
  validate({ params: nestedPropertyParamSchema, query: listPlotsQuerySchema }),
  plotController.list
);

// Unpaginated, minimal-field listing for map rendering — must be registered
// before '/:propertyId/plots/:plotId' so 'map' isn't captured as a plot ID.
router.get(
  '/:propertyId/plots/map',
  requireCapability(Capability.PLOT_VIEW),
  validate({ params: nestedPropertyParamSchema }),
  plotController.forMap
);

router.post(
  '/:propertyId/plots',
  requireCapability(Capability.PLOT_CREATE_EDIT),
  validate({ params: nestedPropertyParamSchema, body: createPlotSchema }),
  plotController.create
);

router.get(
  '/:propertyId/plots/:plotId',
  requireCapability(Capability.PLOT_VIEW),
  validate({ params: plotParamSchema }),
  plotController.getOne
);

router.patch(
  '/:propertyId/plots/:plotId',
  requireCapability(Capability.PLOT_CREATE_EDIT),
  validate({ params: plotParamSchema, body: updatePlotSchema }),
  plotController.update
);

// Status transitions are MANAGER-level (e.g. DISPUTED, UNDER_SURVEY, RESERVED)
// OCCUPIED is driven by the lease service — blocked at service layer if attempted manually
router.patch(
  '/:propertyId/plots/:plotId/status',
  requireCapability(Capability.PLOT_STATUS_UPDATE),
  validate({ params: plotParamSchema, body: updatePlotStatusSchema }),
  plotController.updateStatus
);

router.delete(
  '/:propertyId/plots/:plotId',
  requireCapability(Capability.PROPERTY_EDIT),
  validate({ params: plotParamSchema }),
  plotController.delete
);

// ─── Property boundary (outer survey fence line) ──────────────────────────────

router.patch(
  '/:propertyId/boundary',
  requireCapability(Capability.PROPERTY_EDIT),
  validate({ params: nestedPropertyParamSchema, body: updatePropertyBoundarySchema }),
  propertyController.updateBoundary
);

// ─── Survey (GPS data input) ───────────────────────────────────────────────────

router.get(
  '/:propertyId/survey/template',
  requireCapability(Capability.SURVEY_IMPORT),
  validate({ params: nestedPropertyParamSchema }),
  surveyController.getTemplate
);

router.post(
  '/:propertyId/survey/import',
  requireCapability(Capability.SURVEY_IMPORT),
  validate({ params: nestedPropertyParamSchema, body: surveyImportSchema }),
  surveyController.import
);

router.post(
  '/:propertyId/survey/validate',
  requireCapability(Capability.SURVEY_IMPORT),
  validate({ params: nestedPropertyParamSchema, body: surveyValidateSchema }),
  surveyController.validate
);

router.get(
  '/:propertyId/survey/imports',
  requireCapability(Capability.SURVEY_IMPORT),
  validate({ params: nestedPropertyParamSchema }),
  surveyController.listImports
);

// Must be registered before '/:propertyId/survey/points/:sessionId' so
// 'sessions' isn't captured as a sessionId — same precedent as /plots/map.
router.get(
  '/:propertyId/survey/sessions',
  requireCapability(Capability.SURVEY_IMPORT),
  validate({ params: nestedPropertyParamSchema }),
  surveyController.listSessions
);

router.post(
  '/:propertyId/survey/points',
  requireCapability(Capability.SURVEY_IMPORT),
  validate({ params: nestedPropertyParamSchema, body: surveyPointCaptureSchema }),
  surveyController.addPoint
);

router.post(
  '/:propertyId/survey/points/:sessionId/close',
  requireCapability(Capability.SURVEY_IMPORT),
  validate({ params: surveySessionParamSchema, body: surveySessionCloseSchema }),
  surveyController.closeSession
);

router.get(
  '/:propertyId/survey/points/:sessionId',
  requireCapability(Capability.SURVEY_IMPORT),
  validate({ params: surveySessionParamSchema }),
  surveyController.getSessionPoints
);

export default router;
