import { Router } from 'express';
import multer from 'multer';
import {
    uploadProductImage,
    uploadWatermark,
    uploadAdditionalDocument,
    deleteAdditionalDocument,
    updatePurchaseLinks,
    updateExtendedMetadata,
    updateBasicInfo,
    uploadCompanyLogo,
    getAvailableWatermarks,
    updateWatermarkConfig,
    updateTemplate
} from '../controllers/coaEnrichmentController';

const router = Router();

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 25 * 1024 * 1024 // 25MB max
    }
});

// Watermarks library endpoint (no token needed)
router.get('/watermarks', getAvailableWatermarks);

// File upload endpoints
router.post('/:token/product-image', upload.single('image'), uploadProductImage);
router.post('/:token/watermark', upload.single('watermark'), uploadWatermark);
router.post('/:token/company-logo', upload.single('logo'), uploadCompanyLogo);
router.post('/:token/documents', upload.single('document'), uploadAdditionalDocument);
router.delete('/:token/documents/:index', deleteAdditionalDocument);

// Data update endpoints
router.patch('/:token/basic-info', updateBasicInfo);
router.patch('/:token/purchase-links', updatePurchaseLinks);
router.patch('/:token/metadata', updateExtendedMetadata);
router.patch('/:token/watermark-config', updateWatermarkConfig);
router.patch('/:token/template', updateTemplate);

export default router;
