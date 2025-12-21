import { Router } from 'express';
import multer from 'multer';
import {
    getAllChemists,
    getActiveChemists,
    getDefaultChemist,
    getChemistById,
    createChemist,
    updateChemist,
    setDefaultChemist,
    deleteChemist,
    permanentlyDeleteChemist,
    removeChemistSignature
} from '../controllers/chemistController';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB max for signature images
});

// GET /api/v1/chemists - Get all chemists
router.get('/', getAllChemists);

// GET /api/v1/chemists/active - Get active chemists only
router.get('/active', getActiveChemists);

// GET /api/v1/chemists/default - Get default chemist
router.get('/default', getDefaultChemist);

// GET /api/v1/chemists/:id - Get chemist by ID
router.get('/:id', getChemistById);

// POST /api/v1/chemists - Create new chemist
router.post('/', upload.single('signature'), createChemist);

// PUT /api/v1/chemists/:id - Update chemist
router.put('/:id', upload.single('signature'), updateChemist);

// POST /api/v1/chemists/:id/default - Set chemist as default
router.post('/:id/default', setDefaultChemist);

// DELETE /api/v1/chemists/:id - Soft delete (deactivate) chemist
router.delete('/:id', deleteChemist);

// DELETE /api/v1/chemists/:id/permanent - Permanently delete chemist
router.delete('/:id/permanent', permanentlyDeleteChemist);

// DELETE /api/v1/chemists/:id/signature - Remove signature from chemist
router.delete('/:id/signature', removeChemistSignature);

export default router;
