import { Router } from 'express';
import { handleVapiWebhook, initiateCall } from '../controllers/vapiController';
import { requireAuth } from '../middleware/authMiddleware'; // Optional for initiateCall

const router = Router();

// Public Webhook (Vapi server calls this)
router.post('/webhook', handleVapiWebhook);

// Protected Call Initiation (App calls this)
router.post('/call', requireAuth, initiateCall);

export default router;
