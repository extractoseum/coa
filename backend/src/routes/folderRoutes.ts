import { Router } from 'express';
import {
    getMyFolders,
    createFolder,
    updateFolder,
    deleteFolder,
    addCOAToFolder,
    removeCOAFromFolder,
    getFolderByToken,
    reorderFolderCOAs,
    getFolderContents,
    getShopifyCustomerFolders
} from '../controllers/folderController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// Public routes
router.get('/public/:token', getFolderByToken);
router.get('/shopify/customer/:email', getShopifyCustomerFolders);

// Protected routes - require authentication
router.get('/my-folders', requireAuth, getMyFolders);
router.post('/', requireAuth, createFolder);
router.put('/:id', requireAuth, updateFolder);
router.delete('/:id', requireAuth, deleteFolder);

// COA management in folders
router.get('/:id/contents', requireAuth, getFolderContents);
router.post('/:id/coas', requireAuth, addCOAToFolder);
router.delete('/:id/coas/:coaId', requireAuth, removeCOAFromFolder);
router.put('/:id/reorder', requireAuth, reorderFolderCOAs);

export default router;
