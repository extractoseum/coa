import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { getGhostAlerts, triggerScan, bustGhost } from '../controllers/ghostbusterController';

const router = Router();

// Protected routes
router.use(requireAuth);

router.get('/alerts', getGhostAlerts);
router.post('/scan', triggerScan);
router.post('/bust', bustGhost);

export default router;
