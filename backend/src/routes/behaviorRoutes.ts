import { Router } from 'express';
import { trackBehaviorEvent, getClientActivity } from '../controllers/behaviorController';

const router = Router();

// Publicly accessible with basic protection (could add API key later)
router.post('/track', trackBehaviorEvent);

// Admin-only or internally used
router.get('/activity/:handle', getClientActivity);

export default router;
