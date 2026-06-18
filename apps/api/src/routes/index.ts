import { Router } from 'express';
import { apiRateLimiter } from '../middleware/rateLimit';
import authRouter from './auth.routes';
import propertyRouter from './property.routes';
import plotRouter from './plot.routes';
import tenantRouter from './tenant.routes';
import leaseRouter from './lease.routes';
import transactionRouter from './transaction.routes';
import financeRouter from './finance.routes';
import documentRouter from './document.routes';
import photoRouter from './photo.routes';
import alertRouter from './alert.routes';
import notificationRouter from './notification.routes';
import adminRouter from './admin.routes';
import aiRouter from './ai.routes';
import satelliteRouter from './satellite.routes';
import vaultRouter from './vault.routes';
import { platformRouter, orgRouter } from './organisation.routes';

// Ensure Bull queue processors and nightly arrears scheduler start at server boot
import '../queues/notification.queue';

const router = Router();

// Global rate limiter applied to all API routes
router.use(apiRateLimiter);

// ─── Mounted routers ──────────────────────────────────────────────────────────
router.use('/auth', authRouter);
router.use('/properties', propertyRouter);
router.use('/plots', plotRouter);
router.use('/tenants', tenantRouter);
router.use('/leases', leaseRouter);
router.use('/transactions', transactionRouter);
router.use('/finance', financeRouter);
router.use('/documents', documentRouter);
router.use('/photos', photoRouter);
router.use('/alerts', alertRouter);
router.use('/notifications', notificationRouter);
router.use('/admin', adminRouter);
router.use('/ai', aiRouter);
router.use('/satellite', satelliteRouter);
router.use('/vault', vaultRouter);
router.use('/platform', platformRouter);
router.use('/org', orgRouter);

export { router as apiRouter };
