import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { processGhostbusting, bustGhost as bustGhostService } from '../services/ghostbusterService';

// Get Alerts
export const getGhostAlerts = async (req: Request, res: Response) => {
    try {
        const { status } = req.query;
        let query = supabase
            .from('ghost_alerts')
            .select(`
                *,
                clients (id, name, phone, tags)
            `)
            .order('days_inactive', { ascending: false });

        if (status) {
            query = query.eq('reactivation_status', status);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json({ success: true, alerts: data });
    } catch (error: any) {
        console.error('Error fetching ghost alerts:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Manual Trigger
export const triggerScan = async (req: Request, res: Response) => {
    try {
        const result = await processGhostbusting();
        res.json({ success: true, result });
    } catch (error: any) {
        console.error('Error triggering scan:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Bust Ghost Action
export const bustGhost = async (req: Request, res: Response) => {
    try {
        const { alertId } = req.body;
        if (!alertId) return res.status(400).json({ success: false, error: 'Missing alertId' });

        const success = await bustGhostService(alertId);
        if (success) {
            res.json({ success: true, message: 'Ghost busted successfully' });
        } else {
            res.status(400).json({ success: false, error: 'Failed to bust ghost (check status or credits)' });
        }
    } catch (error: any) {
        console.error('Error busting ghost:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
