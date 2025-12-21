
import express from 'express';
import { getColumns, moveConversation, handleInbound, updateColumnConfig, getConversations, createConversation, getMessages, sendMessage, archiveConversation, deleteConversation, getContactSnapshot, getClientOrders, getOrderDetails, createCoupon } from '../controllers/crmController';
import { requireAuth, requireRole } from '../middleware/authMiddleware';

const router = express.Router();

// Public/Webook-only (v1: restricted to staff/admin for testing, but eventually will have webhook specific keys)
// For handling external messages (WA/IG/FB)
// For handling external messages (WA/IG/FB)
router.post('/inbound', handleInbound);
// Whapi automatically appends /messages and /statuses in some modes
router.post('/inbound/messages', handleInbound);
router.post('/inbound/statuses', handleInbound);

// Protective routes for Kanban board management
router.get('/columns', requireAuth, requireRole('admin', 'super_admin', 'staff'), getColumns);
router.get('/conversations', requireAuth, requireRole('admin', 'super_admin', 'staff'), getConversations);
router.get('/conversations/:conversationId/messages', requireAuth, requireRole('admin', 'super_admin', 'staff'), getMessages);
router.post('/conversations/:conversationId/messages', requireAuth, requireRole('admin', 'super_admin', 'staff'), sendMessage);
router.patch('/columns/:id/config', requireAuth, requireRole('admin', 'super_admin', 'staff'), updateColumnConfig);
router.post('/move', requireAuth, requireRole('admin', 'super_admin', 'staff'), moveConversation);
router.post('/conversations', requireAuth, requireRole('admin', 'super_admin', 'staff'), createConversation);
router.patch('/conversations/:id/archive', requireAuth, requireRole('admin', 'super_admin', 'staff'), archiveConversation);
router.delete('/conversations/:id', requireAuth, requireRole('admin', 'super_admin', 'staff'), deleteConversation);
router.get('/contacts/:handle/snapshot', requireAuth, requireRole('admin', 'super_admin', 'staff'), getContactSnapshot);
router.get('/contacts/:handle/orders', requireAuth, requireRole('admin', 'super_admin', 'staff'), getClientOrders);
router.get('/orders/:orderId', requireAuth, requireRole('admin', 'super_admin', 'staff'), getOrderDetails);
router.post('/coupons', requireAuth, requireRole('admin', 'super_admin', 'staff'), createCoupon);

export default router;
