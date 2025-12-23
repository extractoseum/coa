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

        // 2. Map event_type if not in DB allowed list to prevent constraint violation
        // Allowed: ('view_product', 'search_view', 'collection_view', 'add_to_cart')
        const allowedTypes = ['view_product', 'search_view', 'collection_view', 'add_to_cart'];
        let finalEventType = event_type;
        let finalMetadata = { ...metadata };

        if (!allowedTypes.includes(event_type)) {
            console.log(`[Behavior] Event type "${event_type}" not allowed by DB constraint. Mapping to "view_product" with metadata.`);
            finalEventType = 'view_product';
            finalMetadata.original_event_type = event_type;
        }

        // 3. Insert event
        const { error } = await supabase
            .from('browsing_events')
            .insert({
                client_id: clientId,
                event_type: finalEventType,
                handle: handle || null,
                metadata: finalMetadata,
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
        const { email: queryEmail } = req.query;

        // Security Check: Must be admin or the user themselves
        // Note: This relies on requireAuth middleware being upstream
        const requesterId = (req as any).clientId;
        const requesterRole = (req as any).userRole;

        if (!requesterId) {
            return res.status(401).json({ success: false, error: 'Unauthorized' });
        }

        // Find client first to get UUID with flexible matching
        const isEmail = handle.includes('@');
        let clientLookup = supabase.from('clients').select('id, email');

        const filters = [];
        if (isEmail) {
            filters.push(`email.ilike.${handle}`);
        } else {
            const last10 = handle.replace(/\D/g, '').slice(-10);
            if (last10.length >= 10) {
                filters.push(`phone.ilike.%${last10}`);
            } else {
                filters.push(`email.eq.${handle}`);
            }
        }

        if (queryEmail) {
            filters.push(`email.eq.${queryEmail}`);
        }

        if (filters.length > 0) {
            clientLookup = clientLookup.or(filters.join(','));
        }

        const { data: client } = await clientLookup.maybeSingle();

        let query = supabase
            .from('browsing_events')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);

        const last10Digits = handle.replace(/\D/g, '').slice(-10);
        let handleMatch = isEmail ? `handle.ilike.${handle}` : `handle.ilike.%${last10Digits || handle}%`;

        // --- IDENTITY BRIDGE: Also search for the email directly in events handle ---
        if (queryEmail) {
            handleMatch += `,handle.eq.${queryEmail}`;
        }

        // --- IDENTITY BRIDGE: If we found a client with an email, search for that too! ---
        if (client?.email && !handleMatch.includes(client.email)) {
            handleMatch += `,handle.eq.${client.email}`;
        }

        if (client) {
            // Check ownership
            const allowedRoles = ['super_admin', 'admin', 'staff'];
            if (!allowedRoles.includes(requesterRole) && client.id !== requesterId) {
                return res.status(403).json({ success: false, error: 'Forbidden' });
            }
            query = query.or(`client_id.eq.${client.id},${handleMatch}`);
        } else {
            // If searching by handle string and no client found
            const allowedRoles = ['super_admin', 'admin', 'staff'];
            if (!allowedRoles.includes(requesterRole) && handle.toLowerCase() !== (req as any).userEmail?.toLowerCase()) {
                return res.status(403).json({ success: false, error: 'Forbidden' });
            }
            query = query.or(`handle.ilike.${handle},${handleMatch}`);
        }

        const { data, error } = await query;
        if (error) throw error;

        console.log(`[Behavior] Found ${data?.length || 0} events for handle: ${handle}`);
        res.json({ success: true, events: data || [] });
    } catch (error: any) {
        console.error('[Behavior] Get activity error:', error.message);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
