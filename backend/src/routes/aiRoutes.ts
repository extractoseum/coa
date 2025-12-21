
import express from 'express';
import { classifyMessage, chatWithAra, getUsageStats, checkModelsStatus } from '../controllers/aiController';
import { requireAuth, requireRole } from '../middleware/authMiddleware';

const router = express.Router();

import { injectAIContext } from '../middleware/contextMiddleware';

// Protected route - only Staff/Admins should invoke AI tools to save costs
// or maybe automated system can invoke it. For now, let's protect it.
router.post('/classify', requireAuth, requireRole('admin', 'super_admin', 'staff'), injectAIContext, classifyMessage);
router.post('/chat', requireAuth, requireRole('admin', 'super_admin', 'staff'), injectAIContext, chatWithAra);
router.get('/usage', requireAuth, requireRole('admin', 'super_admin', 'staff'), getUsageStats);
router.post('/status', requireAuth, requireRole('admin', 'super_admin', 'staff'), checkModelsStatus);

// Conversation History
const conversationController = require('../controllers/aiConversationController');
router.get('/conversations', requireAuth, requireRole('admin', 'super_admin', 'staff'), conversationController.listConversations);
router.post('/conversations', requireAuth, requireRole('admin', 'super_admin', 'staff'), conversationController.createConversation);
router.get('/conversations/:id', requireAuth, requireRole('admin', 'super_admin', 'staff'), conversationController.getConversation);
router.delete('/conversations/:id', requireAuth, requireRole('admin', 'super_admin', 'staff'), conversationController.deleteConversation);

export default router;
