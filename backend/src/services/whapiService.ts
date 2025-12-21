/**
 * Whapi.cloud Service - WhatsApp API Integration
 *
 * Conecta con WhatsApp via Whapi.cloud (sin necesidad de Meta Business API)
 * API Docs: https://whapi.readme.io/reference/sendmessagetext
 */

import axios from 'axios';
import { supabase } from '../config/supabase';

const WHAPI_BASE_URL = 'https://gate.whapi.cloud';
const WHAPI_TOKEN = process.env.WHAPI_TOKEN;

// Rate limit: 1 mensaje por segundo para evitar bloqueos de WhatsApp
const MESSAGE_DELAY_MS = 1000;

const whapiApi = axios.create({
    baseURL: WHAPI_BASE_URL,
    timeout: 30000,
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
export const normalizePhone = (phone: string): string => {
    // Remover todo excepto dígitos
    const clean = phone.replace(/\D/g, '');

    // Si es demasiado corto, retornamos tal cual (mínimo 10 dígitos)
    if (clean.length < 10) return clean;

    // Tomar los últimos 10 dígitos (el número base)
    const base10 = clean.substring(clean.length - 10);

    // Siempre prependeamos 521 para México
    return '521' + base10;
};

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
export const sendWhatsAppMessage = async (msg: WhatsAppMessage): Promise<WhapiResponse> => {
    if (!isWhapiConfigured()) {
        return { sent: false, error: 'WhatsApp no configurado' };
    }

    try {
        const phone = normalizePhone(msg.to);

        console.log(`[Whapi] Sending to ${phone}...`);

        const response = await whapiApi.post('/messages/text', {
            to: phone,
            body: msg.body
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
            const normalizedPhone = normalizePhone(phone);

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
        const normalizedPhone = normalizePhone(phone);
        const response = await whapiApi.head(`/contacts/${normalizedPhone}`);
        return response.status === 200;
    } catch {
        return false;
    }
};

/**
 * Obtener información de contacto
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
        const normalizedPhone = normalizePhone(phone);
        const response = await whapiApi.get(`/contacts/${normalizedPhone}`);
        return {
            exists: true,
            name: response.data?.name || response.data?.pushname,
            profilePic: response.data?.profile_pic
        };
    } catch {
        return { exists: false };
    }
};
