import { Router, Request, Response } from 'express';
import { ledgerService } from '../services/ledgerService';
import { AuditorService } from '../services/AuditorService';
import { requireAuth, requireSuperAdmin } from '../middleware/authMiddleware';

const router = Router();

/**
 * GET /api/v1/admin/audit/verify
 * Verifies the integrity of the entire cryptographic ledger.
 */
router.get('/verify', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const result = await ledgerService.verifyChainIntegrity();

        if (result.valid) {
            return res.json({
                success: true,
                message: 'La integridad de la cadena es válida. No se detectaron manipulaciones.',
                timestamp: new Date().toISOString()
            });
        } else {
            return res.status(418).json({ // I'm a teapot/Alert
                success: false,
                message: '¡ALERTA DE SEGURIDAD! Se ha detectado una ruptura en la cadena de integridad.',
                errors: result.errors,
                timestamp: new Date().toISOString()
            });
        }
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/admin/audit/logs
 * Retrieves the raw ledger for investigation.
 */
router.get('/logs', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const { data, error } = await (ledgerService as any).supabase
            .from('integrity_ledger')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        res.json({ success: true, count: data.length, logs: data });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * GET /api/v1/admin/audit/robot/stats
 * Retrieves the operational statistics of the Auditor Robot.
 */
router.get('/robot/stats', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const stats = AuditorService.getInstance().getStats();
        res.json({ success: true, stats });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
