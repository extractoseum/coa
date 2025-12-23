import { Router } from 'express';
import { trackBehaviorEvent, getClientActivity } from '../controllers/behaviorController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// Publicly accessible with basic protection (could add API key later)
router.post('/track', trackBehaviorEvent);

// Admin-only or internally used
router.get('/activity/:handle', requireAuth, getClientActivity);

export default router;
