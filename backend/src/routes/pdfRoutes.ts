import { Router } from 'express';
import { generateCOAPDF } from '../controllers/pdfController';

const router = Router();

// Generate and download PDF for a COA
router.get('/:token/pdf', generateCOAPDF);

export default router;
