import { Router } from 'express';
import {
    registerDevice,
    unregisterDevice,
    sendNotification,
    getNotificationHistory,
    cancelNotification,
    getPreferences,
    updatePreferences,
    getStats,
    getShopifyTags,
    refreshShopifyTags,
    getRefreshStatus,
    syncCustomersBackup,
    getCustomersBackupStats,
    searchCustomers,
    getCustomersByTag,
    getWhatsAppStatus,
    getEmailStatus
} from '../controllers/pushController';
import { requireAuth, requireSuperAdmin } from '../middleware/authMiddleware';

const router = Router();

// Public health check for email service (no auth required for diagnostics)
router.get('/email/health', getEmailStatus);

// Public routes (for registering devices before full auth)
router.post('/register', requireAuth, registerDevice);
router.post('/unregister', unregisterDevice);

// User preferences (authenticated users)
router.get('/preferences', requireAuth, getPreferences);
router.put('/preferences', requireAuth, updatePreferences);

// Super admin only routes
router.post('/send', requireAuth, requireSuperAdmin, sendNotification);
router.get('/history', requireAuth, requireSuperAdmin, getNotificationHistory);
router.get('/stats', requireAuth, requireSuperAdmin, getStats);
router.get('/tags', requireAuth, requireSuperAdmin, getShopifyTags);
router.post('/tags/refresh', requireAuth, requireSuperAdmin, refreshShopifyTags);
router.get('/tags/status', requireAuth, requireSuperAdmin, getRefreshStatus);
router.delete('/cancel/:notificationId', requireAuth, requireSuperAdmin, cancelNotification);

// Customer backup routes (super_admin only)
router.post('/customers/sync', requireAuth, requireSuperAdmin, syncCustomersBackup);
router.get('/customers/stats', requireAuth, requireSuperAdmin, getCustomersBackupStats);
router.get('/customers/search', requireAuth, requireSuperAdmin, searchCustomers);
router.get('/customers/by-tag/:tag', requireAuth, requireSuperAdmin, getCustomersByTag);

// WhatsApp status route (super_admin only)
router.get('/whatsapp/status', requireAuth, requireSuperAdmin, getWhatsAppStatus);

// Email status route (super_admin only)
router.get('/email/status', requireAuth, requireSuperAdmin, getEmailStatus);

export default router;
