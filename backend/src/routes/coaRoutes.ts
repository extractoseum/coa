import { Router } from 'express';
import multer from 'multer';
import { getCOAByToken, saveCOA, getChromatogram, reExtractCOA, updateCOAWithPermissions, updateCOAVisibility, getMyCOAs, assignCOAToClient, getAllCOAs, bulkAssignCOAs, getCOAStats, getCOAsByShopifyCustomer, getCOAPreview, verifyCVVForCOA, getCOAPreviewByQR, verifyCVVForQR } from '../controllers/coaController';
import { requireAuth, requireRole, requireStepUp } from '../middleware/authMiddleware';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

// /api/v1/coas

// Public routes (no auth)
router.get('/embed/shopify/:shopify_customer_id', getCOAsByShopifyCustomer); // Get COAs for Shopify customer (for embed/widget)

// Super admin only - Create/Save COA (upload PDFs)
router.post('/', requireAuth, requireRole('super_admin'), upload.array('pdf'), saveCOA);

// Authenticated routes (MUST come before /:token to avoid route conflicts)
router.get('/my-coas', requireAuth, getMyCOAs); // Get COAs owned by authenticated client

// Admin routes (super_admin only) - MUST come before /:token
router.get('/admin/all', requireAuth, requireRole('super_admin'), getAllCOAs); // Get ALL COAs with filters
router.get('/admin/stats', requireAuth, requireRole('super_admin'), getCOAStats); // Get COA statistics
router.post('/admin/bulk-assign', requireAuth, requireRole('super_admin'), bulkAssignCOAs); // Bulk assign COAs to client

// QR Token Hologram routes (MUST come before /preview/:token to avoid conflicts)
router.get('/preview/qr/:qr_token', getCOAPreviewByQR); // Get preview by QR token (public)
router.post('/preview/qr/:qr_token/verify-cvv', verifyCVVForQR); // Verify paired CVV for QR token

// Preview routes (for QR Global + CVV verification flow)
router.get('/preview/:token', getCOAPreview); // Get limited COA preview (public)
router.post('/preview/:token/verify-cvv', verifyCVVForCOA); // Verify CVV for specific COA

// Token-based routes
router.get('/:token', getCOAByToken); // Get COA by token (public)
router.get('/:token/chromatogram', getChromatogram); // Get chromatogram image
router.put('/:token', requireAuth, updateCOAWithPermissions); // Update COA with permission check
router.post('/:token/re-extract', requireAuth, requireRole('super_admin'), requireStepUp(5), reExtractCOA); // Re-extract (admin only)
router.post('/:token/assign-client', requireAuth, requireRole('super_admin'), requireStepUp(5), assignCOAToClient); // Assign COA to client (admin only)
router.patch('/:token/visibility', requireAuth, requireRole('super_admin'), requireStepUp(5), updateCOAVisibility); // Update visibility (admin only)

// NOTE: Metadata updates also handled by enrichmentRoutes.ts (for backward compatibility)

export default router;
