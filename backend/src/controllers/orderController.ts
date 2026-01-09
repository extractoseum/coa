import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { updateOrderTracking } from '../services/trackingService';
import { createShopifyDraftOrder } from '../services/shopifyService';
import { logger } from '../utils/Logger';

/**
 * Get orders for the authenticated client
 */
export const getMyOrders = async (req: Request, res: Response) => {
    try {
        const clientId = req.clientId;

        const { data: orders, error } = await supabase
            .from('orders')
            .select(`
                *,
                order_tracking (*)
            `)
            .eq('client_id', clientId)
            .order('shopify_created_at', { ascending: false });

        if (error) throw error;

        res.json({ success: true, orders });
    } catch (error: any) {
        logger.error('[Orders] Error fetching my orders:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Error fetching orders' });
    }
};

/**
 * Get detailed tracking for an order
 */
export const getOrderTrackingDetail = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const { data: tracking, error } = await supabase
            .from('order_tracking')
            .select('*, orders(order_number, status)')
            .eq('order_id', id);

        if (error) throw error;

        res.json({ success: true, tracking: tracking?.[0], all_tracking: tracking });
    } catch (error: any) {
        logger.error('[Tracking] Error fetching tracking detail:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Error fetching tracking info' });
    }
};

/**
 * Force refresh an order's tracking status
 */
export const refreshOrderTracking = async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        // Trigger the update logic
        await updateOrderTracking(id);

        // Fetch the updated tracking
        const { data: tracking, error } = await supabase
            .from('order_tracking')
            .select('*, orders(order_number, status)')
            .eq('order_id', id);

        if (error) throw error;

        res.json({ success: true, tracking: tracking?.[0], all_tracking: tracking });
    } catch (error: any) {
        logger.error('[Tracking] Error refreshing tracking:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Error refreshing tracking' });
    }
};

/**
 * Create a Shopify Draft Order (Admin/Sales Agent Feature)
 */
export const createDraftOrder = async (req: Request, res: Response) => {
    try {
        const { items, customerId } = req.body;

        // Basic validation
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, error: 'Items required' });
        }

        const invoiceUrl = await createShopifyDraftOrder(items, customerId);

        if (invoiceUrl) {
            res.json({ success: true, invoiceUrl });
        } else {
            res.status(500).json({ success: false, error: 'Failed to create draft order' });
        }
    } catch (error: any) {
        logger.error('[Orders] Error creating draft:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: error.message });
    }
};
