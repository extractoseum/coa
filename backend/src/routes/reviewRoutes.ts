import { Router } from 'express';
import {
    getReviews,
    createReview,
    updateReview,
    deleteReview,
    checkUserReview,
    getPendingReviews,
    approveReview,
    rejectReview,
    updateReviewSettings
} from '../controllers/reviewController';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware';

const router = Router();

// Public routes
router.get('/:coaToken', getReviews);

// User routes (authenticated)
router.get('/:coaToken/my-review', optionalAuth, checkUserReview);
router.post('/:coaToken', requireAuth, createReview);
router.patch('/review/:reviewId', requireAuth, updateReview);
router.delete('/review/:reviewId', requireAuth, deleteReview);

// COA owner routes
router.get('/:coaToken/pending', requireAuth, getPendingReviews);
router.patch('/review/:reviewId/approve', requireAuth, approveReview);
router.delete('/review/:reviewId/reject', requireAuth, rejectReview);

// Review settings (COA owner or super admin)
router.patch('/:coaToken/settings', requireAuth, updateReviewSettings);

export default router;
