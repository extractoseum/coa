import { Router } from 'express';
import { generateCVVCode, verifyCVV, revokeCVV } from '../controllers/cvvController';
import { getCVVCodes } from '../controllers/cvvListController';
import { generateUnassignedCVVs, getUnassignedCVVs, assignCVVsToCOA } from '../controllers/cvvInventoryController';

const router = Router();

// Generate CVV for a COA (bulk)
router.post('/coas/:token/generate-cvv', generateCVVCode);

// List all CVVs for a COA
router.get('/coas/:token/cvv-codes', getCVVCodes);

// Inventory Management (Hologram System)
router.post('/cvv/generate-unassigned', generateUnassignedCVVs);
router.get('/cvv/unassigned', getUnassignedCVVs);
router.post('/cvv/assign', assignCVVsToCOA);

// Verify CVV (public endpoint)
router.post('/verify/:cvv', verifyCVV);
router.get('/verify/:cvv', verifyCVV); // Also support GET for QR scans

// Revoke CVV (admin only)
router.delete('/verify/:cvv', revokeCVV);

export default router;
