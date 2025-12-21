import { Router } from 'express';
import multer from 'multer';
import {
    getActiveBanner,
    getAllBanners,
    createBanner,
    updateBanner,
    setActiveBanner,
    deactivateAllBanners,
    deleteBanner
} from '../controllers/bannerController';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max for banner images
});

// GET /api/v1/banners/active - Get currently active banner
router.get('/active', getActiveBanner);

// GET /api/v1/banners - Get all banners
router.get('/', getAllBanners);

// POST /api/v1/banners - Create a new banner
router.post('/', upload.single('image'), createBanner);

// PATCH /api/v1/banners/:id - Update a banner
router.patch('/:id', updateBanner);

// POST /api/v1/banners/:id/activate - Set banner as active
router.post('/:id/activate', setActiveBanner);

// POST /api/v1/banners/deactivate-all - Deactivate all banners
router.post('/deactivate-all', deactivateAllBanners);

// DELETE /api/v1/banners/:id - Delete a banner
router.delete('/:id', deleteBanner);

export default router;
