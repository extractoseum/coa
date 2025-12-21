import { Router } from 'express';
import multer from 'multer';
import { getSettings, updateSettings, removeLogo } from '../controllers/settingsController';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max for logo
});

// GET /api/v1/settings - Get global settings
router.get('/', getSettings);

// PUT /api/v1/settings - Update settings (with optional logo upload)
router.put('/', upload.single('logo'), updateSettings);

// DELETE /api/v1/settings/logo - Remove company logo
router.delete('/logo', removeLogo);

export default router;
