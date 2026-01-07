import { supabase } from '../config/supabase';
import { sendWhatsAppMessage, isWhapiConfigured } from './whapiService';
import { sendNewCoaEmail, sendLoyaltyUpdateEmail, sendOrderCreatedEmail, sendOrderShippedEmail, sendAbandonedRecoveryEmail, sendTrackingUpdateEmail } from './emailService';
import { logNotification } from './loggerService';

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID || '';
const ONESIGNAL_REST_API_KEY = process.env.ONESIGNAL_REST_API_KEY || '';

const getStatusText = (status: string) => {
    const statuses: Record<string, string> = {
        'created': 'Preparando tu pedido',
        'paid': 'Pago confirmado',
        'fulfilled': 'Enviado',
        'shipped': 'En camino',
        'in_transit': 'En tránsito',
        'out_for_delivery': 'En proceso de entrega',
        'delivered': 'Entregado',
        'pending': 'Pendiente',
        'cancelled': 'Cancelado',
        'exception': 'Excepción de envío',
        'return_to_sender': 'Devuelto al remitente'
    };
    return statuses[status] || status;
};

/**
 * Get personalized title and message for tracking status
 */
const getTrackingCopy = (status: string, orderNumber: string, details?: string) => {
    // Get current hour in Mexico City (UTC-6)
    const now = new Date();
    const hour = (now.getUTCHours() - 6 + 24) % 24;
    const isLate = hour >= 19 || hour < 8; // Between 7 PM and 8 AM

    let customDetails = details ? `\n📍 Detalle: ${details}` : '';

    switch (status) {
        case 'in_transit':
            return {
                title: '🚚 ¡Tu paquete está en camino!',
                message: `El pedido ${orderNumber} ya se encuentra en tránsito a tu ciudad.${customDetails}`
            };
        case 'out_for_delivery':
            return {
                title: isLate ? '📍 En proceso de entrega' : '📍 ¡Llega hoy!',
                message: isLate
                    ? `Tu pedido ${orderNumber} se encuentra en proceso de entrega final a domicilio.${customDetails}`
                    : `Tu pedido ${orderNumber} ya está con el repartidor y será entregado hoy.${customDetails}`
            };
        case 'delivered':
            return {
                title: '✅ ¡Tu pedido fue entregado!',
                message: `Confirmamos que el pedido ${orderNumber} ya fue entregado. ¡Esperamos que lo disfrutes!${customDetails}`
            };
        case 'return_to_sender':
            return {
                title: '⚠️ Alerta de Envío',
                message: `El paquete del pedido ${orderNumber} está siendo devuelto al remitente. Por favor contáctanos para reprogramar.${customDetails}`
            };
        case 'exception':
            return {
                title: '⚠️ Aviso de Envío',
                message: `Hay una actualización importante en el envío de tu pedido ${orderNumber}.${customDetails}`
            };
        default:
            return {
                title: '📦 Actualización de envío',
                message: `El estado de tu pedido ${orderNumber} ha cambiado a: ${getStatusText(status)}${customDetails}`
            };
    }
};

/**
 * Check if a user has PWA installed by checking their OneSignal tags
 */
const checkUserHasPWA = async (clientId: string): Promise<boolean> => {
    try {
        // Get the player ID from clients table
        const { data: client } = await supabase
            .from('clients')
            .select('onesignal_player_id')
            .eq('id', clientId)
            .single();

        if (!client?.onesignal_player_id) {
            return false;
        }

        // Query OneSignal for player tags
        const response = await fetch(
            `https://onesignal.com/api/v1/players/${client.onesignal_player_id}?app_id=${ONESIGNAL_APP_ID}`,
            {
                headers: {
                    'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
                }
            }
        );

        if (!response.ok) {
            return false;
        }

        const playerData = await response.json();
        return playerData?.tags?.pwa_installed === 'true';
    } catch (error) {
        console.error('[OneSignal] Error checking PWA status:', error);
        return false;
    }
};

/**
 * Get client email
 */
const getClientEmail = async (clientId: string): Promise<string | null> => {
    try {
        const { data: client } = await supabase
            .from('clients')
            .select('email')
            .eq('id', clientId)
            .single();

        return client?.email || null;
    } catch (error) {
        console.error('[OneSignal] Error getting client email:', error);
        return null;
    }
};

/**
 * Get client phone number from Shopify backup
 */
const getClientPhone = async (clientId: string): Promise<string | null> => {
    try {
        // First try to get from clients table via email
        const { data: client } = await supabase
            .from('clients')
            .select('email, phone')
            .eq('id', clientId)
            .single();

        if (client?.phone) {
            return client.phone;
        }

        // If no phone in clients, try shopify_customers_backup
        if (client?.email) {
            const { data: shopifyCustomer } = await supabase
                .from('shopify_customers_backup')
                .select('phone')
                .eq('email', client.email)
                .single();

            if (shopifyCustomer?.phone) {
                return shopifyCustomer.phone;
            }
        }

        return null;
    } catch (error) {
        console.error('[OneSignal] Error getting client phone:', error);
        return null;
    }
};

interface SendNotificationOptions {
    title: string;
    message: string;
    data?: Record<string, any>;
    imageUrl?: string;
    targetType: 'all' | 'tag' | 'segment' | 'individual' | 'tier' | 'vibe';
    targetValue?: string;
    scheduledFor?: Date;
    sentBy?: string;
    channels?: string[];  // For multi-channel support (push, whatsapp)
    // Smart Option D: Vibe-Based Filtering
    vibeFilters?: {
        includeVibeCategories?: string[];   // e.g., ['excited', 'satisfied']
        excludeVibeCategories?: string[];   // e.g., ['frustrated']
        maxFrictionScore?: number;          // e.g., 50 (exclude high friction)
        minIntentScore?: number;            // e.g., 40 (only warm/hot leads)
    };
}

/**
 * Helper to get client first name for personalization
 */
const getClientFirstName = async (clientId: string, clientData?: any): Promise<string | null> => {
    if (clientData?.name) return clientData.name.split(' ')[0];

    try {
        const { data } = await supabase
            .from('clients')
            .select('name')
            .eq('id', clientId)
            .single();
        return data?.name?.split(' ')[0] || null;
    } catch (err) {
        return null;
    }
};

interface NotificationResult {
    success: boolean;
    notificationId?: string;
    recipients?: number;
    error?: string;
}

/**
 * Send a push notification via OneSignal
 */
export const sendNotification = async (options: SendNotificationOptions): Promise<NotificationResult> => {
    const { title, message, data, imageUrl, targetType, targetValue, scheduledFor, sentBy, vibeFilters } = options;

    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
        console.error('[OneSignal] Missing API credentials');
        return { success: false, error: 'OneSignal not configured' };
    }

    try {
        // Build the notification payload
        const payload: any = {
            app_id: ONESIGNAL_APP_ID,
            headings: { en: title },
            contents: { en: message },
            data: data || {},
        };

        // Add image if provided
        if (imageUrl) {
            payload.big_picture = imageUrl;
            payload.chrome_web_image = imageUrl;
        }

        // Helper to build vibe filter conditions for OneSignal
        const buildVibeFilters = (): any[] => {
            const filters: any[] = [];

            if (vibeFilters?.excludeVibeCategories?.length) {
                // Exclude frustrated users (use NOT_EQUAL for each)
                for (const vibe of vibeFilters.excludeVibeCategories) {
                    if (filters.length > 0) filters.push({ operator: 'AND' });
                    filters.push({ field: 'tag', key: 'vibe_category', relation: '!=', value: vibe });
                }
            }

            if (vibeFilters?.includeVibeCategories?.length) {
                // Include only specific vibes (use OR between them)
                const vibeConditions: any[] = [];
                for (const vibe of vibeFilters.includeVibeCategories) {
                    if (vibeConditions.length > 0) vibeConditions.push({ operator: 'OR' });
                    vibeConditions.push({ field: 'tag', key: 'vibe_category', relation: '=', value: vibe });
                }
                if (vibeConditions.length > 0) {
                    if (filters.length > 0) filters.push({ operator: 'AND' });
                    filters.push(...vibeConditions);
                }
            }

            if (vibeFilters?.maxFrictionScore !== undefined) {
                // Exclude high friction (friction_level = 'high' when score >= 70)
                if (filters.length > 0) filters.push({ operator: 'AND' });
                filters.push({ field: 'tag', key: 'friction_level', relation: '!=', value: 'high' });
            }

            if (vibeFilters?.minIntentScore !== undefined) {
                // Only include warm/hot leads
                if (filters.length > 0) filters.push({ operator: 'AND' });
                if (vibeFilters.minIntentScore >= 70) {
                    filters.push({ field: 'tag', key: 'intent_level', relation: '=', value: 'hot' });
                } else if (vibeFilters.minIntentScore >= 40) {
                    filters.push({ field: 'tag', key: 'intent_level', relation: '!=', value: 'cold' });
                }
            }

            return filters;
        };

        // Handle targeting
        switch (targetType) {
            case 'all':
                // Check if we have vibe filters to apply
                if (vibeFilters && Object.keys(vibeFilters).length > 0) {
                    const filters = buildVibeFilters();
                    if (filters.length > 0) {
                        payload.filters = filters;
                    } else {
                        payload.included_segments = ['All'];
                    }
                } else {
                    payload.included_segments = ['All'];
                }
                break;

            case 'vibe':
                // Pure vibe-based targeting
                payload.filters = buildVibeFilters();
                if (payload.filters.length === 0) {
                    // Fallback to all if no filters specified
                    payload.included_segments = ['All'];
                    delete payload.filters;
                }
                break;

            case 'tag':
                // Target users with specific Shopify tag
                // Note: tags are stored as comma-separated in 'shopify_tags', use 'contains' for partial match
                payload.filters = [
                    { field: 'tag', key: 'shopify_tags', relation: 'contains', value: targetValue }
                ];
                // Add vibe filters if present
                if (vibeFilters && Object.keys(vibeFilters).length > 0) {
                    const vibeFilterConditions = buildVibeFilters();
                    if (vibeFilterConditions.length > 0) {
                        payload.filters.push({ operator: 'AND' });
                        payload.filters.push(...vibeFilterConditions);
                    }
                }
                break;

            case 'tier':
                // Target users by membership tier
                payload.filters = [
                    { field: 'tag', key: 'membership_tier', relation: '=', value: targetValue }
                ];
                // Add vibe filters if present
                if (vibeFilters && Object.keys(vibeFilters).length > 0) {
                    const vibeFilterConditions = buildVibeFilters();
                    if (vibeFilterConditions.length > 0) {
                        payload.filters.push({ operator: 'AND' });
                        payload.filters.push(...vibeFilterConditions);
                    }
                }
                break;

            case 'segment':
                // Target OneSignal segment
                payload.included_segments = [targetValue];
                break;

            case 'individual':
                // Target specific user by client_id using external_user_id
                // Use BOTH include_external_user_ids (v1/v2) and include_aliases (v3) for compatibility
                payload.include_external_user_ids = [targetValue];
                payload.include_aliases = {
                    external_id: [targetValue]
                };
                // Also set target_channel to push (in case we add email/sms later)
                payload.target_channel = 'push';
                break;
        }

        // Handle scheduling
        if (scheduledFor) {
            payload.send_after = scheduledFor.toISOString();
        }

        // Send to OneSignal
        const response = await fetch('https://onesignal.com/api/v1/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
            },
            body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (result.errors) {
            console.error('[OneSignal] Error:', result.errors);

            // Save failed notification to history
            await supabase.from('push_notifications').insert({
                title,
                message,
                data,
                image_url: imageUrl,
                target_type: targetType,
                target_value: targetValue,
                scheduled_for: scheduledFor,
                status: 'failed',
                error_message: JSON.stringify(result.errors),
                sent_by: sentBy
            });

            return { success: false, error: result.errors[0] };
        }

        // Save successful notification to history
        await supabase.from('push_notifications').insert({
            title,
            message,
            data,
            image_url: imageUrl,
            target_type: targetType,
            target_value: targetValue,
            scheduled_for: scheduledFor,
            sent_at: scheduledFor ? null : new Date().toISOString(),
            status: scheduledFor ? 'scheduled' : 'sent',
            onesignal_notification_id: result.id,
            sent_count: result.recipients || 0,
            sent_by: sentBy
        });

        console.log(`[OneSignal] Notification sent: ${result.id} to ${result.recipients} recipients`);

        return {
            success: true,
            notificationId: result.id,
            recipients: result.recipients
        };

    } catch (error: any) {
        console.error('[OneSignal] Error sending notification:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Send notification when a new review needs approval
 * Sends Push to all, WhatsApp to users WITHOUT PWA
 */
export const notifyNewReviewForApproval = async (coaOwnerId: string, coaName: string, reviewerName: string) => {
    // --- DEDUPLICATION (15-min window for review notifications) ---
    try {
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: recentNotif } = await supabase
            .from('system_logs')
            .select('id')
            .eq('event_type', 'review_approval_sent')
            .eq('client_id', coaOwnerId)
            .gte('created_at', fifteenMinsAgo)
            .limit(1);

        if (recentNotif && recentNotif.length > 0) {
            console.log(`[OneSignal] Skipping duplicate review approval notification for ${coaOwnerId}`);
            return;
        }
    } catch (err) {
        console.warn('[OneSignal] Deduplication check failed for review notif:', err);
    }

    // Check user preferences
    const { data: prefs } = await supabase
        .from('notification_preferences')
        .select('notify_review_received')
        .eq('client_id', coaOwnerId)
        .single();

    if (prefs && prefs.notify_review_received === false) {
        return; // User disabled this notification
    }

    const title = 'Nueva reseña pendiente';
    const message = `${reviewerName} dejó una reseña en "${coaName}". Toca para aprobarla.`;

    // Always send Push
    const pushResult = await sendNotification({
        title,
        message,
        data: {
            type: 'review_approval',
            action: 'open_reviews'
        },
        targetType: 'individual',
        targetValue: coaOwnerId
    });

    // Send WhatsApp if user doesn't have PWA
    const hasPWA = await checkUserHasPWA(coaOwnerId);
    if (!hasPWA && isWhapiConfigured()) {
        const phone = await getClientPhone(coaOwnerId);
        if (phone) {
            const waMsg = `*${title}*\n\n${message}\n\nRevisa tus reseñas en: https://coa.extractoseum.com/dashboard`;
            await sendWhatsAppMessage({ to: phone, body: waMsg });
        }
    }

    // Log for deduplication
    await logNotification('review_approval_sent', { coaName, reviewerName }, coaOwnerId);

    return pushResult;
};

/**
 * Send notification when a review is approved
 * Sends Push to all, WhatsApp to users WITHOUT PWA
 */
export const notifyReviewApproved = async (reviewerId: string, coaName: string) => {
    // --- DEDUPLICATION (15-min window) ---
    try {
        const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
        const { data: recentNotif } = await supabase
            .from('system_logs')
            .select('id')
            .eq('event_type', 'review_approved_sent')
            .eq('client_id', reviewerId)
            .gte('created_at', fifteenMinsAgo)
            .limit(1);

        if (recentNotif && recentNotif.length > 0) {
            console.log(`[OneSignal] Skipping duplicate review approved notification for ${reviewerId}`);
            return;
        }
    } catch (err) {
        console.warn('[OneSignal] Deduplication check failed:', err);
    }

    // Check user preferences
    const { data: prefs } = await supabase
        .from('notification_preferences')
        .select('notify_review_approved')
        .eq('client_id', reviewerId)
        .single();

    if (prefs && prefs.notify_review_approved === false) {
        return;
    }

    const title = '¡Tu reseña fue aprobada!';
    const message = `Tu reseña de "${coaName}" ya es visible para todos.`;

    // Always send Push
    const pushResult = await sendNotification({
        title,
        message,
        data: {
            type: 'review_approved'
        },
        targetType: 'individual',
        targetValue: reviewerId
    });

    // Send WhatsApp if user doesn't have PWA
    const hasPWA = await checkUserHasPWA(reviewerId);
    if (!hasPWA && isWhapiConfigured()) {
        const phone = await getClientPhone(reviewerId);
        if (phone) {
            const waMsg = `*${title}*\n\n${message}`;
            await sendWhatsAppMessage({ to: phone, body: waMsg });
        }
    }

    // Log for deduplication
    await logNotification('review_approved_sent', { coaName }, reviewerId);

    return pushResult;
};

/**
 * Send notification when a COA is assigned to a client
 * Sends Push to all users, and WhatsApp to users WITHOUT PWA installed
 */
export const notifyCoaAssigned = async (clientId: string, coaName: string, coaToken: string) => {
    // Check user preferences
    const { data: prefs } = await supabase
        .from('notification_preferences')
        .select('notify_new_coa')
        .eq('client_id', clientId)
        .single();

    if (prefs && prefs.notify_new_coa === false) {
        return;
    }

    const title = '¡Nuevo COA disponible!';
    const message = `Se te ha asignado el certificado "${coaName}".`;
    const coaUrl = `https://coa.extractoseum.com/coa/${coaToken}`;

    // Always send Push notification
    const pushResult = await sendNotification({
        title,
        message,
        data: {
            type: 'coa_assigned',
            coa_token: coaToken,
            deep_link: `/coa/${coaToken}`
        },
        targetType: 'individual',
        targetValue: clientId
    });

    // Send WhatsApp notification if configured and phone exists
    if (isWhapiConfigured()) {
        const phone = await getClientPhone(clientId);
        if (phone) {
            const whatsappMessage = `*${title}*\n\n${message}\n\nVer certificado: ${coaUrl}`;
            const waResult = await sendWhatsAppMessage({ to: phone, body: whatsappMessage });
            console.log(`[OneSignal] COA assigned - WhatsApp sent to ${phone}: ${waResult.sent ? 'OK' : waResult.error}`);
        } else {
            console.log(`[OneSignal] COA assigned - No phone found for client ${clientId}, skipping WhatsApp`);
        }
    }

    // Send Email notification
    const email = await getClientEmail(clientId);
    if (email) {
        await sendNewCoaEmail(email, coaName, coaToken);
    }

    return pushResult;
};

/**
 * Register or update a device token
 * Platform can be: 'web', 'web_pwa', 'ios', 'android'
 */
export const registerDevice = async (
    clientId: string,
    playerId: string,
    platform: string,
    deviceInfo?: {
        model?: string;
        browser?: string;
        os?: string;
        deviceType?: string;
        appPlatform?: string;
        appVersion?: string;
    }
) => {
    // Upsert the token
    const { error } = await supabase
        .from('push_tokens')
        .upsert({
            client_id: clientId,
            onesignal_player_id: playerId,
            platform,
            device_model: deviceInfo?.model,
            browser: deviceInfo?.browser,
            device_os: deviceInfo?.os,
            device_type: deviceInfo?.deviceType,
            app_platform: deviceInfo?.appPlatform,
            app_version: deviceInfo?.appVersion,
            is_active: true,
            updated_at: new Date().toISOString(),
            last_active_at: new Date().toISOString()
        }, {
            onConflict: 'onesignal_player_id'
        });

    if (error) {
        console.error('[OneSignal] Error registering device:', error);
        return false;
    }

    // Also update the client's primary player ID
    await supabase
        .from('clients')
        .update({ onesignal_player_id: playerId })
        .eq('id', clientId);

    return true;
};

/**
 * Update tags in OneSignal for a player
 * Optimized to stay within tag limits
 */
export const updateOneSignalTags = async (playerId: string, tags: string[]) => {
    if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
        console.warn('[OneSignal] Missing credentials for tag update');
        return;
    }

    try {
        // Build tags object for OneSignal
        // We limit to 3 tags to avoid OneSignal tier limits
        const onesignalTags: Record<string, string> = {};

        // 1. Membership tier (highest priority)
        if (tags.includes('Club_partner')) {
            onesignalTags.membership_tier = 'partner';
        } else if (tags.includes('Gold_member')) {
            onesignalTags.membership_tier = 'gold';
        } else if (tags.includes('Platino_member')) {
            onesignalTags.membership_tier = 'platinum';
        } else if (tags.includes('Black_member')) {
            onesignalTags.membership_tier = 'black';
        } else if (tags.includes('Club_partner_REV')) {
            onesignalTags.membership_tier = 'revision';
        }

        // 2. Role 
        if (tags.includes('super_admin')) {
            onesignalTags.role = 'super_admin';
        }

        // 3. Raw tags (essential for custom filtering)
        // If we already have 2 tags, this completes our 3 tag limit
        if (tags.length > 0) {
            onesignalTags.shopify_tags = tags.join(',');
        }

        // Update player tags via OneSignal API
        const response = await fetch(`https://onesignal.com/api/v1/players/${playerId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
            },
            body: JSON.stringify({
                app_id: ONESIGNAL_APP_ID,
                tags: onesignalTags
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[OneSignal] Tag update failed:', error);
        }
    } catch (error) {
        console.error('[OneSignal] Error updating tags:', error);
    }
};

/**
 * Sync emotional vibe and friction score to OneSignal tags AND local database
 * Used for Vibe-Based Broadcasting (Smart Option D)
 *
 * Syncs to:
 * 1. OneSignal player tags (for push notification filtering)
 * 2. shopify_customers_backup table (for WhatsApp/Email filtering)
 *
 * @param clientId - The client ID to update tags for
 * @param vibeData - Object containing emotional_vibe and friction_score
 */
export const syncVibeToOneSignal = async (
    clientId: string,
    vibeData: {
        emotional_vibe?: string;
        friction_score?: number;
        intent_score?: number;
    }
): Promise<boolean> => {
    // Build vibe categories (used for both OneSignal and local DB)
    let friction_level: string | undefined;
    let intent_level: string | undefined;
    let vibe_category: string | undefined;

    // Categorize friction score into buckets for targeting
    if (vibeData.friction_score !== undefined) {
        if (vibeData.friction_score >= 70) {
            friction_level = 'high';      // Frustrated - exclude from promos
        } else if (vibeData.friction_score >= 40) {
            friction_level = 'medium';    // Neutral
        } else {
            friction_level = 'low';       // Happy - good for promos
        }
    }

    // Categorize intent score
    if (vibeData.intent_score !== undefined) {
        if (vibeData.intent_score >= 70) {
            intent_level = 'hot';         // Ready to buy
        } else if (vibeData.intent_score >= 40) {
            intent_level = 'warm';        // Interested
        } else {
            intent_level = 'cold';        // Just browsing
        }
    }

    // Store simplified vibe category
    if (vibeData.emotional_vibe) {
        const vibeLower = vibeData.emotional_vibe.toLowerCase();
        if (vibeLower.includes('frustrad') || vibeLower.includes('molest') || vibeLower.includes('enojad')) {
            vibe_category = 'frustrated';
        } else if (vibeLower.includes('entusiasm') || vibeLower.includes('emocion') || vibeLower.includes('feliz')) {
            vibe_category = 'excited';
        } else if (vibeLower.includes('preocup') || vibeLower.includes('ansi')) {
            vibe_category = 'anxious';
        } else if (vibeLower.includes('satisf') || vibeLower.includes('content')) {
            vibe_category = 'satisfied';
        } else {
            vibe_category = 'neutral';
        }
    }

    // === SYNC TO LOCAL DATABASE (for WhatsApp/Email filtering) ===
    try {
        // Get client email/phone to link with shopify_customers_backup
        const { data: client } = await supabase
            .from('clients')
            .select('email, phone, onesignal_player_id')
            .eq('id', clientId)
            .single();

        if (client?.email || client?.phone) {
            // Update shopify_customers_backup via email or phone
            const vibeUpdateData: Record<string, any> = {
                vibe_updated_at: new Date().toISOString()
            };

            if (vibe_category) vibeUpdateData.vibe_category = vibe_category;
            if (friction_level) vibeUpdateData.friction_level = friction_level;
            if (intent_level) vibeUpdateData.intent_level = intent_level;
            if (vibeData.friction_score !== undefined) vibeUpdateData.friction_score = vibeData.friction_score;
            if (vibeData.intent_score !== undefined) vibeUpdateData.intent_score = vibeData.intent_score;
            if (vibeData.emotional_vibe) vibeUpdateData.emotional_vibe = vibeData.emotional_vibe.substring(0, 200);

            // Try to update by email first
            if (client.email) {
                const { error: emailError } = await supabase
                    .from('shopify_customers_backup')
                    .update(vibeUpdateData)
                    .eq('email', client.email.toLowerCase());

                if (!emailError) {
                    console.log(`[OneSignal] Vibe synced to shopify_customers_backup via email: ${client.email}`);
                }
            }

            // Also try by phone (some customers might match by phone only)
            if (client.phone) {
                const cleanPhone = client.phone.replace(/\D/g, '');
                const { error: phoneError } = await supabase
                    .from('shopify_customers_backup')
                    .update(vibeUpdateData)
                    .ilike('phone', `%${cleanPhone.slice(-10)}`);

                if (!phoneError) {
                    console.log(`[OneSignal] Vibe synced to shopify_customers_backup via phone`);
                }
            }
        }

        // === SYNC TO ONESIGNAL (for push filtering) ===
        if (!ONESIGNAL_APP_ID || !ONESIGNAL_REST_API_KEY) {
            console.warn('[OneSignal] Missing credentials for vibe sync to OneSignal');
            return true; // Return true since local sync succeeded
        }

        if (!client?.onesignal_player_id) {
            // Client doesn't have push notifications enabled, but local sync is done
            return true;
        }

        // Build vibe tags for OneSignal
        const vibeTags: Record<string, string> = {};
        if (friction_level) vibeTags.friction_level = friction_level;
        if (intent_level) vibeTags.intent_level = intent_level;
        if (vibe_category) vibeTags.vibe_category = vibe_category;
        if (vibeData.friction_score !== undefined) vibeTags.friction_score = String(vibeData.friction_score);
        if (vibeData.intent_score !== undefined) vibeTags.intent_score = String(vibeData.intent_score);
        if (vibeData.emotional_vibe) vibeTags.emotional_vibe = vibeData.emotional_vibe.substring(0, 50);
        vibeTags.vibe_updated_at = new Date().toISOString().split('T')[0];

        // Update player tags via OneSignal API
        const response = await fetch(`https://onesignal.com/api/v1/players/${client.onesignal_player_id}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
            },
            body: JSON.stringify({
                app_id: ONESIGNAL_APP_ID,
                tags: vibeTags
            })
        });

        if (!response.ok) {
            const error = await response.text();
            console.error('[OneSignal] Vibe sync to OneSignal failed:', error);
            return true; // Return true since local sync still succeeded
        }

        console.log(`[OneSignal] Vibe synced for client ${clientId}:`, vibeTags);
        return true;

    } catch (error) {
        console.error('[OneSignal] Error syncing vibe:', error);
        return false;
    }
};

/**
 * Get vibe distribution stats for targeting UI
 * Returns counts of users by vibe_category and friction_level
 */
export const getVibeStats = async (): Promise<{
    byVibeCategory: Record<string, number>;
    byFrictionLevel: Record<string, number>;
    byIntentLevel: Record<string, number>;
    total: number;
}> => {
    // We'll query from our local push_tokens with joined client data
    // For now, return empty stats - will be populated as users get vibe synced
    const { data: tokens, error } = await supabase
        .from('push_tokens')
        .select('client_id')
        .eq('is_active', true);

    if (error || !tokens) {
        return {
            byVibeCategory: {},
            byFrictionLevel: {},
            byIntentLevel: {},
            total: 0
        };
    }

    // TODO: In future, store vibe tags locally for faster querying
    // For now, just return total count
    return {
        byVibeCategory: { unknown: tokens.length },
        byFrictionLevel: { unknown: tokens.length },
        byIntentLevel: { unknown: tokens.length },
        total: tokens.length
    };
};

/**
 * Unregister a device (e.g., on logout)
 */
export const unregisterDevice = async (playerId: string) => {
    const { error } = await supabase
        .from('push_tokens')
        .update({ is_active: false })
        .eq('onesignal_player_id', playerId);

    return !error;
};

/**
 * Get notification history
 */
export const getNotificationHistory = async (limit: number = 50, offset: number = 0) => {
    const { data, error, count } = await supabase
        .from('push_notifications')
        .select('*, clients!sent_by(name, email)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    if (error) {
        console.error('[OneSignal] Error fetching history:', error);
        return { notifications: [], total: 0 };
    }

    return { notifications: data || [], total: count || 0 };
};

/**
 * Notify COA owner when fraud is detected on their verification codes (CVV/QR)
 * IMPORTANT: Fraud alerts ALWAYS send WhatsApp regardless of PWA status
 */
export const notifyFraudDetected = async (
    cvvCode: string,
    scanCount: number,
    coaToken: string,
    coaName: string,
    coaOwnerId: string
) => {
    if (!coaOwnerId) {
        console.log('[OneSignal] No COA owner to notify about fraud');
        return;
    }

    // Check user preferences (use announcements for important alerts)
    const { data: prefs } = await supabase
        .from('notification_preferences')
        .select('notify_announcements')
        .eq('client_id', coaOwnerId)
        .single();

    if (prefs && prefs.notify_announcements === false) {
        return;
    }

    const title = '⚠️ Alerta: Escaneo sospechoso';
    const message = `Tu codigo ${cvvCode} ha sido escaneado ${scanCount} veces. Producto: ${coaName}`;
    const coaUrl = `https://coa.extractoseum.com/coa/${coaToken}`;

    // Always send Push
    const pushResult = await sendNotification({
        title,
        message,
        data: {
            type: 'fraud_alert',
            cvv_code: cvvCode,
            coa_token: coaToken,
            scan_count: scanCount,
            deep_link: `/coa/${coaToken}`
        },
        targetType: 'individual',
        targetValue: coaOwnerId
    });

    // Log the fraud notification event
    await logNotification('fraud_alert_sent', {
        cvv_code: cvvCode,
        coa_token: coaToken,
        scan_count: scanCount,
        has_push: !!pushResult.success
    }, coaOwnerId);

    // FRAUD ALERTS: Always send WhatsApp (critical notification)
    if (isWhapiConfigured()) {
        const phone = await getClientPhone(coaOwnerId);
        if (phone) {
            const waMsg = `*${title}*\n\n${message}\n\nVerificar producto: ${coaUrl}`;
            const waResult = await sendWhatsAppMessage({ to: phone, body: waMsg });
            console.log(`[OneSignal] Fraud alert - WhatsApp sent to ${phone}: ${waResult.sent ? 'OK' : waResult.error}`);
        }
    }

    return pushResult;
};

/**
 * Cancel a scheduled notification
 */
export const cancelScheduledNotification = async (notificationId: string) => {
    // Get the OneSignal notification ID
    const { data: notification } = await supabase
        .from('push_notifications')
        .select('onesignal_notification_id')
        .eq('id', notificationId)
        .eq('status', 'scheduled')
        .single();

    if (!notification?.onesignal_notification_id) {
        return { success: false, error: 'Notification not found or already sent' };
    }

    // Cancel in OneSignal
    const response = await fetch(
        `https://onesignal.com/api/v1/notifications/${notification.onesignal_notification_id}?app_id=${ONESIGNAL_APP_ID}`,
        {
            method: 'DELETE',
            headers: {
                'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
            }
        }
    );

    if (!response.ok) {
        return { success: false, error: 'Failed to cancel in OneSignal' };
    }

    // Update status in database
    await supabase
        .from('push_notifications')
        .update({ status: 'cancelled' })
        .eq('id', notificationId);

    return { success: true };
};

/**
 * Notify user of loyalty/membership status change
 */
export const notifyLoyaltyUpdate = async (clientId: string, tierName: string, type: 'review' | 'active' | 'escalated') => {
    // --- DEDUPLICATION (60-min window for same tier+type combo) ---
    try {
        const sixtyMinsAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recentNotif } = await supabase
            .from('system_logs')
            .select('id, payload')
            .eq('event_type', 'loyalty_update_sent')
            .eq('client_id', clientId)
            .gte('created_at', sixtyMinsAgo);

        if (recentNotif && recentNotif.length > 0) {
            const isDuplicate = recentNotif.some((n: any) =>
                n.payload?.tier === tierName && n.payload?.type === type
            );
            if (isDuplicate) {
                console.log(`[OneSignal] Skipping duplicate loyalty update for ${clientId} (${tierName}/${type})`);
                return;
            }
        }
    } catch (err) {
        console.warn('[OneSignal] Deduplication check failed for loyalty notif:', err);
    }

    let title = '';
    let message = '';

    switch (type) {
        case 'review':
            title = '🏷️ Membresía en Revisión';
            message = 'Tu solicitud para el Club EUM Care está en proceso de revisión. Te avisaremos pronto.';
            break;
        case 'active':
            title = '✅ ¡Bienvenido al Club!';
            message = 'Tu solicitud ha sido aceptada. Ya eres Socio Partner activo.';
            break;
        case 'escalated':
            title = '🚀 Has subido de nivel';
            message = `¡Felicidades! Ahora eres Miembro ${tierName}. Revisa tus nuevos beneficios en el Dashboard.`;
            break;
    }

    // Always send Push
    await sendNotification({
        title,
        message,
        data: { type: 'loyalty_update', tier: tierName },
        targetType: 'individual',
        targetValue: clientId
    });

    // Send WhatsApp for loyalty updates
    if (isWhapiConfigured()) {
        const phone = await getClientPhone(clientId);
        if (phone) {
            const waMsg = `*${title}*\n\n${message}\n\nVer mi credencial: https://coa.extractoseum.com/dashboard`;
            await sendWhatsAppMessage({ to: phone, body: waMsg });
        }
    }

    // Send Email notification
    const email = await getClientEmail(clientId);
    if (email) {
        await sendLoyaltyUpdateEmail(email, tierName, type);
    }

    // Log the event
    await logNotification('loyalty_update_sent', { tier: tierName, type }, clientId);
};

/**
 * Notify user of a new order
 */
export const notifyOrderCreated = async (clientId: string, orderNumber: string, clientData?: any) => {
    // --- DEDUPLICATION with atomic lock ---
    // Use upsert to create a lock record first, preventing race conditions
    const lockKey = `order_created_${clientId}_${orderNumber}`;

    try {
        // Try to insert a lock record - this will fail if it already exists (duplicate)
        const { error: lockError } = await supabase
            .from('system_logs')
            .insert({
                event_type: 'order_created_sent',
                client_id: clientId,
                payload: { orderNumber, status: 'sending' }
            });

        if (lockError) {
            // Check if it's a duplicate by looking for existing record
            const sixtyMinsAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const { data: existing } = await supabase
                .from('system_logs')
                .select('id')
                .eq('event_type', 'order_created_sent')
                .eq('client_id', clientId)
                .gte('created_at', sixtyMinsAgo)
                .contains('payload', { orderNumber })
                .limit(1);

            if (existing && existing.length > 0) {
                console.log(`[OneSignal] Skipping duplicate CREATED notification for ${orderNumber} (lock exists)`);
                return;
            }
            // If no existing record found, it was a different error - continue anyway
            console.warn('[OneSignal] Lock insert failed but no duplicate found, continuing:', lockError.message);
        }
    } catch (err) {
        console.warn('[OneSignal] Deduplication lock failed for created notif:', err);
    }

    const firstName = await getClientFirstName(clientId, clientData);
    const greeting = firstName ? `Hola ${firstName}! ` : '';
    const title = '🛒 ¡Pedido Recibido!';
    const message = `${greeting}Hemos recibido tu pedido ${orderNumber}. En breve te avisaremos cuando sea enviado.`;

    // Send Push
    await sendNotification({
        title,
        message,
        data: { type: 'order_created', order_number: orderNumber },
        targetType: 'individual',
        targetValue: clientId
    });

    // Send WhatsApp
    if (isWhapiConfigured()) {
        const phone = clientData?.phone || await getClientPhone(clientId);
        if (phone) {
            const waMsg = `*${title}*\n\n${message}\n\nPuedes ver el estado en tu dashboard: https://coa.extractoseum.com/dashboard`;
            await sendWhatsAppMessage({ to: phone, body: waMsg });
        }
    }

    // Send Email
    const email = clientData?.email || await getClientEmail(clientId);
    if (email) {
        await sendOrderCreatedEmail(email, orderNumber);
    }

    // Update the log to mark as completed (the initial insert already created the record)
    console.log(`[OneSignal] Order CREATED notification sent for ${orderNumber}`);
};

/**
 * Notify user of order shipment
 */
export const notifyOrderShipped = async (
    clientId: string,
    orderNumber: string,
    carrier: string,
    trackingNumbers: string | string[],
    clientData?: any,
    estimatedDelivery?: string,
    serviceType?: string
) => {
    const guides = Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers];
    const trackingString = guides.join(', ');
    const isPlural = guides.length > 1;

    // --- DEDUPLICATION with atomic lock ---
    // Insert lock record FIRST to prevent race conditions with concurrent webhooks
    try {
        const { error: lockError } = await supabase
            .from('system_logs')
            .insert({
                event_type: 'order_shipped_sent',
                client_id: clientId,
                payload: { orderNumber, carrier, tracking_numbers: guides, status: 'sending' }
            });

        if (lockError) {
            // Check if it's a duplicate by looking for existing record
            const sixtyMinsAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const { data: existing } = await supabase
                .from('system_logs')
                .select('id, payload')
                .eq('event_type', 'order_shipped_sent')
                .eq('client_id', clientId)
                .gte('created_at', sixtyMinsAgo);

            if (existing && existing.length > 0) {
                // Check if any existing notification has same order AND same tracking numbers
                const isDuplicate = existing.some(n => {
                    const p = n.payload;
                    if (p.orderNumber !== orderNumber) return false;
                    const existingGuides = Array.isArray(p.tracking_numbers) ? p.tracking_numbers : [];
                    if (existingGuides.length !== guides.length) return false;
                    return guides.every(g => existingGuides.includes(g));
                });

                if (isDuplicate) {
                    console.log(`[OneSignal] Skipping duplicate SHIPPED notification for ${orderNumber} (${trackingString}) - lock exists`);
                    return;
                }
            }
            console.warn('[OneSignal] Lock insert failed but no duplicate found, continuing:', lockError.message);
        }
    } catch (err) {
        console.warn('[OneSignal] Deduplication lock failed, proceeding with notification:', err);
    }

    const firstName = await getClientFirstName(clientId, clientData);
    const greeting = firstName ? `Hola ${firstName}! ` : '';

    const carrierAndService = serviceType ? `${carrier} (${serviceType})` : carrier;
    const title = '📦 ¡Tu pedido va en camino!';
    let message = isPlural
        ? `${greeting}Tu pedido ${orderNumber} ha sido enviado por ${carrierAndService}. Guías: ${trackingString}`
        : `${greeting}Tu pedido ${orderNumber} ha sido enviado por ${carrierAndService}. Guía: ${guides[0]}`;

    if (estimatedDelivery) {
        try {
            const date = new Date(estimatedDelivery);
            const formattedDate = date.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });
            message += `\n\n📅 Fecha estimada de entrega: ${formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1)}`;
        } catch (e) {
            console.warn('[OneSignal] Failed to format estimatedDelivery date', e);
        }
    }

    console.log(`[OneSignal] notifyOrderShipped for ${orderNumber}, guides: ${trackingString}`);

    // Send Push
    await sendNotification({
        title,
        message,
        data: { type: 'order_shipped', order_number: orderNumber, tracking_numbers: guides, carrier },
        targetType: 'individual',
        targetValue: clientId
    });

    // Send WhatsApp
    console.log(`[OneSignal] notifyOrderShipped - isWhapiConfigured: ${isWhapiConfigured()}`);
    if (isWhapiConfigured()) {
        const phone = clientData?.phone || await getClientPhone(clientId);
        console.log(`[OneSignal] notifyOrderShipped - Phone found: ${phone}`);
        if (phone) {
            const waMsg = `*${title}*\n\n${message}\n\nSigue tu paquete aquí: https://coa.extractoseum.com/my-orders`;
            const waResult = await sendWhatsAppMessage({ to: phone, body: waMsg });
            console.log(`[OneSignal] notifyOrderShipped - WhatsApp result: ${JSON.stringify(waResult)}`);
        }
    }

    // Send Email
    const email = clientData?.email || await getClientEmail(clientId);
    if (email) {
        await sendOrderShippedEmail(email, orderNumber, carrier, guides);
    }

    // Log already created at start with atomic lock, just log completion
    console.log(`[OneSignal] Order SHIPPED notification sent for ${orderNumber} (${trackingString})`);
};

/**
 * Notify user of a tracking status update
 */
export const notifyTrackingUpdate = async (
    clientId: string,
    orderNumber: string,
    status: string,
    details?: string,
    clientData?: any,
    location?: string
) => {
    // --- DEDUPLICATION ---
    try {
        const sixtyMinsAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recentNotif } = await supabase
            .from('system_logs')
            .select('id, payload')
            .eq('event_type', 'tracking_update_sent')
            .eq('client_id', clientId)
            .gte('created_at', sixtyMinsAgo);

        if (recentNotif && recentNotif.length > 0) {
            const isDuplicate = recentNotif.some(n =>
                n.payload?.orderNumber === orderNumber && n.payload?.status === status
            );
            if (isDuplicate) {
                console.log(`[OneSignal] Skipping duplicate TRACKING notification for ${orderNumber} (${status})`);
                return;
            }
        }
    } catch (err) {
        console.warn('[OneSignal] Deduplication check failed for tracking notif:', err);
    }

    const firstName = await getClientFirstName(clientId, clientData);
    const greeting = firstName ? `Hola ${firstName}! ` : '';

    let { title, message } = getTrackingCopy(status, orderNumber, details);

    if (location) {
        if (status === 'in_transit') {
            message = `Tu pedido ${orderNumber} se encuentra en ${location.toUpperCase()} y viene hacia ti.`;
        } else if (status === 'out_for_delivery') {
            message = `El repartidor ya tiene tu pedido en ruta por ${location.toUpperCase()}. ¡Prepárate!`;
        }
    }

    message = `${greeting}${message}`;
    console.log(`[OneSignal] notifyTrackingUpdate for ${orderNumber}, status: ${status}`);

    // Send Push
    await sendNotification({
        title,
        message,
        data: { type: 'tracking_update', order_number: orderNumber, status },
        targetType: 'individual',
        targetValue: clientId
    });

    // Send WhatsApp
    console.log(`[OneSignal] notifyTrackingUpdate - isWhapiConfigured: ${isWhapiConfigured()}`);
    if (isWhapiConfigured()) {
        const phone = clientData?.phone || await getClientPhone(clientId);
        console.log(`[OneSignal] notifyTrackingUpdate - Phone found: ${phone}`);
        if (phone) {
            const waMsg = `*${title}*\n\n${message}\n\nSigue tu paquete aquí: https://coa.extractoseum.com/my-orders`;
            const waResult = await sendWhatsAppMessage({ to: phone, body: waMsg });
            console.log(`[OneSignal] notifyTrackingUpdate - WhatsApp result: ${JSON.stringify(waResult)}`);
        }
    }

    // Send Email
    const email = clientData?.email || await getClientEmail(clientId);
    if (email) {
        await sendTrackingUpdateEmail(email, orderNumber, title, message);
    }

    await logNotification('tracking_update_sent', { orderNumber, status, friendlyStatus: getStatusText(status), location, message }, clientId);
};

/**
 * Notify user of failed delivery attempt
 */
export const notifyDeliveryAttemptFailed = async (clientId: string, orderNumber: string, reason?: string, clientData?: any) => {
    const firstName = await getClientFirstName(clientId, clientData);
    const greeting = firstName ? `Hola ${firstName}, ` : '';
    const title = '⚠️ Intento de entrega fallido';
    const message = `${greeting}Estafeta intentó entregar tu pedido ${orderNumber} pero no fue posible. Detalle: ${reason || 'Ver guía para más info'}.`;

    await sendNotification({
        title,
        message,
        data: { type: 'failed_attempt', order_number: orderNumber },
        targetType: 'individual',
        targetValue: clientId
    });

    if (isWhapiConfigured()) {
        const phone = clientData?.phone || await getClientPhone(clientId);
        if (phone) {
            const waMsg = `*${title}*\n\n${message}\n\nSigue tu paquete aquí: https://coa.extractoseum.com/my-orders`;
            await sendWhatsAppMessage({ to: phone, body: waMsg });
        }
    }

    await logNotification('failed_attempt_sent', { orderNumber, reason, message }, clientId);
};

/**
 * Notify user that package is at office/ready for pickup
 */
export const notifyPackageAtOffice = async (clientId: string, orderNumber: string, location?: string, clientData?: any) => {
    const firstName = await getClientFirstName(clientId, clientData);
    const greeting = firstName ? `Hola ${firstName}! ` : '';
    const title = '📍 Paquete listo para recolectar';
    const message = `${greeting}Tu pedido ${orderNumber} ya está disponible para recoger en la oficina de Estafeta${location ? ` en ${location}` : ''}.`;

    await sendNotification({
        title,
        message,
        data: { type: 'at_office', order_number: orderNumber },
        targetType: 'individual',
        targetValue: clientId
    });

    if (isWhapiConfigured()) {
        const phone = clientData?.phone || await getClientPhone(clientId);
        if (phone) {
            const waMsg = `*${title}*\n\n${message}\n\nUbicación: ${location || 'Ver en rastreo'}\n\nSigue tu paquete aquí: https://coa.extractoseum.com/my-orders`;
            await sendWhatsAppMessage({ to: phone, body: waMsg });
        }
    }

    await logNotification('at_office_sent', { orderNumber, location, message }, clientId);
};

/**
 * Notify user of delivery delay
 */
export const notifyDeliveryDelay = async (clientId: string, orderNumber: string, clientData?: any) => {
    const firstName = await getClientFirstName(clientId, clientData);
    const greeting = firstName ? `Hola ${firstName}, ` : '';
    const title = '⏰ Tu pedido está retrasado';
    const message = `${greeting}Notamos que tu pedido ${orderNumber} ha excedido la fecha estimada de entrega. Estamos monitoreando el envío para que llegue lo antes posible.`;

    await sendNotification({
        title,
        message,
        data: { type: 'delivery_delay', order_number: orderNumber },
        targetType: 'individual',
        targetValue: clientId
    });

    await logNotification('delivery_delay_sent', { orderNumber, message }, clientId);
};

/**
 * Notify user to recover an abandoned order or checkout
 */
export const notifyAbandonedRecovery = async (clientId: string, identifier: string, checkoutUrl: string, clientData?: any) => {
    const title = '🛒 ¡Tu carrito te extraña!';
    const message = identifier.startsWith('EUM')
        ? `Tú pedido ${identifier} está casi listo. ¡Completa tu pago ahora para recibirlo pronto!`
        : `Tienes productos esperándote. Completa tu compra antes de que se agoten.`;

    // Send Push
    await sendNotification({
        title,
        message,
        data: { type: 'recovery', url: checkoutUrl },
        targetType: 'individual',
        targetValue: clientId
    });

    // Send WhatsApp
    if (isWhapiConfigured()) {
        const phone = clientData?.phone || await getClientPhone(clientId);
        if (phone) {
            const waMsg = `*${title}*\n\n${message}\n\nTermina tu compra aquí: ${checkoutUrl}`;
            await sendWhatsAppMessage({ to: phone, body: waMsg });
        }
    }

    // Send Email
    const email = clientData?.email || await getClientEmail(clientId);
    if (email) {
        await sendAbandonedRecoveryEmail(email, clientData?.name, checkoutUrl, identifier.startsWith('EUM') ? identifier : null);
    }

    await logNotification('recovery_reminded', { identifier, checkoutUrl }, clientId);
    return true;
};
