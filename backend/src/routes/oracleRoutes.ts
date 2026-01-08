/**
 * Oracle Routes - Smart Option A: Predictive Restocking
 *
 * Admin endpoints for managing Oracle system:
 * - View stats and predictions
 * - Configure consumption profiles
 * - View inventory forecasts and alerts
 * - Manual triggers for cron jobs
 */

import { Router, Request, Response } from 'express';
import { requireAuth, requireSuperAdmin } from '../middleware/authMiddleware';
import { supabase } from '../config/supabase';
import {
    getLowStockAlerts,
    generateRestockPredictions,
    processRestockNotifications,
    aggregateDailySales,
    generateInventoryForecast,
    markPredictionConverted,
    syncProfilesFromProducts
} from '../services/oracleService';

const router = Router();

// ============================================================================
// STATS & DASHBOARD
// ============================================================================

/**
 * Get Oracle system stats
 * GET /api/v1/oracle/stats
 */
router.get('/stats', requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
        // Get total active predictions
        const { count: totalPredictions } = await supabase
            .from('restock_predictions')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);

        // Get predictions due in next 7 days
        const nextWeek = new Date();
        nextWeek.setDate(nextWeek.getDate() + 7);
        const { count: predictionsDueSoon } = await supabase
            .from('restock_predictions')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true)
            .eq('notification_status', 'pending')
            .lte('predicted_restock_date', nextWeek.toISOString().split('T')[0]);

        // Get active consumption profiles count
        const { count: activeProfiles } = await supabase
            .from('product_consumption_profiles')
            .select('*', { count: 'exact', head: true });

        // Get active inventory alerts count
        const { count: inventoryAlerts } = await supabase
            .from('inventory_alerts')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'active');

        res.json({
            success: true,
            total_predictions: totalPredictions || 0,
            predictions_due_soon: predictionsDueSoon || 0,
            active_profiles: activeProfiles || 0,
            inventory_alerts: inventoryAlerts || 0
        });
    } catch (error: any) {
        console.error('[Oracle] Error getting stats:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get low stock alerts
 * GET /api/v1/oracle/alerts/low-stock
 */
router.get('/alerts/low-stock', requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
        const alerts = await getLowStockAlerts();
        res.json({ success: true, alerts });
    } catch (error: any) {
        console.error('[Oracle] Error getting low stock alerts:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get all inventory alerts
 * GET /api/v1/oracle/alerts
 */
router.get('/alerts', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const status = req.query.status as string || 'active';

        const { data: alerts, error } = await supabase
            .from('inventory_alerts')
            .select('*')
            .eq('status', status)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        res.json({ success: true, alerts: alerts || [] });
    } catch (error: any) {
        console.error('[Oracle] Error getting alerts:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// RESTOCK PREDICTIONS
// ============================================================================

/**
 * Get restock predictions
 * GET /api/v1/oracle/predictions
 */
router.get('/predictions', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const status = req.query.status as string;
        const limit = parseInt(req.query.limit as string) || 50;

        // Use view that includes days_until_restock calculation
        let query = supabase
            .from('restock_predictions_with_days')
            .select('*')
            .eq('is_active', true)
            .order('predicted_restock_date', { ascending: true })
            .limit(limit);

        if (status) {
            query = query.eq('notification_status', status);
        }

        const { data: predictions, error } = await query;

        if (error) throw error;

        res.json({ success: true, predictions: predictions || [] });
    } catch (error: any) {
        console.error('[Oracle] Error getting predictions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get predictions due soon (for dashboard)
 * GET /api/v1/oracle/predictions/due-soon
 */
router.get('/predictions/due-soon', requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
        // Use view that includes days_until_restock calculation
        // Get predictions for next 30 days to show in dashboard
        const { data: predictions, error } = await supabase
            .from('restock_predictions_with_days')
            .select('*')
            .eq('is_active', true)
            .gte('days_until_restock', -7) // Include recently past due (up to 7 days ago)
            .order('predicted_restock_date', { ascending: true })
            .limit(50);

        if (error) throw error;

        res.json({ success: true, predictions: predictions || [] });
    } catch (error: any) {
        console.error('[Oracle] Error getting due soon predictions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Mark prediction as converted
 * POST /api/v1/oracle/predictions/:id/convert
 */
router.post('/predictions/:id/convert', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { orderId } = req.body;

        const success = await markPredictionConverted(id, orderId || 'manual');

        if (success) {
            res.json({ success: true, message: 'Prediction marked as converted' });
        } else {
            res.status(404).json({ success: false, error: 'Prediction not found' });
        }
    } catch (error: any) {
        console.error('[Oracle] Error marking prediction converted:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// INVENTORY FORECAST
// ============================================================================

/**
 * Get inventory forecast summary
 * GET /api/v1/oracle/inventory/forecast
 */
router.get('/inventory/forecast', requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
        const { data: forecast, error } = await supabase
            .from('inventory_forecast_summary')
            .select('*');

        if (error) throw error;

        res.json({ success: true, forecast: forecast || [] });
    } catch (error: any) {
        console.error('[Oracle] Error getting inventory forecast:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get sales history for a product
 * GET /api/v1/oracle/inventory/sales/:productId
 */
router.get('/inventory/sales/:productId', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const { productId } = req.params;
        const days = parseInt(req.query.days as string) || 30;

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const { data: sales, error } = await supabase
            .from('product_sales_history')
            .select('*')
            .eq('shopify_product_id', productId)
            .gte('sale_date', startDate.toISOString().split('T')[0])
            .order('sale_date', { ascending: true });

        if (error) throw error;

        res.json({ success: true, sales: sales || [] });
    } catch (error: any) {
        console.error('[Oracle] Error getting sales history:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// CONSUMPTION PROFILES
// ============================================================================

/**
 * Get all consumption profiles
 * GET /api/v1/oracle/profiles
 */
router.get('/profiles', requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
        const { data: profiles, error } = await supabase
            .from('product_consumption_profiles')
            .select('*')
            .order('product_title', { ascending: true });

        if (error) throw error;

        res.json({ success: true, profiles: profiles || [] });
    } catch (error: any) {
        console.error('[Oracle] Error getting profiles:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Create or update consumption profile
 * POST /api/v1/oracle/profiles
 */
router.post('/profiles', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const {
            shopify_product_id,
            shopify_variant_id,
            product_title,
            variant_title,
            estimated_days_supply,
            category,
            size_ml,
            servings_per_unit,
            notes
        } = req.body;

        if (!product_title || !estimated_days_supply) {
            return res.status(400).json({
                success: false,
                error: 'product_title and estimated_days_supply are required'
            });
        }

        const profileData = {
            shopify_product_id,
            shopify_variant_id,
            product_title,
            variant_title,
            estimated_days_supply,
            category,
            size_ml,
            servings_per_unit,
            notes,
            updated_at: new Date().toISOString()
        };

        const { data: profile, error } = await supabase
            .from('product_consumption_profiles')
            .upsert(profileData, {
                onConflict: 'shopify_product_id,shopify_variant_id'
            })
            .select()
            .single();

        if (error) throw error;

        res.json({ success: true, profile });
    } catch (error: any) {
        console.error('[Oracle] Error saving profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Delete consumption profile
 * DELETE /api/v1/oracle/profiles/:id
 */
router.delete('/profiles/:id', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('product_consumption_profiles')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: 'Profile deleted' });
    } catch (error: any) {
        console.error('[Oracle] Error deleting profile:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============================================================================
// MANUAL TRIGGERS (for testing/admin)
// ============================================================================

/**
 * Manually trigger restock predictions generation
 * POST /api/v1/oracle/trigger/predictions
 */
router.post('/trigger/predictions', requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
        console.log('[Oracle] Manual trigger: generating predictions...');
        const result = await generateRestockPredictions();
        res.json({ success: true, ...result });
    } catch (error: any) {
        console.error('[Oracle] Error triggering predictions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Manually trigger notification processing
 * POST /api/v1/oracle/trigger/notifications
 */
router.post('/trigger/notifications', requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
        console.log('[Oracle] Manual trigger: processing notifications...');
        const result = await processRestockNotifications();
        res.json({ success: true, ...result });
    } catch (error: any) {
        console.error('[Oracle] Error triggering notifications:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Manually trigger sales aggregation
 * POST /api/v1/oracle/trigger/aggregate
 */
router.post('/trigger/aggregate', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const { date } = req.body;
        const targetDate = date ? new Date(date) : new Date();

        console.log(`[Oracle] Manual trigger: aggregating sales for ${targetDate.toISOString().split('T')[0]}...`);
        const count = await aggregateDailySales(targetDate);
        res.json({ success: true, productsProcessed: count });
    } catch (error: any) {
        console.error('[Oracle] Error triggering aggregation:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Manually trigger inventory forecast
 * POST /api/v1/oracle/trigger/forecast
 */
router.post('/trigger/forecast', requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
        console.log('[Oracle] Manual trigger: generating inventory forecast...');
        const result = await generateInventoryForecast();
        res.json({ success: true, ...result });
    } catch (error: any) {
        console.error('[Oracle] Error triggering forecast:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Manually trigger profile sync
 * POST /api/v1/oracle/trigger/sync-profiles
 */
router.post('/trigger/sync-profiles', requireAuth, requireSuperAdmin, async (_req: Request, res: Response) => {
    try {
        console.log('[Oracle] Manual trigger: syncing profiles...');
        const result = await syncProfilesFromProducts();
        res.json({ success: true, ...result });
    } catch (error: any) {
        console.error('[Oracle] Error syncing profiles:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Acknowledge an inventory alert
 * POST /api/v1/oracle/alerts/:id/acknowledge
 */
router.post('/alerts/:id/acknowledge', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const clientId = (req as any).client?.id;

        const { error } = await supabase
            .from('inventory_alerts')
            .update({
                status: 'acknowledged',
                acknowledged_by: clientId,
                acknowledged_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: 'Alert acknowledged' });
    } catch (error: any) {
        console.error('[Oracle] Error acknowledging alert:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Resolve an inventory alert
 * POST /api/v1/oracle/alerts/:id/resolve
 */
router.post('/alerts/:id/resolve', requireAuth, requireSuperAdmin, async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('inventory_alerts')
            .update({
                status: 'resolved',
                resolved_at: new Date().toISOString()
            })
            .eq('id', id);

        if (error) throw error;

        res.json({ success: true, message: 'Alert resolved' });
    } catch (error: any) {
        console.error('[Oracle] Error resolving alert:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

export default router;
