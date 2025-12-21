import { Router } from 'express';
import { generateSitemap } from '../controllers/sitemapController';

const router = Router();

// GET /api/v1/sitemap.xml
router.get('/sitemap.xml', generateSitemap);

export default router;
