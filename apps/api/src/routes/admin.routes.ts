import { Router } from 'express';
import { Role } from '@prisma/client';
import { adminController } from '../controllers/admin.controller';
import { authenticate } from '../middleware/authenticate';
import { requireCapability, requireRole } from '../middleware/requireCapability';
import { Capability } from '@geolandpro/rbac';
import { validate } from '../middleware/validate';
import { adminRateLimiter } from '../middleware/rateLimit';
import {
  listUsersQuerySchema,
  userIdParamSchema,
  changeRoleSchema,
  listAuditLogsQuerySchema,
} from '../validations/admin.schema';

const router = Router();

router.use(authenticate);
router.use(adminRateLimiter);

// ─── Platform stats — Super Admin/Admin (scoped to managed properties for Admin) ──

router.get('/stats', requireCapability(Capability.ADMIN_PANEL_VIEW), adminController.getStats);

// ─── Audit logs — Super Admin only ───────────────────────────────────────────

router.get(
  '/audit-logs',
  requireRole(Role.SUPER_ADMIN),
  validate({ query: listAuditLogsQuerySchema }),
  adminController.listAuditLogs
);

// ─── User management — Super Admin only ─────────────────────────────────────

router.get(
  '/users',
  requireRole(Role.SUPER_ADMIN),
  validate({ query: listUsersQuerySchema }),
  adminController.listUsers
);

// Specific action routes defined before /:id to avoid Express path conflicts
router.patch(
  '/users/:id/suspend',
  requireRole(Role.SUPER_ADMIN),
  validate({ params: userIdParamSchema }),
  adminController.suspendUser
);

router.patch(
  '/users/:id/activate',
  requireRole(Role.SUPER_ADMIN),
  validate({ params: userIdParamSchema }),
  adminController.activateUser
);

router.patch(
  '/users/:id/role',
  requireRole(Role.SUPER_ADMIN),
  validate({ params: userIdParamSchema, body: changeRoleSchema }),
  adminController.changeRole
);

router.get(
  '/users/:id',
  requireRole(Role.SUPER_ADMIN),
  validate({ params: userIdParamSchema }),
  adminController.getUser
);

export default router;
