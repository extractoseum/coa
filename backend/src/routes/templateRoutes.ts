import { Router } from 'express';
import multer from 'multer';
import {
    getAllTemplates,
    getActiveTemplate,
    getTemplateById,
    createTemplate,
    updateTemplate,
    setActiveTemplate,
    deleteTemplate,
    removeTemplateLogo,
    removeTemplateWatermark
} from '../controllers/templateController';

const router = Router();
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB max for images
});

// GET /api/v1/templates - Get all templates
router.get('/', getAllTemplates);

// GET /api/v1/templates/active - Get active template
router.get('/active', getActiveTemplate);

// GET /api/v1/templates/:id - Get template by ID
router.get('/:id', getTemplateById);

// POST /api/v1/templates - Create new template
router.post('/', upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'watermark', maxCount: 1 }
]), createTemplate);

// PUT /api/v1/templates/:id - Update template
router.put('/:id', upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'watermark', maxCount: 1 }
]), updateTemplate);

// POST /api/v1/templates/:id/activate - Set template as active
router.post('/:id/activate', setActiveTemplate);

// DELETE /api/v1/templates/:id - Delete template
router.delete('/:id', deleteTemplate);

// DELETE /api/v1/templates/:id/logo - Remove logo from template
router.delete('/:id/logo', removeTemplateLogo);

// DELETE /api/v1/templates/:id/watermark - Remove watermark from template
router.delete('/:id/watermark', removeTemplateWatermark);

export default router;
