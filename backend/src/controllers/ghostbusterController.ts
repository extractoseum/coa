import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { processGhostbusting, bustGhost as bustGhostService, BustChannel } from '../services/ghostbusterService';
import { syncShopifyMetricsToClients } from '../services/shopifyService';

// Get Alerts (with enhanced client data)
export const getGhostAlerts = async (req: Request, res: Response) => {
    try {
        const { status } = req.query;
        let query = supabase
            .from('ghost_alerts')
            .select(`
                *,
                clients (
                    id,
                    name,
                    phone,
                    tags,
                    shopify_orders_count,
                    shopify_total_spent,
                    shopify_tags,
                    customer_segment
                )
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
        const { alertId, channel = 'whatsapp' } = req.body;
        if (!alertId) return res.status(400).json({ success: false, error: 'Missing alertId' });

        // Validate channel
        const validChannels: BustChannel[] = ['whatsapp', 'email', 'both'];
        if (!validChannels.includes(channel)) {
            return res.status(400).json({ success: false, error: 'Invalid channel. Use: whatsapp, email, or both' });
        }

        const result = await bustGhostService(alertId, channel as BustChannel);
        if (result.success) {
            res.json({
                success: true,
                message: `Ghost busted via ${result.channels.join(', ')}`,
                channels: result.channels
            });
        } else {
            res.status(400).json({ success: false, error: 'Failed to bust ghost (check status, phone/email availability)' });
        }
    } catch (error: any) {
        console.error('Error busting ghost:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Sync Shopify metrics to clients for enhanced ghost detection
export const syncShopifyMetrics = async (_req: Request, res: Response) => {
    try {
        console.log('[Ghostbuster] Starting Shopify metrics sync...');
        const result = await syncShopifyMetricsToClients();
        res.json({
            success: result.success,
            message: result.message,
            updated: result.updated,
            errors: result.errors
        });
    } catch (error: any) {
        console.error('Error syncing Shopify metrics:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};
