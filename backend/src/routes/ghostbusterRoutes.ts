import { Router, Request, Response } from 'express';
import { requireAuth, requireSuperAdmin } from '../middleware/authMiddleware';
import { getGhostAlerts, triggerScan, bustGhost } from '../controllers/ghostbusterController';
import { supabase } from '../config/supabase';

const router = Router();

// Protected routes
router.use(requireAuth);

router.get('/alerts', getGhostAlerts);
router.post('/scan', triggerScan);
router.post('/bust', bustGhost);

// Reset all alerts (for fixing bad data)
router.post('/reset', requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
        // Delete all pending alerts to allow fresh scan
        const { error } = await supabase
            .from('ghost_alerts')
            .delete()
            .eq('reactivation_status', 'pending');

        if (error) throw error;

        res.json({ success: true, message: 'Pending alerts cleared. Run scan to regenerate.' });
    } catch (error: any) {
        console.error('[Ghostbuster] Error resetting alerts:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
