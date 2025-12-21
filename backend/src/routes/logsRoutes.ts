import { Router } from 'express';
import { ingestLog, getSystemLogs, exportSystemLogs, getSystemInsights } from '../controllers/logsController';
import { requireAuth, requireSuperAdmin } from '../middleware/authMiddleware';

const router = Router();

// Public ingestion (protected by global rate limiter in index.ts)
// This is used by the frontend to report client-side errors
router.post('/', ingestLog);

// Admin-only retrieval
router.get('/admin', requireAuth, requireSuperAdmin, getSystemLogs);

// Admin-only export
router.get('/admin/export', requireAuth, requireSuperAdmin, exportSystemLogs);
router.get('/admin/insights', requireAuth, requireSuperAdmin, getSystemInsights);

export default router;
