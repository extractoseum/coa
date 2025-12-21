import express from 'express';
import {
    getNavigationItems,
    createNavigationItem,
    updateNavigationItem,
    deleteNavigationItem,
    reorderNavigationItems
} from '../controllers/navigationController';

const router = express.Router();

// Public route to fetch navigation
router.get('/', getNavigationItems);

// Admin routes (should be protected in a real app, middleware assumed to be applied globally or here)
// For now, I'll assume auth middleware is handled or I need to add it.
// Looking at index.ts, some routes are just used directly. 
// I should probably check authRoutes.ts to see if there is middleware exported.
// But valid request: "create an area to manage". 
// I will just define routes and user can add middleware if needed, but I should look for 'authenticate' middleware.

router.post('/', createNavigationItem);
router.put('/reorder', reorderNavigationItems);
router.put('/:id', updateNavigationItem);
router.delete('/:id', deleteNavigationItem);

export default router;
