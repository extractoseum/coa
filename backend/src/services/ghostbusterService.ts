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
import { sendAraEmail, getAraEmailStatus } from './emailService';

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
        // 1. Get all clients with basic info (including created_at for fallback)
        const { data: clients, error } = await supabase
            .from('clients')
            .select(`
                id,
                name,
                phone,
                tags,
                created_at
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

            // Determine max activity - use client created_at as fallback instead of epoch
            const clientCreatedAt = client.created_at ? new Date(client.created_at) : null;
            let lastActivityAt: Date | null = null;
            let activityType: GhostStatus['lastActivityType'] = 'unknown';

            if (lastOrder) {
                lastActivityAt = lastOrder;
                activityType = 'order';
            }
            if (lastMessage && (!lastActivityAt || lastMessage > lastActivityAt)) {
                lastActivityAt = lastMessage;
                activityType = 'message';
            }

            // If no activity found, use client creation date as baseline
            if (!lastActivityAt) {
                if (clientCreatedAt) {
                    lastActivityAt = clientCreatedAt;
                    activityType = 'unknown';
                } else {
                    // Skip clients with no activity and no creation date
                    continue;
                }
            }

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
 * Channel options for busting ghosts
 */
export type BustChannel = 'whatsapp' | 'email' | 'both';

/**
 * Generate reactivation message based on ghost level
 */
const generateReactivationMessage = (clientName: string, level: GhostStatus['ghostLevel']): { text: string; subject: string; html: string } => {
    let text = '';
    let subject = '';
    let html = '';

    if (level === 'warm_ghost') {
        subject = `¡Hola ${clientName}! Te extrañamos 🌿`;
        text = `Hola ${clientName}! Solo pasando a saludar. 🌿 ¿Cómo te ha ido con tus últimos productos? Si necesitas algo, aquí estamos.`;
        html = `
            <p>Hola <strong>${clientName}</strong>!</p>
            <p>Solo pasando a saludar. 🌿 ¿Cómo te ha ido con tus últimos productos?</p>
            <p>Si necesitas algo, aquí estamos para ayudarte.</p>
            <br>
            <p><a href="https://extractoseum.com" style="background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Ver Catálogo</a></p>
        `;
    } else if (level === 'cold_ghost') {
        subject = `${clientName}, tenemos novedades para ti 👀`;
        text = `${clientName}, hace tiempo que no sabemos de ti. 👀 Tenemos inventario fresco que podría interesarte. ¿Te mando el catálogo actualizado?`;
        html = `
            <p><strong>${clientName}</strong>, hace tiempo que no sabemos de ti. 👀</p>
            <p>Tenemos inventario fresco que podría interesarte.</p>
            <p>¿Te gustaría ver el catálogo actualizado?</p>
            <br>
            <p><a href="https://extractoseum.com" style="background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Ver Novedades</a></p>
        `;
    } else if (level === 'frozen_ghost') {
        const code = `VOLVEMOS${clientName.substring(0, 3).toUpperCase()}`;
        subject = `💚 Te extrañamos ${clientName} - 15% OFF especial`;
        text = `Te extrañamos ${clientName}! 💚 Como cliente VIP, te activamos un 15% OFF para tu regreso. Tu código es: ${code} (Válido 7 días). ¿Lo usas hoy?`;
        html = `
            <p>Te extrañamos <strong>${clientName}</strong>! 💚</p>
            <p>Como cliente VIP, te activamos un descuento especial para tu regreso:</p>
            <div style="background:#10B981;color:#fff;padding:20px;border-radius:8px;text-align:center;margin:20px 0;">
                <p style="margin:0;font-size:24px;font-weight:bold;">15% OFF</p>
                <p style="margin:10px 0 0 0;font-size:18px;">Código: <strong>${code}</strong></p>
                <p style="margin:5px 0 0 0;font-size:12px;">Válido por 7 días</p>
            </div>
            <p><a href="https://extractoseum.com" style="background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Usar mi código ahora</a></p>
        `;
    } else {
        // Churned - last resort
        subject = `${clientName}, queremos reconectarte 💫`;
        text = `Hola ${clientName}, ha pasado mucho tiempo. Nos encantaría saber de ti. ¿Hay algo en lo que podamos ayudarte?`;
        html = `
            <p>Hola <strong>${clientName}</strong>,</p>
            <p>Ha pasado mucho tiempo desde tu última visita. Nos encantaría saber de ti.</p>
            <p>¿Hay algo en lo que podamos ayudarte?</p>
            <br>
            <p><a href="https://extractoseum.com" style="background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Visitar Tienda</a></p>
        `;
    }

    return { text, subject, html };
};

/**
 * "Bust" a ghost (Send reactivation message via WhatsApp, Email, or both)
 */
export const bustGhost = async (alertId: string, channel: BustChannel = 'whatsapp'): Promise<{ success: boolean; channels: string[] }> => {
    const sentChannels: string[] = [];

    try {
        // 1. Fetch Alert with client info including email
        const { data: alert, error } = await supabase
            .from('ghost_alerts')
            .select(`
                *,
                clients (id, name, phone, email)
            `)
            .eq('id', alertId)
            .single();

        if (error || !alert) throw new Error('Alert not found');
        if (alert.reactivation_status !== 'pending') {
            return { success: false, channels: [] };
        }

        const clientName = alert.clients?.name || 'Cliente';
        const clientPhone = alert.clients?.phone;
        const clientEmail = alert.clients?.email;
        const level = alert.ghost_level as GhostStatus['ghostLevel'];

        // 2. Generate Message
        const { text, subject, html } = generateReactivationMessage(clientName, level);

        if (!text) {
            return { success: false, channels: [] };
        }

        // 3. Send via selected channel(s)

        // WhatsApp
        if ((channel === 'whatsapp' || channel === 'both') && clientPhone && isWhapiConfigured()) {
            const result = await sendBulkWhatsApp(
                [clientPhone],
                text,
                `ghostbuster_${alert.id}`
            );
            if (result.sent > 0) {
                sentChannels.push('whatsapp');
            }
        }

        // Email
        if ((channel === 'email' || channel === 'both') && clientEmail) {
            const emailStatus = getAraEmailStatus();
            if (emailStatus.configured) {
                const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: #fff; padding: 30px; text-align: center; }
        .logo { font-size: 24px; font-weight: bold; }
        .content { padding: 30px; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #718096; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">EXTRACTOS EUM</div>
        </div>
        <div class="content">
            ${html}
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} Extractos EUM. Todos los derechos reservados.</p>
            <p>Si no deseas recibir más correos, responde con "CANCELAR"</p>
        </div>
    </div>
</body>
</html>`;

                const result = await sendAraEmail({
                    to: clientEmail,
                    subject: `[EUM] ${subject}`,
                    text: text,
                    html: emailHtml
                });

                if (result.success) {
                    sentChannels.push('email');
                }
            }
        }

        // 4. Update alert status if at least one channel succeeded
        if (sentChannels.length > 0) {
            await supabase.from('ghost_alerts').update({
                reactivation_status: 'contacted',
                reactivation_channel: sentChannels.join(','),
                reactivation_message: text,
                reactivation_sent_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            }).eq('id', alertId);

            console.log(`[Ghostbuster] 👻 Busted ${clientName} via ${sentChannels.join(', ')}`);
            return { success: true, channels: sentChannels };
        }

        // No channel available
        console.warn(`[Ghostbuster] No channel available for ${clientName} (phone: ${!!clientPhone}, email: ${!!clientEmail})`);
        return { success: false, channels: [] };

    } catch (error) {
        console.error('[Ghostbuster] Error busting ghost:', error);
        return { success: false, channels: [] };
    }
};
