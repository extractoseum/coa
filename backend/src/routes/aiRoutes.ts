
import express from 'express';
import { classifyMessage, chatWithAra, getUsageStats, checkModelsStatus, setConversationOutcome, getPendingOutcomes, getOutcomeStats, submitMessageFeedback, getUnprocessedFeedback, getFeedbackStats, getAgentPerformanceDashboard, getAgentQuickStats } from '../controllers/aiController';
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

// Outcome Tracking (Phase 3)
router.post('/outcomes', requireAuth, requireRole('admin', 'super_admin', 'staff'), setConversationOutcome);
router.get('/outcomes/pending', requireAuth, requireRole('admin', 'super_admin', 'staff'), getPendingOutcomes);
router.get('/outcomes/stats', requireAuth, requireRole('admin', 'super_admin', 'staff'), getOutcomeStats);

// Feedback Loop (Phase 5)
router.post('/feedback', requireAuth, requireRole('admin', 'super_admin', 'staff'), submitMessageFeedback);
router.get('/feedback/unprocessed', requireAuth, requireRole('admin', 'super_admin', 'staff'), getUnprocessedFeedback);
router.get('/feedback/stats', requireAuth, requireRole('admin', 'super_admin', 'staff'), getFeedbackStats);

// Agent Performance Dashboard (Phase 7)
router.get('/performance/dashboard', requireAuth, requireRole('admin', 'super_admin'), getAgentPerformanceDashboard);
router.get('/performance/quick', requireAuth, requireRole('admin', 'super_admin', 'staff'), getAgentQuickStats);

export default router;
