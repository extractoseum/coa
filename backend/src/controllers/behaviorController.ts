import { Request, Response } from 'express';
// @ts-ignore
import { requireAuth, requireSuperAdmin } from '../middleware/authMiddleware'; // We can't import middleware here to wrap, we usually wrap in routes.
// But we can check req.userRole if the middleware WAS used.
import { supabase } from '../config/supabase';

export const trackBehaviorEvent = async (req: Request, res: Response) => {
    try {
        const {
            event_type,
            handle,
            metadata = {},
            session_id,
            url
        } = req.body;

        if (!event_type) {
            return res.status(400).json({ success: false, error: 'event_type is required' });
        }

        console.log(`[Behavior] Tracking event: ${event_type} for ${handle || 'anonymous'}`);

        let clientId = null;

        // 1. Resolve client if handle (email/phone) is provided
        if (handle) {
            const isEmail = handle.includes('@');
            let query = supabase.from('clients').select('id');

            if (isEmail) {
                query = query.ilike('email', handle);
            } else {
                query = query.ilike('phone', `%${handle.slice(-10)}`);
            }

            const { data: client } = await query.maybeSingle();
            if (client) {
                clientId = client.id;
            }
        }

        // 2. Insert event
        const { error } = await supabase
            .from('browsing_events')
            .insert({
                client_id: clientId,
                event_type,
                handle: handle || null,
                metadata,
                session_id: session_id || null,
                url: url || null,
                created_at: new Date().toISOString()
            });

        if (error) {
            console.error('[Behavior] Database error:', error.message);
            return res.status(500).json({ success: false, error: 'Database insertion failed' });
        }

        console.log(`[Behavior] Event tracked successfully for ${handle || 'anonymous'}`);
        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('[Behavior] Controller error:', error.message);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

/**
 * Get recent activity for a specific client
 */
export const getClientActivity = async (req: Request, res: Response) => {
    try {
        const { handle } = req.params;

        // Security Check: Must be admin or the user themselves
        // Note: This relies on requireAuth middleware being upstream
        const requesterId = (req as any).clientId;
        const requesterRole = (req as any).userRole;

        if (!requesterId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        // Find client first to get UUID
        const { data: client } = await supabase
            .from('clients')
            .select('id')
            .or(`email.eq.${handle},phone.eq.${handle}`)
            .maybeSingle();

        let query = supabase
            .from('browsing_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        if (client) {
            // Check ownership
            if (requesterRole !== 'super_admin' && client.id !== requesterId) {
                return res.status(403).json({ success: false, error: 'Forbidden' });
            }
            query = query.or(`client_id.eq.${client.id},handle.ilike.${handle}`);
        } else {
            // If searching by handle string and no client found, only admin can search arbitrary handles?
            if (requesterRole !== 'super_admin' && handle.toLowerCase() !== (req as any).userEmail?.toLowerCase()) {
                return res.status(403).json({ success: false, error: 'Forbidden' });
            }
            query = query.ilike('handle', handle);
        }

        const { data, error } = await query;

        if (error) throw error;

        res.json({ success: true, events: data || [] });
    } catch (error: any) {
        console.error('[Behavior] Get activity error:', error.message);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
