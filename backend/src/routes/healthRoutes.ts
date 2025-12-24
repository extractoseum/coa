
import express from 'express';
import { checkStatus, getDiagnostics, getMetrics } from '../controllers/healthController';
import { requireAuth, requireSuperAdmin } from '../middleware/authMiddleware';

const router = express.Router();

router.get('/', checkStatus);
router.get('/diagnostics', requireAuth, requireSuperAdmin, getDiagnostics);
router.get('/metrics', requireAuth, requireSuperAdmin, getMetrics);

export default router;
