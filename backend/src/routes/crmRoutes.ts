
import express from 'express';
import { getColumns, moveConversation, handleInbound, updateColumnConfig, getConversations, createConversation, getMessages, sendMessage, archiveConversation, deleteConversation, getContactSnapshot, getClientOrders, getOrderDetails, createCoupon, searchClients, startConversationWithClient, createeDarkStoreTicket } from '../controllers/crmController';
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
router.post('/conversations/:conversationId/messages/voice', requireAuth, requireRole('admin', 'super_admin', 'staff'), (req, res) => require('../controllers/crmController').sendVoiceMessage(req, res));
router.patch('/columns/:id/config', requireAuth, requireRole('admin', 'super_admin', 'staff'), updateColumnConfig);
router.post('/move', requireAuth, requireRole('admin', 'super_admin', 'staff'), moveConversation);
router.post('/conversations', requireAuth, requireRole('admin', 'super_admin', 'staff'), createConversation);
router.patch('/conversations/:id/archive', requireAuth, requireRole('admin', 'super_admin', 'staff'), archiveConversation);
router.delete('/conversations/:id', requireAuth, requireRole('admin', 'super_admin', 'staff'), deleteConversation);
router.get('/contacts/:handle/snapshot', requireAuth, requireRole('admin', 'super_admin', 'staff'), getContactSnapshot);
router.get('/contacts/:handle/orders', requireAuth, requireRole('admin', 'super_admin', 'staff'), getClientOrders);
router.get('/orders/:orderId', requireAuth, requireRole('admin', 'super_admin', 'staff'), getOrderDetails);
router.post('/coupons', requireAuth, requireRole('admin', 'super_admin', 'staff'), createCoupon);

// Client search and conversation initiation
router.get('/clients/search', requireAuth, requireRole('admin', 'super_admin', 'staff'), searchClients);
router.post('/clients/start-conversation', requireAuth, requireRole('admin', 'super_admin', 'staff'), startConversationWithClient);

// eDarkStore Ticket System
router.post('/tickets/edarkstore', requireAuth, requireRole('admin', 'super_admin', 'staff'), createeDarkStoreTicket);
router.post('/conversations/:conversationId/sync-facts', requireAuth, requireRole('admin', 'super_admin', 'staff'), (req, res) => require('../controllers/crmController').syncFacts(req, res));
router.put('/contacts/:handle', requireAuth, requireRole('admin', 'super_admin', 'staff'), (req, res) => require('../controllers/crmController').updateContact(req, res));
router.patch('/conversations/:conversationId', requireAuth, requireRole('admin', 'super_admin', 'staff'), (req, res) => require('../controllers/crmController').updateConversation(req, res));

// Orchestrator Chips
router.get('/chips/channel', requireAuth, requireRole('admin', 'super_admin'), (req, res) => require('../controllers/crmController').getChannelChips(req, res));
router.get('/chips/mini', requireAuth, requireRole('admin', 'super_admin'), (req, res) => require('../controllers/crmController').getMiniChips(req, res));
router.post('/chips/mini', requireAuth, requireRole('admin', 'super_admin'), (req, res) => require('../controllers/crmController').upsertMiniChip(req, res));
router.post('/chips/channel', requireAuth, requireRole('admin', 'super_admin'), (req, res) => require('../controllers/crmController').upsertChannelChip(req, res));

// System Inquiry
router.post('/conversations/:id/inquiry', requireAuth, requireRole('admin', 'super_admin', 'staff'), async (req, res) => {
    try {
        const { id } = req.params;
        const { inquiry_id, action, payload, custom_value } = req.body;
        // Lazy load service to reuse singleton or plain class
        const { CRMService } = require('../services/CRMService');
        const service = new CRMService();
        const result = await service.resolveInquiry(id, inquiry_id, action, payload, custom_value);
        res.json({ success: true, data: result });
    } catch (e: any) {
        console.error('Inquiry Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

export default router;
