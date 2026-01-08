/**
 * Ghostbuster Service 👻
 * 
 * "Who you gonna call?"
 * 
 * Detects inactive customers ("Ghosts") and triggers automated re-engagement
 * based on their "Ghost Level":
 * - Warm Ghost (14-30 days): Casual check-in
 * - Cold Ghost (31-60 days): Product hook
 * - Frozen Ghost (61-90 days): Discount offer
 */

import { supabase } from '../config/supabase';
import { sendBulkWhatsApp, isWhapiConfigured } from './whapiService';

// ============================================================================
// CONFIGURATION
// ============================================================================

const GHOST_CONFIG = {
    WARM_MIN: 14,
    WARM_MAX: 30,
    COLD_MIN: 31,
    COLD_MAX: 60,
    FROZEN_MIN: 61,
    FROZEN_MAX: 90,
    CHURNED_MIN: 91,

    // Safety
    MAX_FRICTION_SCORE: 50,
    FORBIDDEN_VIBES: ['frustrated', 'angry', 'hostile']
};

interface GhostStatus {
    clientId: string;
    clientName: string;
    phone: string;
    daysInactive: number;
    lastActivityType: 'order' | 'message' | 'browse' | 'scan' | 'unknown';
    lastActivityAt: Date;
    ghostLevel: 'warm_ghost' | 'cold_ghost' | 'frozen_ghost' | 'churned' | 'active';
    currentVibe: string | null;
    currentFriction: number;
}

// ============================================================================
// CORE LOGIC
// ============================================================================

/**
 * Run the Ghostbuster protocol
 * Called by Cron Job daily
 */
export const processGhostbusting = async (): Promise<{ processed: number; ghosts_found: number; alerts_created: number }> => {
    console.log('[Ghostbuster] 👻 Starting protocol...');

    let processed = 0;
    let ghostsFound = 0;
    let alertsCreated = 0;

    try {
        // 1. Get all clients with basic info
        const { data: clients, error } = await supabase
            .from('clients')
            .select(`
                id, 
                name, 
                phone, 
                tags
            `)
            .not('phone', 'is', null);

        if (error || !clients) {
            console.error('[Ghostbuster] Error fetching clients:', error);
            return { processed, ghosts_found: 0, alerts_created: 0 };
        }

        // Fetch indicators separately
        const clientIds = clients.map(c => c.id);
        const { data: indicatorsData } = await supabase
            .from('conversation_indicators')
            .select('client_id, emotional_vibe, friction_score')
            .in('client_id', clientIds);

        const indicatorMap = new Map();
        if (indicatorsData) {
            indicatorsData.forEach((i: any) => indicatorMap.set(i.client_id, i));
        }

        // Fetch orders separately
        const { data: ordersData } = await supabase
            .from('orders')
            .select('client_id, shopify_created_at, created_at')
            .in('client_id', clientIds)
            .order('shopify_created_at', { ascending: false });

        const orderMap = new Map();
        if (ordersData) {
            ordersData.forEach((o: any) => {
                if (!orderMap.has(o.client_id)) orderMap.set(o.client_id, o);
                // Since desc sort, first match is latest
            });
        }

        // Fetch conversations separately
        const { data: conversationsData } = await supabase
            .from('conversations')
            .select('id, client_id, last_inbound_at')
            .in('client_id', clientIds)
            .order('last_inbound_at', { ascending: false });

        const conversationMap = new Map();
        if (conversationsData) {
            conversationsData.forEach((c: any) => {
                if (!conversationMap.has(c.client_id)) conversationMap.set(c.client_id, []);
                conversationMap.get(c.client_id).push(c);
            });
        }

        console.log(`[Ghostbuster] Scanning ${clients.length} clients...`);

        // 2. Analyze each client
        for (const client of clients) {
            processed++;

            // Get latest interaction from various sources
            // (In a real scenario, we'd also join browsing_events and coa_scans, 
            // but for simplicity we'll check message/order first, or assume we fetch them if needed)

            // Note: For now, using what we have in `client` object + `conversations`
            // Ideally we'd do a more complex query for scans/browsing, 
            // but let's stick to the prompt's main data points.

            const lastOrderObj = orderMap.get(client.id);
            const lastOrderDateStr = lastOrderObj?.shopify_created_at || lastOrderObj?.created_at;
            const lastOrder = lastOrderDateStr ? new Date(lastOrderDateStr) : null;

            // Find latest conversation inbound
            let lastMessage: Date | null = null;
            // @ts-ignore
            const clientConvs = conversationMap.get(client.id) || [];

            if (clientConvs.length > 0) {
                const latest = clientConvs[0]; // Already ordered by DB or we can sort again
                if (latest.last_inbound_at) {
                    lastMessage = new Date(latest.last_inbound_at);
                }
            }

            // Determine max activity
            let lastActivityAt = new Date(0); // Epoch
            let activityType: GhostStatus['lastActivityType'] = 'unknown';

            if (lastOrder && lastOrder > lastActivityAt) {
                lastActivityAt = lastOrder;
                activityType = 'order';
            }
            if (lastMessage && lastMessage > lastActivityAt) {
                lastActivityAt = lastMessage;
                activityType = 'message';
            }

            // TODO: Add browsing_events and coa_scans checks here when avail

            // Calculate Inactivity
            const now = new Date();
            const diffTime = Math.abs(now.getTime() - lastActivityAt.getTime());
            const daysInactive = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Determine Level
            let level: GhostStatus['ghostLevel'] = 'active';
            if (daysInactive >= GHOST_CONFIG.CHURNED_MIN) level = 'churned';
            else if (daysInactive >= GHOST_CONFIG.FROZEN_MIN) level = 'frozen_ghost';
            else if (daysInactive >= GHOST_CONFIG.COLD_MIN) level = 'cold_ghost';
            else if (daysInactive >= GHOST_CONFIG.WARM_MIN) level = 'warm_ghost';

            if (level === 'active') continue; // Not a ghost

            ghostsFound++;

            // Safety Check: Vibe & Friction
            const indicators = indicatorMap.get(client.id);
            const vibe = indicators?.emotional_vibe || 'neutral';
            const friction = indicators?.friction_score || 0;

            if (GHOST_CONFIG.FORBIDDEN_VIBES.includes(vibe) || friction > GHOST_CONFIG.MAX_FRICTION_SCORE) {
                console.log(`[Ghostbuster] Skipping client ${client.id} due to negative vibe/friction (${vibe}/${friction})`);
                continue;
            }

            // Create Alert if not already pending for this level
            // We want to avoid spamming. Only create if we haven't already created one for THIS level recently.

            const { data: existing } = await supabase
                .from('ghost_alerts')
                .select('id')
                .eq('client_id', client.id)
                .eq('ghost_level', level)
                .in('reactivation_status', ['pending', 'contacted'])
                .single();

            if (!existing) {
                await supabase.from('ghost_alerts').insert({
                    client_id: client.id,
                    ghost_level: level,
                    days_inactive: daysInactive,
                    last_activity_type: activityType,
                    last_activity_at: lastActivityAt.toISOString(),
                    vibe_at_creation: vibe,
                    friction_at_creation: friction,
                    reactivation_status: 'pending' // Ready for "Busting" (manual or auto)
                });
                alertsCreated++;
                console.log(`[Ghostbuster] 👻 Ghost Detected: ${client.name} (${daysInactive} days - ${level})`);
            }
        }

        console.log(`[Ghostbuster] Complete. Processed: ${processed}, Ghosts: ${ghostsFound}, Alerts: ${alertsCreated}`);
        return { processed, ghosts_found: ghostsFound, alerts_created: alertsCreated };

    } catch (error) {
        console.error('[Ghostbuster] Critical error:', error);
        return { processed, ghosts_found: 0, alerts_created: 0 };
    }
};

/**
 * "Bust" a ghost (Send reactivation message)
 */
export const bustGhost = async (alertId: string): Promise<boolean> => {
    try {
        // 1. Fetch Alert
        const { data: alert, error } = await supabase
            .from('ghost_alerts')
            .select(`
                *,
                clients (name, phone)
            `)
            .eq('id', alertId)
            .single();

        if (error || !alert) throw new Error('Alert not found');
        if (alert.reactivation_status !== 'pending') return false;

        const clientName = alert.clients?.name || 'Cliente';
        const clientPhone = alert.clients?.phone;

        // 2. Generate Message based on Level
        let message = '';
        const level = alert.ghost_level as GhostStatus['ghostLevel'];

        if (level === 'warm_ghost') {
            message = `Hola ${clientName}! Solo pasando a saludar. 🌿 ¿Cómo te ha ido con tus últimos productos? Si necesitas algo, aquí estamos.`;
        } else if (level === 'cold_ghost') {
            // In a real version, we'd look up their top product
            message = `${clientName}, hace tiempo que no sabemos de ti. 👀 Tenemos inventario fresco que podría interesarte. ¿Te mando el catálogo actualizado?`;
        } else if (level === 'frozen_ghost') {
            // Discount hook
            const code = `VOLVEMOS${clientName.substring(0, 3).toUpperCase()}`;
            message = `Te extrañamos ${clientName}! 💚 Como cliente VIP, te activamos un 15% OFF para tu regreso. Tu código es: ${code} (Válido 7 días). ¿Lo usas hoy?`;
        }

        if (!message || !clientPhone) return false;

        // 3. Send
        if (isWhapiConfigured()) {
            const result = await sendBulkWhatsApp(
                [clientPhone],
                message,
                `ghostbuster_${alert.id}`
            );

            if (result.sent > 0) {
                await supabase.from('ghost_alerts').update({
                    reactivation_status: 'contacted',
                    reactivation_channel: 'whatsapp',
                    reactivation_message: message,
                    reactivation_sent_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }).eq('id', alertId);
                return true;
            }
        }

        return false;

    } catch (error) {
        console.error('[Ghostbuster] Error busting ghost:', error);
        return false;
    }
};
