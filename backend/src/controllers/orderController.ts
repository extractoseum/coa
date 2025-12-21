import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { updateOrderTracking } from '../services/trackingService';

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
        console.error('[Orders] Error fetching my orders:', error);
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
        console.error('[Tracking] Error fetching tracking detail:', error);
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
        console.error('[Tracking] Error refreshing tracking:', error);
        res.status(500).json({ success: false, error: 'Error refreshing tracking' });
    }
};
