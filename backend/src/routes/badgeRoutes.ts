import { Router } from 'express';
import multer from 'multer';
import { getBadges, createBadge, deleteBadge } from '../controllers/badgeController';
import { getCOABadges, assignBadgesToCOA } from '../controllers/coaBadgeController';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware';

const router = Router();

// Configure multer for badge uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB max
    }
});

// Badge management routes
router.get('/badges', getAllBadges);
router.post('/badges', upload.single('image'), createBadge);
router.delete('/badges/:id', deleteBadge);

// COA badge assignment routes
router.get('/coas/:token/badges', getCOABadges);
router.post('/coas/:token/badges', assignBadgesToCOA);

export default router;
