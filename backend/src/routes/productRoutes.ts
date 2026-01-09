import { Router } from 'express';
import { searchProducts } from '../controllers/productController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// Search products
router.get('/search', requireAuth, searchProducts);

export default router;
