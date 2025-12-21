
import express from 'express';
import { getTools, updateTools } from '../controllers/toolsController';
import { requireAuth, requireSuperAdmin } from '../middleware/authMiddleware';

const router = express.Router();

// Protect these routes - Super Admin only
router.get('/', requireAuth, requireSuperAdmin, getTools);
router.post('/', requireAuth, requireSuperAdmin, updateTools);

export default router;
