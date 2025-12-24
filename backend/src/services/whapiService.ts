/**
 * Whapi.cloud Service - WhatsApp API Integration
 *
 * Conecta con WhatsApp via Whapi.cloud (sin necesidad de Meta Business API)
 * API Docs: https://whapi.readme.io/reference/sendmessagetext
 */

import axios from 'axios';
import { supabase } from '../config/supabase';
import { normalizePhone } from '../utils/phoneUtils';

const WHAPI_BASE_URL = process.env.WHAPI_BASE_URL || 'https://gate.whapi.cloud';
const WHAPI_TOKEN = process.env.WHAPI_TOKEN;

// Rate limit: 1 mensaje por segundo para evitar bloqueos de WhatsApp
const MESSAGE_DELAY_MS = 1000;

const whapiApi = axios.create({
    baseURL: WHAPI_BASE_URL,
    timeout: 5000,
    headers: {
        'Authorization': `Bearer ${WHAPI_TOKEN}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }
});

interface WhatsAppMessage {
    to: string;  // Phone number (e.g., 5215512345678)
    body: string;
}

interface WhapiResponse {
    sent: boolean;
    message?: {
        id: string;
        status: string;
    };
    error?: string;
}

interface BulkResult {
    sent: number;
    failed: number;
    errors: string[];
}

/**
 * Normalizar teléfono a formato internacional sin "+"
 * Whapi espera números mexicanos en formato: 521XXXXXXXXXX (13 dígitos)
 * Siempre tomamos los últimos 10 dígitos y prependeamos 521.
 * El usuario aclaró que TODOS los números deben tratarse como mexicanos.
 */
/**
 * Normalizar teléfono usando utilidad centralizada (Wrapper)
 */
export { normalizePhone };

/**
 * Verificar si Whapi está configurado
 */
export const isWhapiConfigured = (): boolean => {
    return !!WHAPI_TOKEN && WHAPI_TOKEN.length > 10;
};

/**
 * Verificar estado de la conexión WhatsApp
 */
export const checkWhapiStatus = async (): Promise<{
    connected: boolean;
    configured: boolean;
    phone?: string;
    name?: string;
    error?: string;
}> => {
    if (!isWhapiConfigured()) {
        return { connected: false, configured: false, error: 'WHAPI_TOKEN no configurado' };
    }

    try {
        // Use /health endpoint which returns connection status and user info
        const response = await whapiApi.get('/health');
        const data = response.data;

        // status.text can be "AUTH" (authenticated), "INIT", "QR", etc.
        const isConnected = data?.status?.text === 'AUTH' || data?.status?.code === 4;

        return {
            connected: isConnected,
            configured: true,
            phone: data?.user?.id || data?.user?.pushname,
            name: data?.user?.name || data?.user?.pushname
        };
    } catch (error: any) {
        console.error('[Whapi] Error checking status:', error.response?.data || error.message);
        return {
            connected: false,
            configured: true,
            error: error.response?.data?.message || error.message
        };
    }
};

/**
 * Enviar mensaje individual de WhatsApp
 */
export const sendWhatsAppMessage = async (msg: WhatsAppMessage, customToken?: string): Promise<WhapiResponse> => {
    const activeToken = customToken || WHAPI_TOKEN;
    if (!activeToken || activeToken.length < 10) {
        return { sent: false, error: 'WhatsApp no configurado (Token faltante)' };
    }

    try {
        const phone = normalizePhone(msg.to, 'whapi');

        console.log(`[Whapi] Sending to ${phone} using token ${activeToken.substring(0, 5)}...`);

        const response = await axios.post(`${WHAPI_BASE_URL}/messages/text`, {
            to: phone,
            body: msg.body
        }, {
            headers: {
                'Authorization': `Bearer ${activeToken}`,
                'Content-Type': 'application/json'
            }
        });

        const msgId = response.data?.message?.id || response.data?.id || 'unknown';
        console.log(`[Whapi] Message sent to ${phone}, id: ${msgId}`);

        // Individual messages are not linked to a specific notification_id in this flow,
        // so we leave it null here. In the future we could pass an optional notificationId.
        try {
            await supabase.from('whatsapp_messages').insert({
                phone: phone,
                whapi_message_id: msgId,
                status: 'sent',
                error_message: null
            });
        } catch (dbErr) {
            console.warn('[Whapi] Error logging to DB:', dbErr);
        }

        return {
            sent: true,
            message: {
                id: msgId,
                status: response.data?.message?.status || response.data?.status || 'sent'
            }
        };
    } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
        console.error(`[Whapi] Error sending to ${msg.to}:`, errorMsg);

        try {
            await supabase.from('whatsapp_messages').insert({
                phone: normalizePhone(msg.to),
                status: 'failed',
                error_message: errorMsg
            });
        } catch (dbErr) {
            console.warn('[Whapi] Error logging failure to DB:', dbErr);
        }

        return {
            sent: false,
            error: errorMsg
        };
    }
};

/**
 * Enviar nota de voz de WhatsApp
 */
export const sendWhatsAppVoice = async (to: string, mediaUrl: string, customToken?: string): Promise<WhapiResponse> => {
    const activeToken = customToken || WHAPI_TOKEN;
    if (!activeToken || activeToken.length < 10) {
        return { sent: false, error: 'WhatsApp no configurado (Token faltante)' };
    }

    try {
        const phone = normalizePhone(to, 'whapi');
        console.log(`[Whapi] Sending Voice to ${phone}... URL: ${mediaUrl.substring(0, 30)}...`);

        // Endpoint for PTT (Push to Talk) / Voice Notes
        const response = await axios.post(`${WHAPI_BASE_URL}/messages/voice`, {
            to: phone,
            media: mediaUrl
        }, {
            headers: {
                'Authorization': `Bearer ${activeToken}`,
                'Content-Type': 'application/json'
            }
        });

        const msgId = response.data?.message?.id || response.data?.id || 'unknown';
        console.log(`[Whapi] Voice sent to ${phone}, id: ${msgId}`);

        // Log to DB
        try {
            await supabase.from('whatsapp_messages').insert({
                phone: phone,
                whapi_message_id: msgId,
                status: 'sent',
                error_message: null
            });
        } catch (dbErr) { console.warn('[Whapi] Error logging voice to DB:', dbErr); }

        return {
            sent: true,
            message: {
                id: msgId,
                status: response.data?.message?.status || response.data?.status || 'sent'
            }
        };

    } catch (error: any) {
        const errorMsg = error.response?.data?.message || error.response?.data?.error || error.message;
        console.error(`[Whapi] Error sending Voice to ${to}:`, errorMsg);
        return { sent: false, error: errorMsg };
    }
};

/**
 * Delay helper para rate limiting
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Enviar mensajes en lote con rate limiting
 */
export const sendBulkWhatsApp = async (
    phones: string[],
    body: string,
    notificationId: string
): Promise<BulkResult> => {
    console.log(`[Whapi] ========== sendBulkWhatsApp CALLED ==========`);
    console.log(`[Whapi] Phones: ${JSON.stringify(phones)}`);
    console.log(`[Whapi] NotificationId: ${notificationId}`);
    console.log(`[Whapi] Body length: ${body.length}`);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    console.log(`[Whapi] Starting bulk send to ${phones.length} recipients...`);

    for (let i = 0; i < phones.length; i++) {
        const phone = phones[i];

        try {
            const result = await sendWhatsAppMessage({ to: phone, body });
            const normalizedPhone = normalizePhone(phone, 'whapi');

            // Guardar en historial
            await supabase.from('whatsapp_messages').insert({
                notification_id: notificationId,
                phone: normalizedPhone,
                whapi_message_id: result.message?.id || null,
                status: result.sent ? 'sent' : 'failed',
                error_message: result.error || null
            });

            if (result.sent) {
                sent++;
            } else {
                failed++;
                errors.push(`${phone}: ${result.error}`);
            }

            // Log progreso cada 10 mensajes
            if ((i + 1) % 10 === 0) {
                console.log(`[Whapi] Progress: ${i + 1}/${phones.length} (${sent} sent, ${failed} failed)`);
            }

        } catch (error: any) {
            failed++;
            const errorMsg = error.message || 'Unknown error';
            errors.push(`${phone}: ${errorMsg}`);

            // Guardar error en historial
            await supabase.from('whatsapp_messages').insert({
                notification_id: notificationId,
                phone: normalizePhone(phone),
                status: 'failed',
                error_message: errorMsg
            });
        }

        // Rate limit: esperar 1 segundo entre mensajes
        if (i < phones.length - 1) {
            await delay(MESSAGE_DELAY_MS);
        }
    }

    console.log(`[Whapi] Bulk send complete: ${sent} sent, ${failed} failed`);

    // Actualizar contadores en la notificación
    await supabase
        .from('push_notifications')
        .update({
            whatsapp_sent_count: sent,
            whatsapp_failed_count: failed
        })
        .eq('id', notificationId);

    return { sent, failed, errors };
};

/**
 * Verificar si un número tiene WhatsApp
 * Útil para filtrar números válidos antes de enviar
 */
export const checkPhoneExists = async (phone: string): Promise<boolean> => {
    if (!isWhapiConfigured()) return false;

    try {
        const normalizedPhone = normalizePhone(phone, 'whapi');
        const response = await whapiApi.head(`/contacts/${normalizedPhone}`);
        return response.status === 200;
    } catch {
        return false;
    }
};

/**
 * Obtener información de contacto
 */
/**
 * Habilitar obtención de avatares en Whapi
 * PATCH /settings { media: { init_avatars: true } }
 */
export const enableAvatarFetching = async (): Promise<boolean> => {
    try {
        console.log('[Whapi] Enabling avatar fetching via PATCH /settings...');
        const response = await whapiApi.patch('/settings', {
            media: { init_avatars: true }
        });
        console.log('[Whapi] Avatar fetching enabled. Response:', response.data);
        return true;
    } catch (error: any) {
        console.error('[Whapi] Failed to enable avatars:', error.response?.data || error.message);
        return false;
    }
};

/**
 * Obtener información de contacto (Foto y nombre)
 * Usa el endpoint /profile recomendado para obtener el avatar on-demand
 */
export const getContactInfo = async (phone: string): Promise<{
    exists: boolean;
    name?: string;
    profilePic?: string;
}> => {
    if (!isWhapiConfigured()) {
        return { exists: false };
    }

    try {
        const normalizedPhone = normalizePhone(phone, 'whapi');
        console.log(`[Whapi] Fetching profile for ${normalizedPhone}...`);

        const response = await whapiApi.get(`/contacts/${normalizedPhone}/profile`);
        const data = response.data;

        // Log raw response for debugging (Audit Request)
        console.log(`[Whapi] Profile Response for ${phone}:`, JSON.stringify(data));

        // Whapi returns icon_full, icon, chat_pic, avatar, or image depending on version/context
        // IMPORTANT: Filter empty strings - Whapi sometimes returns "" instead of null
        const candidates = [data?.icon_full, data?.icon, data?.chat_pic, data?.avatar, data?.image];
        const profilePic = candidates.find(url => url && url.length > 10 && url.startsWith('http')) || null;
        const name = data?.name || data?.pushname || null;

        if (!profilePic) {
            console.log(`[Whapi] Profile for ${phone} has no valid avatar. Raw values: icon_full="${data?.icon_full}", icon="${data?.icon}"`);
        }

        return {
            exists: true,
            name,
            profilePic
        };
    } catch (error: any) {
        console.warn(`[Whapi] Failed to get profile for ${phone}:`, error.message);
        return { exists: false };
    }
};

/**
 * Obtener binario de nota de voz
 * GET /media/:id
 */
export const getVoiceMessage = async (mediaId: string): Promise<Buffer | null> => {
    if (!isWhapiConfigured()) return null;

    try {
        console.log(`[Whapi] Fetching voice binary for mediaId ${mediaId.substring(0, 10)}...`);
        // Note: Check if endpoint is /media or /messages/:id/voice. 
        // Debug proved /media/{voiceId} works for retrieving the OGG file.
        const response = await whapiApi.get(`/media/${mediaId}`, {
            responseType: 'arraybuffer'
        });

        console.log(`[Whapi] Voice fetched. Size: ${response.data.length} bytes`);
        return Buffer.from(response.data);
    } catch (error: any) {
        console.error(`[Whapi] Failed to fetch voice for ${mediaId}:`, error.message);
        return null;
    }
};
