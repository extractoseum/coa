import { Router } from 'express';
import {
    saveCOA,
    removeCOA,
    getMyCollection,
    checkSaved,
    updateNotes
} from '../controllers/collectionController';
import { requireAuth, optionalAuth } from '../middleware/authMiddleware';

const router = Router();

// All routes require authentication except checkSaved
router.get('/my-collection', requireAuth, getMyCollection);
router.post('/save/:coaToken', requireAuth, saveCOA);
router.delete('/remove/:coaToken', requireAuth, removeCOA);
router.patch('/notes/:coaToken', requireAuth, updateNotes);

// Optional auth - returns false if not logged in
router.get('/check/:coaToken', optionalAuth, checkSaved);

export default router;
