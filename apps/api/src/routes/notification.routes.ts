import { Router } from 'express';
import { notificationController } from '../controllers/notification.controller';
import { authenticate } from '../middleware/authenticate';
import { validate } from '../middleware/validate';
import { listNotificationsQuerySchema } from '../validations/alert.schema';

const router = Router();

router.use(authenticate);

// Every role receives notifications relevant to them — own-scoping is applied
// at the query layer (req.user.id), not via a capability gate.
router.get(
  '/',
  validate({ query: listNotificationsQuerySchema }),
  notificationController.list
);

export default router;
