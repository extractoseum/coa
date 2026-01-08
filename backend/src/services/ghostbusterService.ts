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
 *
 * NEW Enhanced Ghost Types:
 * - VIP at Risk: High-value customer showing inactivity
 * - One-Time Buyer: Single purchase, never returned (45+ days)
 * - Big Spender Lapsed: High total_spent but inactive (60+ days)
 */

import { supabase } from '../config/supabase';
import { sendBulkWhatsApp, isWhapiConfigured } from './whapiService';
import { sendAraEmail, getAraEmailStatus } from './emailService';
import { parseShopifyTags } from './shopifyService';

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

    // Enhanced thresholds
    VIP_MIN_ORDERS: 5,
    VIP_MIN_SPENT: 5000,
    VIP_AT_RISK_DAYS: 45,
    ONE_TIME_BUYER_DAYS: 45,
    BIG_SPENDER_MIN_SPENT: 3000,
    BIG_SPENDER_LAPSED_DAYS: 60,

    // Safety
    MAX_FRICTION_SCORE: 50,
    FORBIDDEN_VIBES: ['frustrated', 'angry', 'hostile']
};

// Extended ghost levels including new types
type ExtendedGhostLevel =
    | 'warm_ghost'
    | 'cold_ghost'
    | 'frozen_ghost'
    | 'churned'
    | 'active'
    | 'vip_at_risk'
    | 'one_time_buyer'
    | 'big_spender_lapsed';

interface GhostStatus {
    clientId: string;
    clientName: string;
    phone: string;
    daysInactive: number;
    lastActivityType: 'order' | 'message' | 'browse' | 'scan' | 'unknown';
    lastActivityAt: Date;
    ghostLevel: ExtendedGhostLevel;
    currentVibe: string | null;
    currentFriction: number;
    // Enhanced data
    ordersCount?: number;
    totalSpent?: number;
    customerSegment?: string;
    shopifyTags?: string[];
}

// ============================================================================
// CORE LOGIC
// ============================================================================

/**
 * Determine enhanced ghost level based on customer metrics
 */
const determineEnhancedGhostLevel = (
    daysInactive: number,
    ordersCount: number,
    totalSpent: number,
    customerSegment: string | null
): ExtendedGhostLevel => {
    // Priority 1: VIP at Risk (high-value customers showing inactivity)
    const isVIP = ordersCount >= GHOST_CONFIG.VIP_MIN_ORDERS || totalSpent >= GHOST_CONFIG.VIP_MIN_SPENT;
    if (isVIP && daysInactive >= GHOST_CONFIG.VIP_AT_RISK_DAYS) {
        return 'vip_at_risk';
    }

    // Priority 2: Big Spender Lapsed (high spend but inactive)
    if (totalSpent >= GHOST_CONFIG.BIG_SPENDER_MIN_SPENT && daysInactive >= GHOST_CONFIG.BIG_SPENDER_LAPSED_DAYS) {
        return 'big_spender_lapsed';
    }

    // Priority 3: One-Time Buyer (single purchase, never returned)
    if (ordersCount === 1 && daysInactive >= GHOST_CONFIG.ONE_TIME_BUYER_DAYS) {
        return 'one_time_buyer';
    }

    // Standard ghost levels
    if (daysInactive >= GHOST_CONFIG.CHURNED_MIN) return 'churned';
    if (daysInactive >= GHOST_CONFIG.FROZEN_MIN) return 'frozen_ghost';
    if (daysInactive >= GHOST_CONFIG.COLD_MIN) return 'cold_ghost';
    if (daysInactive >= GHOST_CONFIG.WARM_MIN) return 'warm_ghost';

    return 'active';
};

/**
 * Run the Ghostbuster protocol
 * Called by Cron Job daily
 */
export const processGhostbusting = async (): Promise<{ processed: number; ghosts_found: number; alerts_created: number }> => {
    console.log('[Ghostbuster] 👻 Starting enhanced protocol...');

    let processed = 0;
    let ghostsFound = 0;
    let alertsCreated = 0;

    try {
        // 1. Get all clients with basic info + Shopify metrics
        const { data: clients, error } = await supabase
            .from('clients')
            .select(`
                id,
                name,
                phone,
                tags,
                created_at,
                shopify_orders_count,
                shopify_total_spent,
                shopify_tags,
                shopify_last_order_date,
                customer_segment
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

        console.log(`[Ghostbuster] Scanning ${clients.length} clients with enhanced metrics...`);

        // 2. Analyze each client
        for (const client of clients) {
            processed++;

            const lastOrderObj = orderMap.get(client.id);
            const lastOrderDateStr = lastOrderObj?.shopify_created_at || lastOrderObj?.created_at;
            const lastOrder = lastOrderDateStr ? new Date(lastOrderDateStr) : null;

            // Find latest conversation inbound
            let lastMessage: Date | null = null;
            const clientConvs = conversationMap.get(client.id) || [];

            if (clientConvs.length > 0) {
                const latest = clientConvs[0];
                if (latest.last_inbound_at) {
                    lastMessage = new Date(latest.last_inbound_at);
                }
            }

            // Use shopify_last_order_date if available and more recent
            let shopifyLastOrder: Date | null = null;
            if (client.shopify_last_order_date) {
                shopifyLastOrder = new Date(client.shopify_last_order_date);
            }

            // Determine max activity - use client created_at as fallback
            const clientCreatedAt = client.created_at ? new Date(client.created_at) : null;
            let lastActivityAt: Date | null = null;
            let activityType: GhostStatus['lastActivityType'] = 'unknown';

            // Check all activity sources
            const activities: { date: Date; type: GhostStatus['lastActivityType'] }[] = [];
            if (lastOrder) activities.push({ date: lastOrder, type: 'order' });
            if (lastMessage) activities.push({ date: lastMessage, type: 'message' });
            if (shopifyLastOrder) activities.push({ date: shopifyLastOrder, type: 'order' });

            if (activities.length > 0) {
                // Sort descending and take most recent
                activities.sort((a, b) => b.date.getTime() - a.date.getTime());
                lastActivityAt = activities[0].date;
                activityType = activities[0].type;
            }

            // If no activity found, use client creation date as baseline
            if (!lastActivityAt) {
                if (clientCreatedAt) {
                    lastActivityAt = clientCreatedAt;
                    activityType = 'unknown';
                } else {
                    continue;
                }
            }

            // Calculate Inactivity
            const now = new Date();
            const diffTime = Math.abs(now.getTime() - lastActivityAt.getTime());
            const daysInactive = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            // Get Shopify metrics (default to 0 if not available)
            const ordersCount = client.shopify_orders_count || 0;
            const totalSpent = parseFloat(client.shopify_total_spent) || 0;
            const customerSegment = client.customer_segment || null;

            // Determine enhanced ghost level
            const level = determineEnhancedGhostLevel(daysInactive, ordersCount, totalSpent, customerSegment);

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
                    reactivation_status: 'pending'
                });
                alertsCreated++;

                // Enhanced logging with customer value
                const valueInfo = totalSpent > 0 ? ` | $${totalSpent.toFixed(0)} spent, ${ordersCount} orders` : '';
                console.log(`[Ghostbuster] 👻 Ghost Detected: ${client.name} (${daysInactive} days - ${level}${valueInfo})`);
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
 * Create or update CRM conversation for Ghostbuster email tracking
 * This ensures replies from customers appear in the CRM
 */
const createGhostbusterCRMConversation = async (
    clientEmail: string,
    clientName: string,
    clientId: string | undefined,
    messageText: string,
    subject: string,
    emailMessageId: string | undefined,
    alertId: string
): Promise<string | null> => {
    try {
        const emailLower = clientEmail.toLowerCase();

        // Check for existing conversation
        let { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('contact_handle', emailLower)
            .eq('channel', 'EMAIL')
            .single();

        let conversationId: string;

        if (existingConv) {
            conversationId = existingConv.id;
        } else {
            // Get the Ghostbuster email chip for routing to Reactivación column
            const { data: emailChip } = await supabase
                .from('channel_chips')
                .select('default_entry_column_id')
                .eq('channel_id', 'email_ara_ghostbuster')
                .single();

            // Create new conversation
            const { data: newConv, error } = await supabase
                .from('conversations')
                .insert({
                    contact_handle: emailLower,
                    contact_name: clientName,
                    channel: 'EMAIL',
                    platform: 'email',
                    traffic_source: 'ghostbuster',
                    column_id: emailChip?.default_entry_column_id || null,
                    client_id: clientId || null,
                    summary: `Reactivación: ${subject}`,
                    facts: {
                        user_email: emailLower,
                        user_name: clientName,
                        ghostbuster_alert_id: alertId,
                        campaign: 'ghostbuster_reactivation'
                    }
                })
                .select('id')
                .single();

            if (error || !newConv) {
                console.error('[Ghostbuster] Failed to create CRM conversation:', error);
                return null;
            }

            conversationId = newConv.id;
            console.log(`[Ghostbuster] Created CRM conversation: ${conversationId}`);
        }

        // Add the outbound message to crm_messages
        await supabase.from('crm_messages').insert({
            conversation_id: conversationId,
            direction: 'outbound',
            role: 'assistant',
            message_type: 'text',
            status: 'sent',
            content: messageText,
            raw_payload: {
                type: 'email',
                email_message_id: emailMessageId,
                subject: subject,
                to: clientEmail,
                campaign: 'ghostbuster',
                alert_id: alertId
            }
        });

        // Update conversation timestamp
        await supabase.from('conversations').update({
            last_message_at: new Date().toISOString(),
            summary: `Reactivación: ${subject}`
        }).eq('id', conversationId);

        return conversationId;

    } catch (error) {
        console.error('[Ghostbuster] Error creating CRM conversation:', error);
        return null;
    }
};

/**
 * Customer context for personalized messages
 */
interface CustomerContext {
    name: string;
    totalSpent?: number;
    ordersCount?: number;
    tags?: string[];
    segment?: string;
}

/**
 * Get personalized product recommendations based on tags
 */
const getPersonalizedRecommendation = (tags: string[]): string => {
    const tagLower = tags.map(t => t.toLowerCase());

    if (tagLower.some(t => t.includes('cbd') || t.includes('aceite'))) {
        return 'aceites de CBD';
    }
    if (tagLower.some(t => t.includes('rso') || t.includes('full spectrum'))) {
        return 'extractos RSO';
    }
    if (tagLower.some(t => t.includes('topico') || t.includes('crema'))) {
        return 'productos tópicos';
    }
    if (tagLower.some(t => t.includes('vip') || t.includes('premium'))) {
        return 'nuestras novedades premium';
    }
    if (tagLower.some(t => t.includes('mayorista') || t.includes('wholesale'))) {
        return 'ofertas mayoristas';
    }

    return 'nuestras novedades';
};

/**
 * Generate reactivation message based on ghost level with personalization
 */
const generateReactivationMessage = (
    clientName: string,
    level: ExtendedGhostLevel,
    context?: CustomerContext
): { text: string; subject: string; html: string } => {
    let text = '';
    let subject = '';
    let html = '';

    const tags = context?.tags || [];
    const totalSpent = context?.totalSpent || 0;
    const ordersCount = context?.ordersCount || 0;
    const recommendation = getPersonalizedRecommendation(tags);

    // VIP at Risk - High priority, personalized approach
    if (level === 'vip_at_risk') {
        const code = `VIP${clientName.substring(0, 3).toUpperCase()}20`;
        subject = `⭐ ${clientName}, tu cuenta VIP te espera`;
        text = `${clientName}, eres uno de nuestros clientes más valiosos. 🌟 Notamos que no has visitado recientemente. Como agradecimiento por tu lealtad ($${totalSpent.toFixed(0)} en ${ordersCount} pedidos), te preparamos un 20% OFF exclusivo. Código: ${code}. ¿Necesitas algo especial?`;
        html = `
            <p><strong>${clientName}</strong>, eres uno de nuestros clientes más valiosos. 🌟</p>
            <p>Notamos que no has visitado recientemente y queríamos asegurarnos de que todo esté bien.</p>
            <p>Como agradecimiento por tu lealtad (${ordersCount} pedidos con nosotros), te preparamos algo especial:</p>
            <div style="background:linear-gradient(135deg, #F59E0B 0%, #D97706 100%);color:#fff;padding:20px;border-radius:8px;text-align:center;margin:20px 0;">
                <p style="margin:0;font-size:14px;">EXCLUSIVO CLIENTE VIP</p>
                <p style="margin:5px 0;font-size:28px;font-weight:bold;">20% OFF</p>
                <p style="margin:10px 0 0 0;font-size:18px;">Código: <strong>${code}</strong></p>
            </div>
            <p>También tenemos nuevos ${recommendation} que podrían interesarte.</p>
            <p><a href="https://extractoseum.com" style="background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Ver Novedades VIP</a></p>
        `;
    }
    // Big Spender Lapsed - Win-back with value acknowledgment
    else if (level === 'big_spender_lapsed') {
        const code = `REGRESA${clientName.substring(0, 3).toUpperCase()}`;
        subject = `💎 ${clientName}, preparamos algo especial para ti`;
        text = `Hola ${clientName}! 💎 Como uno de nuestros clientes favoritos, te extrañamos. Tenemos un 15% OFF esperándote con el código: ${code}. ¿Te interesa ver nuestro nuevo inventario de ${recommendation}?`;
        html = `
            <p>Hola <strong>${clientName}</strong>! 💎</p>
            <p>Como uno de nuestros clientes favoritos, queríamos recordarte que siempre tienes un lugar especial con nosotros.</p>
            <p>Te preparamos un descuento exclusivo para tu regreso:</p>
            <div style="background:#8B5CF6;color:#fff;padding:20px;border-radius:8px;text-align:center;margin:20px 0;">
                <p style="margin:0;font-size:24px;font-weight:bold;">15% OFF</p>
                <p style="margin:10px 0 0 0;font-size:18px;">Código: <strong>${code}</strong></p>
            </div>
            <p>¿Te interesa ver nuestro nuevo inventario de ${recommendation}?</p>
            <p><a href="https://extractoseum.com" style="background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Ver Novedades</a></p>
        `;
    }
    // One-Time Buyer - Encourage second purchase
    else if (level === 'one_time_buyer') {
        const code = `SEGUNDO10`;
        subject = `${clientName}, ¿qué tal tu experiencia? 🌿`;
        text = `Hola ${clientName}! 🌿 Esperamos que hayas disfrutado tu primer pedido. ¿Cómo te fue? Nos encantaría saber tu opinión. Si quieres repetir, usa SEGUNDO10 para un 10% OFF en tu siguiente compra.`;
        html = `
            <p>Hola <strong>${clientName}</strong>! 🌿</p>
            <p>Esperamos que hayas disfrutado tu primer pedido con nosotros.</p>
            <p>¿Cómo te fue con los productos? Nos encantaría saber tu opinión.</p>
            <p>Si quieres repetir la experiencia, tenemos un regalo para ti:</p>
            <div style="background:#10B981;color:#fff;padding:20px;border-radius:8px;text-align:center;margin:20px 0;">
                <p style="margin:0;font-size:18px;">Tu segundo pedido</p>
                <p style="margin:5px 0;font-size:24px;font-weight:bold;">10% OFF</p>
                <p style="margin:10px 0 0 0;font-size:16px;">Código: <strong>${code}</strong></p>
            </div>
            <p>Basado en tu compra anterior, te podría interesar ver ${recommendation}.</p>
            <p><a href="https://extractoseum.com" style="background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Explorar Productos</a></p>
        `;
    }
    // Warm Ghost - Casual check-in
    else if (level === 'warm_ghost') {
        subject = `¡Hola ${clientName}! Te extrañamos 🌿`;
        text = `Hola ${clientName}! Solo pasando a saludar. 🌿 ¿Cómo te ha ido con tus últimos productos? Si necesitas algo, aquí estamos.`;
        html = `
            <p>Hola <strong>${clientName}</strong>!</p>
            <p>Solo pasando a saludar. 🌿 ¿Cómo te ha ido con tus últimos productos?</p>
            <p>Si necesitas algo, aquí estamos para ayudarte.</p>
            <br>
            <p><a href="https://extractoseum.com" style="background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Ver Catálogo</a></p>
        `;
    }
    // Cold Ghost - Product hook
    else if (level === 'cold_ghost') {
        subject = `${clientName}, tenemos novedades para ti 👀`;
        text = `${clientName}, hace tiempo que no sabemos de ti. 👀 Tenemos inventario fresco de ${recommendation} que podría interesarte. ¿Te mando el catálogo actualizado?`;
        html = `
            <p><strong>${clientName}</strong>, hace tiempo que no sabemos de ti. 👀</p>
            <p>Tenemos inventario fresco de ${recommendation} que podría interesarte.</p>
            <p>¿Te gustaría ver el catálogo actualizado?</p>
            <br>
            <p><a href="https://extractoseum.com" style="background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Ver Novedades</a></p>
        `;
    }
    // Frozen Ghost - Discount offer
    else if (level === 'frozen_ghost') {
        const code = `VOLVEMOS${clientName.substring(0, 3).toUpperCase()}`;
        subject = `💚 Te extrañamos ${clientName} - 15% OFF especial`;
        text = `Te extrañamos ${clientName}! 💚 Como cliente especial, te activamos un 15% OFF para tu regreso. Tu código es: ${code} (Válido 7 días). ¿Lo usas hoy?`;
        html = `
            <p>Te extrañamos <strong>${clientName}</strong>! 💚</p>
            <p>Como cliente especial, te activamos un descuento para tu regreso:</p>
            <div style="background:#10B981;color:#fff;padding:20px;border-radius:8px;text-align:center;margin:20px 0;">
                <p style="margin:0;font-size:24px;font-weight:bold;">15% OFF</p>
                <p style="margin:10px 0 0 0;font-size:18px;">Código: <strong>${code}</strong></p>
                <p style="margin:5px 0 0 0;font-size:12px;">Válido por 7 días</p>
            </div>
            <p><a href="https://extractoseum.com" style="background:#4F46E5;color:#fff;padding:12px 24px;text-decoration:none;border-radius:8px;display:inline-block;">Usar mi código ahora</a></p>
        `;
    }
    // Churned - last resort
    else {
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
        // 1. Fetch Alert with client info including email and Shopify metrics
        const { data: alert, error } = await supabase
            .from('ghost_alerts')
            .select(`
                *,
                clients (
                    id,
                    name,
                    phone,
                    email,
                    shopify_orders_count,
                    shopify_total_spent,
                    shopify_tags,
                    customer_segment
                )
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
        const level = alert.ghost_level as ExtendedGhostLevel;

        // Build customer context for personalization
        const customerContext: CustomerContext = {
            name: clientName,
            totalSpent: parseFloat(alert.clients?.shopify_total_spent) || 0,
            ordersCount: alert.clients?.shopify_orders_count || 0,
            tags: parseShopifyTags(alert.clients?.shopify_tags),
            segment: alert.clients?.customer_segment || undefined
        };

        // 2. Generate personalized message
        const { text, subject, html } = generateReactivationMessage(clientName, level, customerContext);

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

                    // Create CRM conversation for tracking replies
                    await createGhostbusterCRMConversation(
                        clientEmail,
                        clientName,
                        alert.clients?.id,
                        text,
                        subject,
                        result.messageId,
                        alertId
                    );
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
