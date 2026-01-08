import { Router } from 'express';
import {
    startImpersonation,
    endImpersonation,
    getActiveSession,
    getImpersonationHistory,
    getSessionAuditLogs,
    forceEndSession
} from '../controllers/impersonationController';
import { requireAuth, requireSuperAdmin, requireStepUp } from '../middleware/authMiddleware';
import { preventCascadeImpersonation } from '../middleware/impersonationMiddleware';

const router = Router();

/**
 * Start impersonation session
 * POST /api/v1/impersonation/start
 * Requires: super_admin + step-up verification (5 min) + not already impersonating
 */
router.post(
    '/start',
    requireAuth,
    requireSuperAdmin,
    requireStepUp(60, false), // Must have verified within last 60 minutes, skip for super_admin
    preventCascadeImpersonation,
    startImpersonation
);

/**
 * End impersonation session
 * POST /api/v1/impersonation/end
 * Can be called by admin while impersonating
 */
router.post(
    '/end',
    requireAuth,
    endImpersonation
);

/**
 * Get active session info
 * GET /api/v1/impersonation/active
 * Returns current impersonation status
 */
router.get(
    '/active',
    requireAuth,
    getActiveSession
);

/**
 * Get impersonation history (all sessions)
 * GET /api/v1/impersonation/history
 * Query params: ?limit=50&offset=0&adminId=xxx&clientId=xxx
 * Super admin only
 */
router.get(
    '/history',
    requireAuth,
    requireSuperAdmin,
    getImpersonationHistory
);

/**
 * Get audit logs for a specific session
 * GET /api/v1/impersonation/audit/:sessionId
 * Super admin only
 */
router.get(
    '/audit/:sessionId',
    requireAuth,
    requireSuperAdmin,
    getSessionAuditLogs
);

/**
 * Force end an impersonation session
 * POST /api/v1/impersonation/force-end/:sessionId
 * Super admin security feature
 */
router.post(
    '/force-end/:sessionId',
    requireAuth,
    requireSuperAdmin,
    forceEndSession
);

export default router;
