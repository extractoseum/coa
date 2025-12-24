
import express from 'express';
import { getDriftReport } from '../controllers/driftController';
import { requireAuth, requireSuperAdmin } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/status', requireAuth, requireSuperAdmin, getDriftReport);

export default router;
