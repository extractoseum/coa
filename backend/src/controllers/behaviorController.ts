import { Request, Response } from 'express';
// @ts-ignore
import { requireAuth, requireSuperAdmin } from '../middleware/authMiddleware'; // We can't import middleware here to wrap, we usually wrap in routes.
// But we can check req.userRole if the middleware WAS used.
import { supabase } from '../config/supabase';
import { cleanupPhone } from '../utils/phoneUtils';

export const trackBehaviorEvent = async (req: Request, res: Response) => {
    try {
        const {
            event_type,
            handle,
            metadata = {},
            session_id,
            url,
            fingerprint // New: browser fingerprint for anonymous tracking
        } = req.body;

        if (!event_type) {
            return res.status(400).json({ success: false, error: 'event_type is required' });
        }

        // Capture IP for identity resolution
        const clientIp = req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || null;
        const userAgent = req.headers['user-agent'] || null;

        console.log(`[Behavior] Tracking event: ${event_type} for ${handle || 'anonymous'} (session: ${session_id || 'none'})`);

        let clientId = null;
        let resolvedHandle = handle;

        // 1. Resolve client if handle (email/phone) is provided
        if (handle) {
            const isEmail = handle.includes('@');
            let query = supabase.from('clients').select('id');

            if (isEmail) {
                query = query.ilike('email', handle);
            } else {
                query = query.ilike('phone', `%${cleanupPhone(handle)}`);
            }

            const { data: client } = await query.maybeSingle();
            if (client) {
                clientId = client.id;
            }
        }

        // 2. If no handle but we have session_id, try to find a previous identity for this session
        if (!resolvedHandle && session_id) {
            const { data: prevEvent } = await supabase
                .from('browsing_events')
                .select('handle, client_id')
                .eq('session_id', session_id)
                .not('handle', 'is', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (prevEvent?.handle) {
                resolvedHandle = prevEvent.handle;
                clientId = prevEvent.client_id;
                console.log(`[Behavior] Resolved identity from session: ${resolvedHandle}`);
            }
        }

        // 3. If still no handle but we have fingerprint, try to find identity
        if (!resolvedHandle && fingerprint) {
            const { data: prevEvent } = await supabase
                .from('browsing_events')
                .select('handle, client_id')
                .eq('metadata->>fingerprint', fingerprint)
                .not('handle', 'is', null)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (prevEvent?.handle) {
                resolvedHandle = prevEvent.handle;
                clientId = prevEvent.client_id;
                console.log(`[Behavior] Resolved identity from fingerprint: ${resolvedHandle}`);
            }
        }

        // 4. Map event_type if not in DB allowed list to prevent constraint violation
        const allowedTypes = ['view_product', 'search_view', 'collection_view', 'add_to_cart'];
        let finalEventType = event_type;
        let finalMetadata = {
            ...metadata,
            fingerprint: fingerprint || undefined,
            ip: clientIp || undefined,
            user_agent: userAgent || undefined
        };

        if (!allowedTypes.includes(event_type)) {
            console.log(`[Behavior] Event type "${event_type}" not allowed by DB constraint. Mapping to "view_product" with metadata.`);
            finalEventType = 'view_product';
            finalMetadata.original_event_type = event_type;
        }

        // 5. Insert event with resolved identity
        const { error } = await supabase
            .from('browsing_events')
            .insert({
                client_id: clientId,
                event_type: finalEventType,
                handle: resolvedHandle || null,
                metadata: finalMetadata,
                session_id: session_id || null,
                url: url || null,
                created_at: new Date().toISOString()
            });

        if (error) {
            console.error('[Behavior] Database error:', error.message);
            return res.status(500).json({ success: false, error: 'Database insertion failed' });
        }

        console.log(`[Behavior] Event tracked successfully for ${resolvedHandle || 'anonymous'}`);
        res.status(200).json({ success: true });
    } catch (error: any) {
        console.error('[Behavior] Controller error:', error.message);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

/**
 * Get recent activity for a specific client
 * Enhanced with identity graph: searches by client_id, email, phone, and linked sessions
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
        const last10 = cleanupPhone(handle);
        let clientLookup = supabase.from('clients').select('id, email, phone');

        const filters = [];
        if (isEmail) {
            filters.push(`email.ilike.${handle}`);
        } else if (last10.length >= 10) {
            filters.push(`phone.ilike.%${last10}`);
        } else {
            filters.push(`email.eq.${handle}`);
        }

        if (queryEmail) {
            filters.push(`email.ilike.${queryEmail}`);
        }

        if (filters.length > 0) {
            clientLookup = clientLookup.or(filters.join(','));
        }

        const { data: client } = await clientLookup.maybeSingle();

        // Check authorization
        const allowedRoles = ['super_admin', 'admin', 'staff'];
        if (!allowedRoles.includes(requesterRole)) {
            if (client && client.id !== requesterId) {
                return res.status(403).json({ success: false, error: 'Forbidden' });
            }
            if (!client && handle.toLowerCase() !== (req as any).userEmail?.toLowerCase()) {
                return res.status(403).json({ success: false, error: 'Forbidden' });
            }
        }

        // Build comprehensive identity search
        const orConditions: string[] = [];

        // 1. By client_id if we found the client
        if (client?.id) {
            orConditions.push(`client_id.eq.${client.id}`);
        }

        // 2. By email (direct match and partial for linked accounts)
        if (queryEmail) {
            orConditions.push(`handle.ilike.${queryEmail}`);
        }
        if (client?.email && !client.email.includes('@noemail.eum')) {
            orConditions.push(`handle.ilike.${client.email}`);
        }
        if (isEmail) {
            orConditions.push(`handle.ilike.${handle}`);
        }

        // 3. By phone pattern in handle
        if (last10.length >= 10) {
            orConditions.push(`handle.ilike.%${last10}%`);
        }

        // Build and execute query
        if (orConditions.length === 0) {
            return res.json({ success: true, events: [] });
        }

        const { data, error } = await supabase
            .from('browsing_events')
            .select('*')
            .or(orConditions.join(','))
            .order('created_at', { ascending: false })
            .limit(30);

        if (error) throw error;

        console.log(`[Behavior] Found ${data?.length || 0} events for handle: ${handle} (client: ${client?.id || 'not found'})`);
        res.json({ success: true, events: data || [] });
    } catch (error: any) {
        console.error('[Behavior] Get activity error:', error.message);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
