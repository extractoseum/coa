import { Router } from 'express';
import { getMyOrders, getOrderTrackingDetail, refreshOrderTracking, createDraftOrder } from '../controllers/orderController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// All order routes require authentication
router.use(requireAuth);

// Get my orders
router.get('/me', getMyOrders);

// Get tracking for a specific order
router.get('/:id/tracking', getOrderTrackingDetail);

// Refresh tracking
router.post('/:id/tracking/refresh', refreshOrderTracking);

// Create Draft Order (Sales Agent)
router.post('/draft', createDraftOrder);

export default router;
