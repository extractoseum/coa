import { Router } from 'express';
import multer from 'multer';
import { uploadAndExtractCOA, uploadImage } from '../controllers/uploadController';
import { requireAuth, requireRole } from '../middleware/authMiddleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// Only super_admin can upload and extract COAs
router.post('/extract', requireAuth, requireRole('super_admin'), upload.array('pdf'), uploadAndExtractCOA);

// Upload image (authenticated users)
router.post('/image', requireAuth, upload.single('file'), uploadImage);

export default router;
