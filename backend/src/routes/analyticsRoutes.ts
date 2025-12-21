import { Router } from 'express';
import {
    trackAccess,
    trackPDFDownload,
    trackLinkClick,
    getCOAAnalytics,
    getClientDashboard,
    getSuperAdminDashboard,
    getSuspiciousActivity,
    resolveSuspiciousActivity
} from '../controllers/analyticsController';
import { requireAuth, requireRole } from '../middleware/authMiddleware';

const router = Router();

// /api/v1/analytics

// ============================================
// Public Tracking Endpoints (no auth required)
// These are called from frontend to track user behavior
// ============================================
router.post('/track/:token', trackAccess);              // Track COA view/access
router.post('/track/:token/pdf', trackPDFDownload);     // Track PDF download
router.post('/track/:token/link', trackLinkClick);      // Track link click

// ============================================
// Authenticated Endpoints (owner or admin)
// ============================================

// Client Dashboard - shows analytics for all COAs owned by the authenticated client
router.get('/dashboard', requireAuth, getClientDashboard);

// COA-specific analytics - owner or super_admin can view
router.get('/coa/:token', requireAuth, getCOAAnalytics);

// ============================================
// Super Admin Only Endpoints
// ============================================

// Super Admin Dashboard - global analytics across all COAs and clients
router.get('/admin/dashboard', requireAuth, requireRole('super_admin'), getSuperAdminDashboard);

// Suspicious Activity Management
router.get('/admin/suspicious', requireAuth, requireRole('super_admin'), getSuspiciousActivity);
router.post('/admin/suspicious/:id/resolve', requireAuth, requireRole('super_admin'), resolveSuspiciousActivity);

export default router;
