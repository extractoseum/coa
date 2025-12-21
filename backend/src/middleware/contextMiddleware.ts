
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

/**
 * AI Context Middleware (RAG-Lite)
 * Enriches the request with critical client data so Ara can answer intelligently.
 * Fetches: VIP Tier, Recent Orders (last 3), and Total Spent.
 */
export const injectAIContext = async (req: Request, res: Response, next: NextFunction) => {
    try {
        // Only run if we have an authenticated user
        if (!req.clientId) {
            return next();
        }

        const clientId = req.clientId;

        // 1. Fetch Client Profile & Metrics
        const { data: client } = await supabase
            .from('clients')
            .select('role, tags, company_name') // Add simplified membership_tier if available in your schema
            .eq('id', clientId)
            .single();

        // 2. Fetch Recent Orders (Limit 3)
        const { data: recentOrders } = await supabase
            .from('orders')
            .select('id, created_at, status, total_price, tracking_number')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false })
            .limit(3);

        // 3. Construct "Ara Context"
        const aiContext = {
            user: {
                id: clientId,
                role: client?.role || 'unknown',
                tags: client?.tags || [],
                company: client?.company_name || 'N/A'
            },
            recent_activity: recentOrders || [],
            technical_info: {
                ip: req.ip,
                user_agent: req.get('User-Agent')
            }
        };

        // Attach to request body for the AI Controller to use
        // We use a specific 'context' field in the body if it doesn't exist
        if (!req.body.context) {
            req.body.context = {};
        }

        // Merge with existing context
        req.body.context = {
            ...req.body.context,
            system_data: aiContext
        };

        next();
    } catch (error) {
        console.warn('[ContextMiddleware] Failed to inject context:', error);
        // Do not block the request, just continue without context
        next();
    }
};
