import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// Configure transporter
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

const COMPANY_WEBSITE = process.env.COMPANY_WEBSITE || 'https://extractoseum.com';
const APP_BASE_URL = process.env.APP_BASE_URL || 'https://coa.extractoseum.com';
const LOGO_URL = `${APP_BASE_URL}/logo_full.svg`; // Public root asset
const BRAND_COLOR = '#4F46E5';
const ACCENT_COLOR = '#D4AF37';

/**
 * Base template for emails
 */
const getBaseTemplate = (content: string, title: string) => `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
        .container { max-width: 600px; mx-auto; padding: 20px; border: 1px solid #eee; border-radius: 12px; margin: 20px auto; }
        .header { text-align: center; padding-bottom: 20px; border-bottom: 2px solid ${BRAND_COLOR}; }
        .logo { width: 180px; height: auto; }
        .content { padding: 30px 20px; text-align: center; }
        .title { color: #1a1a1a; font-size: 24px; font-weight: bold; margin-bottom: 10px; }
        .message { font-size: 16px; color: #4a5568; margin-bottom: 30px; }
        .button { display: inline-block; padding: 12px 24px; background-color: ${BRAND_COLOR}; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: bold; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #a0aec0; }
        .footer-links { margin-top: 10px; }
        .footer-links a { color: #a0aec0; text-decoration: underline; margin: 0 5px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="${LOGO_URL}" alt="Extractos EUM" class="logo">
        </div>
        <div class="content">
            <h1 class="title">${title}</h1>
            <div class="message">${content}</div>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} EXTRACTOS EUM&trade; . Todos los derechos reservados.</p>
            <div class="footer-links">
                <a href="${COMPANY_WEBSITE}">Sitio Web</a>
                <a href="${APP_BASE_URL}/dashboard">Mi Dashboard</a>
            </div>
        </div>
    </div>
</body>
</html>
`;

export const sendDataEmail = async (to: string, subject: string, html: string, options?: { fromName?: string, replyTo?: string }) => {
    try {
        const fromName = options?.fromName || process.env.SMTP_FROM_NAME || 'Extractos EUM';
        const info = await transporter.sendMail({
            from: `"${fromName}" <${process.env.SMTP_USER}>`,
            to,
            replyTo: options?.replyTo,
            subject,
            html,
        });
        console.log('[EmailService] Message sent: %s', info.messageId);
        return { success: true, messageId: info.messageId };
    } catch (error: any) {
        console.error('[EmailService] Error sending email:', error);
        return { success: false, error: error.message };
    }
};

/**
 * Notify user of a new COA assignment via Email
 */
export const sendNewCoaEmail = async (to: string, coaName: string, coaToken: string) => {
    const title = 'Nuevo Certificado Disponible';
    const coaUrl = `${APP_BASE_URL}/coa/${coaToken}`;
    const content = `
        Se ha asignado un nuevo Certificado de Análisis (COA) a tu cuenta:<br>
        <strong style="font-size: 18px; color: ${BRAND_COLOR};">${coaName}</strong><br><br>
        Ya puedes consultarlo y verificar su autenticidad desde tu panel o haciendo clic en el siguiente botón:
        <br><br>
        <a href="${coaUrl}" class="button">Ver Certificado</a>
    `;

    return sendDataEmail(to, `[EUM] Nuevo COA: ${coaName}`, getBaseTemplate(content, title));
};

/**
 * Notify user of membership update via Email
 */
export const sendLoyaltyUpdateEmail = async (to: string, tierName: string, type: 'review' | 'active' | 'escalated') => {
    let title = '';
    let message = '';
    let subject = '';

    switch (type) {
        case 'review':
            title = 'Solicitud en Revisión';
            message = 'Hemos recibido tu solicitud para unirte al Club EUM Care. Nuestro equipo la está revisando y te notificaremos en cuanto sea aprobada.';
            subject = '[EUM] Membresía en Revisión';
            break;
        case 'active':
            title = '¡Bienvenido al Club EUM Care!';
            message = 'Tu solicitud ha sido aprobada con éxito. Ya eres <strong>Socio Partner</strong> y puedes disfrutar de los beneficios exclusivos.';
            subject = '[EUM] ¡Bienvenido al Club!';
            break;
        case 'escalated':
            title = `¡Has subido a nivel ${tierName}!`;
            message = `Felicidades por tu crecimiento. Tu cuenta ha sido actualizada al nivel <strong>${tierName}</strong>. Revisa tus nuevos beneficios en tu dashboard.`;
            subject = `[EUM] Actualización de Membresía: ${tierName}`;
            break;
    }

    const content = `
        ${message}
        <br><br>
        <a href="${APP_BASE_URL}/dashboard" class="button">Ir a mi Dashboard</a>
    `;

    return sendDataEmail(to, subject, getBaseTemplate(content, title));
};

/**
 * Notify user of a new order via Email
 */
export const sendOrderCreatedEmail = async (to: string, orderNumber: string) => {
    const title = '¡Pedido Recibido!';
    const subject = `[EUM] Pedido Recibido: ${orderNumber}`;
    const content = `
        Hemos recibido tu pedido <strong>${orderNumber}</strong> correctamente.<br><br>
        Nuestro equipo ya está trabajando en su preparación. Te notificaremos por este mismo medio en cuanto el paquete sea entregado a la paquetería.
        <br><br>
        <a href="${APP_BASE_URL}/dashboard" class="button">Ver estado del pedido</a>
    `;

    return sendDataEmail(to, subject, getBaseTemplate(content, title));
};

/**
 * Notify user of order shipment via Email
 */
export const sendOrderShippedEmail = async (to: string, orderNumber: string, carrier: string, trackingNumbers: string | string[]) => {
    const guides = Array.isArray(trackingNumbers) ? trackingNumbers : [trackingNumbers];
    const isPlural = guides.length > 1;

    const title = '📦 ¡Tu pedido va en camino!';
    const subject = `[EUM] Pedido Enviado: ${orderNumber}`;

    const trackingHtml = isPlural
        ? `<ul style="list-style: none; padding: 0;">${guides.map(g => `<li style="margin-bottom: 5px;"><strong>Guía:</strong> ${g}</li>`).join('')}</ul>`
        : `<strong>Número de Guía:</strong> ${guides[0]}`;

    const content = `
        ¡Buenas noticias! Tu pedido <strong>${orderNumber}</strong> ha sido enviado.<br><br>
        <strong>Paquetería:</strong> ${carrier}<br>
        ${trackingHtml}<br><br>
        Puedes rastrear tu paquete desde nuestro portal o desde el sitio oficial de la paquetería.
        <br><br>
        <a href="${APP_BASE_URL}/my-orders" class="button">Rastrear mi pedido</a>
    `;

    return sendDataEmail(to, subject, getBaseTemplate(content, title));
};

/**
 * Notify user of a tracking update via Email
 */
export const sendTrackingUpdateEmail = async (to: string, orderNumber: string, statusTitle: string, statusMessage: string) => {
    const title = statusTitle;
    const subject = `[EUM] Actualización de tu pedido: ${orderNumber}`;

    const content = `
        ${statusMessage}<br><br>
        Puedes seguir rastreando tu paquete desde nuestro portal.
        <br><br>
        <a href="${APP_BASE_URL}/my-orders" class="button">Ver seguimiento</a>
    `;

    return sendDataEmail(to, subject, getBaseTemplate(content, title));
};

/**
 * Send email to recover abandoned orders or checkouts
 */
export const sendAbandonedRecoveryEmail = async (to: string, name: string, checkoutUrl: string, orderNumber: string | null = null) => {
    const title = '🛒 ¡No te quedes sin tus productos!';
    const subject = orderNumber ? `[EUM] Completa tu pedido: ${orderNumber}` : `[EUM] Tu carrito te extraña`;

    const content = `
        Hola ${name || 'amigo'},<br><br>
        Notamos que dejaste algunos productos increíbles en tu carrito.
        ${orderNumber ? `Tu pedido <strong>${orderNumber}</strong> está casi listo, solo falta completar el pago para enviarlo.` : 'Están listos y esperándote.'}
        <br><br>
        Hemos guardado tu carrito por tiempo limitado para que puedas finalizar tu compra fácilmente.
        <br><br>
        <a href="${checkoutUrl}" class="button">Finalizar mi compra ahora</a>
        <br><br>
        Si tienes alguna duda, responde a este correo o contáctanos por WhatsApp.
    `;

    return sendDataEmail(to, subject, getBaseTemplate(content, title));
};

// ============================================================================
// ARA EMAIL SERVICE - IMAP/SMTP for CRM Integration
// ============================================================================

import { ImapFlow } from 'imapflow';
import axios from 'axios';
import { simpleParser, ParsedMail } from 'mailparser';
import { supabase } from '../config/supabase';

// Ara's email configuration - read fresh from env
const getAraEmailConfig = () => ({
    user: process.env.ARA_EMAIL_USER || 'ara@extractoseum.com',
    clientId: process.env.ARA_CLIENT_ID,
    clientSecret: process.env.ARA_CLIENT_SECRET,
    refreshToken: process.env.ARA_REFRESH_TOKEN,
    password: process.env.ARA_EMAIL_PASSWORD,
    smtp: {
        host: 'smtp.gmail.com',
        port: 465,
        secure: true
    },
    imap: {
        host: 'imap.gmail.com',
        port: 993,
        tls: true
    }
});

// Log OAuth config status on startup
const ARA_EMAIL_CONFIG = getAraEmailConfig();
console.log(`[AraEmail] Config loaded - User: ${ARA_EMAIL_CONFIG.user}, OAuth: ${!!ARA_EMAIL_CONFIG.refreshToken}, Password: ${!!ARA_EMAIL_CONFIG.password}`);

// Create Ara's transporter (separate from marketing emails)
let araTransporter: nodemailer.Transporter | null = null;

const initAraTransporter = () => {
    // Allow OAuth OR password authentication
    if (!ARA_EMAIL_CONFIG.password && !ARA_EMAIL_CONFIG.refreshToken) {
        console.warn('[AraEmail] No password or OAuth configured - Ara email disabled');
        return null;
    }

    if (ARA_EMAIL_CONFIG.clientId && ARA_EMAIL_CONFIG.refreshToken) {
        araTransporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                type: 'OAuth2',
                user: ARA_EMAIL_CONFIG.user,
                clientId: ARA_EMAIL_CONFIG.clientId,
                clientSecret: ARA_EMAIL_CONFIG.clientSecret,
                refreshToken: ARA_EMAIL_CONFIG.refreshToken
            }
        });
    } else {
        araTransporter = nodemailer.createTransport({
            host: ARA_EMAIL_CONFIG.smtp.host,
            port: ARA_EMAIL_CONFIG.smtp.port,
            secure: ARA_EMAIL_CONFIG.smtp.secure,
            auth: {
                user: ARA_EMAIL_CONFIG.user,
                pass: ARA_EMAIL_CONFIG.password
            },
            tls: { rejectUnauthorized: false }
        });
    }

    araTransporter.verify((error) => {
        if (error) {
            console.error('[AraEmail] SMTP connection error:', error.message);
        } else {
            console.log('[AraEmail] SMTP ready for:', ARA_EMAIL_CONFIG.user);
        }
    });

    return araTransporter;
};

export interface AraEmailMessage {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    cc?: string | string[];
    bcc?: string | string[];
    inReplyTo?: string;
    references?: string;
    attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
}

export interface IncomingEmail {
    messageId: string;
    from: string;
    fromName?: string;
    to: string[];
    cc?: string[];
    subject: string;
    text?: string;
    html?: string;
    date: Date;
    inReplyTo?: string;
    references?: string[];
    attachments?: Array<{ filename: string; contentType: string; size: number }>;
}

/**
 * Send email as Ara
 */
export const sendAraEmail = async (message: AraEmailMessage): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    if (!araTransporter) {
        initAraTransporter();
    }

    if (!araTransporter) {
        return { success: false, error: 'Ara email not configured' };
    }

    try {
        const result = await araTransporter.sendMail({
            from: `"Ara - Extractos EUM" <${ARA_EMAIL_CONFIG.user}>`,
            to: Array.isArray(message.to) ? message.to.join(', ') : message.to,
            cc: message.cc ? (Array.isArray(message.cc) ? message.cc.join(', ') : message.cc) : undefined,
            bcc: message.bcc ? (Array.isArray(message.bcc) ? message.bcc.join(', ') : message.bcc) : undefined,
            subject: message.subject,
            text: message.text,
            html: message.html,
            inReplyTo: message.inReplyTo,
            references: message.references,
            attachments: message.attachments
        });

        console.log('[AraEmail] Sent:', result.messageId, 'to:', message.to);

        await supabase.from('system_logs').insert({
            event_type: 'ara_email_sent',
            category: 'email',
            metadata: { message_id: result.messageId, to: message.to, subject: message.subject }
        });

        return { success: true, messageId: result.messageId };
    } catch (error: any) {
        console.error('[AraEmail] Send error:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Send email and add to CRM conversation
 */
export const sendAraEmailToConversation = async (
    conversationId: string,
    message: AraEmailMessage,
    senderId: string = 'ara'
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    const result = await sendAraEmail(message);

    if (result.success) {
        const content = message.text || message.html || '';

        // Use crm_messages with correct schema
        await supabase.from('crm_messages').insert({
            conversation_id: conversationId,
            direction: 'outbound',
            role: senderId === 'system' ? 'system' : 'assistant',
            message_type: 'text',  // 'email' not in constraint, use 'text' + metadata
            status: 'sent',
            content: content.substring(0, 5000),
            raw_payload: {
                type: 'email',
                email_message_id: result.messageId,
                subject: message.subject,
                to: message.to
            }
        });

        await supabase.from('conversations').update({
            last_message_at: new Date().toISOString(),
            summary: `Email: ${message.subject}`
        }).eq('id', conversationId);
    }

    return result;
};

/**
 * Fetch new emails from IMAP using ImapFlow
 */
export const fetchAraEmails = async (): Promise<IncomingEmail[]> => {
    // Allow OAuth (refreshToken) OR password authentication
    if (!ARA_EMAIL_CONFIG.password && !ARA_EMAIL_CONFIG.refreshToken) {
        console.log('[AraEmail] No password or OAuth configured - skipping email fetch');
        return [];
    }

    const emails: IncomingEmail[] = [];
    let accessToken = '';
    if (ARA_EMAIL_CONFIG.refreshToken) {
        console.log('[AraEmail] Fetching OAuth access token...');
        try {
            const res = await axios.post('https://oauth2.googleapis.com/token', {
                client_id: ARA_EMAIL_CONFIG.clientId,
                client_secret: ARA_EMAIL_CONFIG.clientSecret,
                refresh_token: ARA_EMAIL_CONFIG.refreshToken,
                grant_type: 'refresh_token'
            });
            accessToken = res.data.access_token;
            console.log('[AraEmail] OAuth access token obtained successfully');
        } catch (e: any) {
            console.error('[AraEmail] OAuth token fetch error:', e.response?.data || e.message);
            return []; // Can't proceed without token
        }
    }

    const client = new ImapFlow({
        host: ARA_EMAIL_CONFIG.imap.host,
        port: ARA_EMAIL_CONFIG.imap.port,
        secure: ARA_EMAIL_CONFIG.imap.tls,
        auth: accessToken ? {
            user: ARA_EMAIL_CONFIG.user,
            accessToken: accessToken
        } : {
            user: ARA_EMAIL_CONFIG.user,
            pass: ARA_EMAIL_CONFIG.password
        },
        logger: false,
        tls: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        const lock = await client.getMailboxLock('INBOX');

        try {
            // Search for unseen messages
            const searchResult = await client.search({ seen: false });

            // Handle case where search returns false (no results)
            if (!searchResult || (Array.isArray(searchResult) && searchResult.length === 0)) {
                console.log('[AraEmail] No new emails');
                return emails;
            }

            const unseenUids = Array.isArray(searchResult) ? searchResult : [];

            // Fetch each unseen message
            for (const uid of unseenUids) {
                try {
                    const fetchResult = await client.fetchOne(uid, { source: true });
                    if (!fetchResult || !fetchResult.source) continue;

                    const parsed = await simpleParser(fetchResult.source);

                    const email: IncomingEmail = {
                        messageId: parsed.messageId || `${Date.now()}`,
                        from: parsed.from?.value[0]?.address || '',
                        fromName: parsed.from?.value[0]?.name,
                        to: parsed.to ? (Array.isArray(parsed.to) ? parsed.to.flatMap(t => t.value.map(v => v.address || '')) : parsed.to.value.map(v => v.address || '')) : [],
                        cc: parsed.cc ? (Array.isArray(parsed.cc) ? parsed.cc.flatMap(t => t.value.map(v => v.address || '')) : parsed.cc.value.map(v => v.address || '')) : undefined,
                        subject: parsed.subject || '(No Subject)',
                        text: parsed.text,
                        html: typeof parsed.html === 'string' ? parsed.html : undefined,
                        date: parsed.date || new Date(),
                        inReplyTo: parsed.inReplyTo,
                        references: parsed.references ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references]) : undefined,
                        attachments: parsed.attachments?.map(a => ({
                            filename: a.filename || 'attachment',
                            contentType: a.contentType,
                            size: a.size
                        }))
                    };

                    emails.push(email);

                    // Mark as seen
                    await client.messageFlagsAdd(uid, ['\\Seen']);
                } catch (parseError: any) {
                    console.error('[AraEmail] Parse error:', parseError.message);
                }
            }

            console.log(`[AraEmail] Fetched ${emails.length} new emails`);
        } finally {
            lock.release();
        }
    } catch (error: any) {
        console.error('[AraEmail] IMAP error:', error.message);
    } finally {
        try { await client.logout(); } catch { /* ignore */ }
    }

    return emails;
};

/**
 * Process incoming email and create/update CRM conversation
 */
export const processIncomingAraEmail = async (email: IncomingEmail): Promise<string | null> => {
    console.log(`[AraEmail] Processing from: ${email.from}, subject: ${email.subject}`);

    const senderEmail = email.from.toLowerCase();

    // Find existing conversation
    let { data: existingConv } = await supabase
        .from('conversations')
        .select('id, last_inbound_at')
        .eq('contact_handle', senderEmail)
        .eq('channel', 'EMAIL')
        .single();

    let conversationId: string;
    let previousLastInbound: string | null = null;

    if (existingConv) {
        conversationId = existingConv.id;
        previousLastInbound = existingConv.last_inbound_at;
    } else {
        // Check if client exists
        const { data: client } = await supabase
            .from('clients')
            .select('id, name')
            .eq('email', senderEmail)
            .single();

        // Get the email channel chip for routing
        const { data: emailChip } = await supabase
            .from('channel_chips')
            .select('default_entry_column_id')
            .eq('channel_id', 'email_ara_ghostbuster')
            .single();

        // Fallback to first column if no chip configured
        let targetColumnId = emailChip?.default_entry_column_id;
        if (!targetColumnId) {
            console.log('[AraEmail] No email chip found, using first column as fallback');
            const { data: defaultCol } = await supabase
                .from('crm_columns')
                .select('id')
                .order('position', { ascending: true })
                .limit(1)
                .single();
            targetColumnId = defaultCol?.id || null;
        }

        console.log(`[AraEmail] Creating conversation for ${senderEmail} in column ${targetColumnId}`);

        // Create new conversation with proper column routing
        const { data: newConv, error } = await supabase
            .from('conversations')
            .insert({
                contact_handle: senderEmail,
                contact_name: email.fromName || client?.name || senderEmail.split('@')[0],
                channel: 'EMAIL',
                platform: 'email',
                traffic_source: 'ghostbuster',
                column_id: targetColumnId,
                client_id: client?.id || null,
                summary: `Email: ${email.subject}`,
                facts: { user_email: senderEmail, user_name: email.fromName }
            })
            .select('id')
            .single();

        if (error || !newConv) {
            console.error('[AraEmail] Failed to create conversation:', error);
            return null;
        }

        conversationId = newConv.id;
    }

    // Create message in crm_messages with correct schema
    const messageContent = email.text || email.html || '(Empty email)';

    await supabase.from('crm_messages').insert({
        conversation_id: conversationId,
        direction: 'inbound',
        role: 'user',
        message_type: 'text',  // Use 'text' + raw_payload for email type
        status: 'delivered',
        content: messageContent.substring(0, 10000),
        raw_payload: {
            type: 'email',
            email_message_id: email.messageId,
            subject: email.subject,
            from: email.from,
            from_name: email.fromName,
            has_attachments: (email.attachments?.length || 0) > 0
        }
    });

    const now = new Date().toISOString();
    const updates: any = {
        last_message_at: now,
        summary: `Email: ${email.subject}`
    };

    // Session window logic: only reset last_inbound_at if:
    // 1. No previous session exists (new conversation or null)
    // 2. Previous session has expired (>24h since last_inbound_at)
    const sessionExpired = !previousLastInbound ||
        (Date.now() - new Date(previousLastInbound).getTime()) > 24 * 60 * 60 * 1000;

    if (sessionExpired) {
        updates.last_inbound_at = now;
    }

    await supabase.from('conversations').update(updates).eq('id', conversationId);

    await supabase.from('system_logs').insert({
        event_type: 'ara_email_received',
        category: 'email',
        metadata: { message_id: email.messageId, from: email.from, subject: email.subject, conversation_id: conversationId }
    });

    console.log(`[AraEmail] Processed, conversation: ${conversationId}`);
    return conversationId;
};

// Email polling state
let isPollingEmails = false;
let emailPollInterval: NodeJS.Timeout | null = null;

/**
 * Start polling for new emails
 */
export const startEmailPolling = (intervalMs: number = 60000): void => {
    if (isPollingEmails) {
        console.log('[AraEmail] Already polling');
        return;
    }

    if (!ARA_EMAIL_CONFIG.password && !ARA_EMAIL_CONFIG.refreshToken) {
        console.warn('[AraEmail] Cannot start polling - no password or OAuth configured');
        return;
    }

    isPollingEmails = true;
    console.log(`[AraEmail] Starting email polling every ${intervalMs / 1000}s`);

    // Initial fetch
    pollEmails();

    // Set up interval
    emailPollInterval = setInterval(pollEmails, intervalMs);
};

/**
 * Stop email polling
 */
export const stopEmailPolling = (): void => {
    if (emailPollInterval) {
        clearInterval(emailPollInterval);
        emailPollInterval = null;
    }
    isPollingEmails = false;
    console.log('[AraEmail] Email polling stopped');
};

/**
 * Poll and process new emails
 */
const pollEmails = async (): Promise<void> => {
    console.log('[AraEmail] Polling for new emails...');
    try {
        const emails = await fetchAraEmails();
        console.log(`[AraEmail] Poll complete: ${emails.length} new emails found`);
        for (const email of emails) {
            await processIncomingAraEmail(email);
        }
    } catch (error: any) {
        console.error('[AraEmail] Poll error:', error.message, error.stack);
    }
};

/**
 * Get Ara email service status
 */
export const getAraEmailStatus = (): { configured: boolean; polling: boolean; email: string } => {
    return {
        configured: !!(ARA_EMAIL_CONFIG.password || ARA_EMAIL_CONFIG.refreshToken),
        polling: isPollingEmails,
        email: ARA_EMAIL_CONFIG.user
    };
};

// Initialize Ara transporter on module load
initAraTransporter();

// ============================================================================
// BULK EMAIL MARKETING
// ============================================================================

// Rate limiting for bulk emails
const BULK_EMAIL_CONFIG = {
    // Delay between emails (100ms - much faster than WhatsApp since email servers handle volume better)
    MIN_DELAY_MS: 100,
    MAX_DELAY_MS: 300,
    // Batch size before longer pause
    BATCH_SIZE: 50,
    // Pause after each batch (2-5 seconds)
    BATCH_PAUSE_MIN_MS: 2000,
    BATCH_PAUSE_MAX_MS: 5000,
    // Max emails per hour (most SMTP servers allow 500-1000/hour)
    MAX_PER_HOUR: 500
};

let hourlyEmailCount = 0;
let hourlyEmailResetTime = Date.now() + 3600000;

const delayMs = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const getRandomDelayEmail = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

/**
 * Get marketing email template
 */
const getMarketingEmailTemplate = (title: string, message: string, imageUrl?: string): string => {
    const imageHtml = imageUrl ? `
        <div style="margin: 20px 0; text-align: center;">
            <img src="${imageUrl}" alt="${title}" style="max-width: 100%; height: auto; border-radius: 8px;">
        </div>
    ` : '';

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, ${BRAND_COLOR} 0%, #7C3AED 100%); color: #fff; padding: 20px 30px; text-align: center; }
        .logo { width: 160px; height: auto; margin-bottom: 10px; }
        .content { padding: 30px; }
        .title { color: #1a1a1a; font-size: 24px; font-weight: bold; margin-bottom: 15px; text-align: center; }
        .message { font-size: 16px; color: #4a5568; line-height: 1.8; white-space: pre-wrap; }
        .cta-button { display: inline-block; padding: 14px 28px; background: ${BRAND_COLOR}; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: bold; margin-top: 20px; }
        .footer { background: #f8fafc; padding: 20px 30px; text-align: center; font-size: 12px; color: #718096; border-top: 1px solid #e2e8f0; }
        .footer a { color: #718096; }
        .unsubscribe { margin-top: 15px; font-size: 11px; color: #a0aec0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="${LOGO_URL}" alt="Extractos EUM" class="logo">
        </div>
        <div class="content">
            <h1 class="title">${title}</h1>
            ${imageHtml}
            <div class="message">${message.replace(/\n/g, '<br>')}</div>
            <div style="text-align: center;">
                <a href="${APP_BASE_URL}" class="cta-button">Visitar Tienda</a>
            </div>
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} EXTRACTOS EUM™. Todos los derechos reservados.</p>
            <p>
                <a href="${COMPANY_WEBSITE}">Sitio Web</a> ·
                <a href="${APP_BASE_URL}/dashboard">Mi Dashboard</a>
            </p>
            <p class="unsubscribe">
                Recibes este correo porque eres cliente de Extractos EUM.<br>
                Para dejar de recibir correos promocionales, responde con "CANCELAR".
            </p>
        </div>
    </div>
</body>
</html>
`;
};

export interface BulkEmailResult {
    sent: number;
    failed: number;
    errors: string[];
    skippedDueToLimit?: number;
}

/**
 * Send bulk marketing emails via Ara's email (ara@extractoseum.com)
 * Uses rate limiting to avoid SMTP server issues
 */
export const sendBulkMarketingEmail = async (
    emails: string[],
    subject: string,
    title: string,
    message: string,
    notificationId: string,
    imageUrl?: string
): Promise<BulkEmailResult> => {
    if (!araTransporter) {
        initAraTransporter();
    }

    if (!araTransporter) {
        console.error('[BulkEmail] Ara transporter not configured');
        return { sent: 0, failed: emails.length, errors: ['Email service not configured'] };
    }

    console.log(`[BulkEmail] ========== sendBulkMarketingEmail CALLED ==========`);
    console.log(`[BulkEmail] Recipients count: ${emails.length}`);
    console.log(`[BulkEmail] Subject: ${subject}`);
    console.log(`[BulkEmail] NotificationId: ${notificationId}`);

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    let skippedDueToLimit = 0;

    const html = getMarketingEmailTemplate(title, message, imageUrl);
    const textContent = `${title}\n\n${message}\n\n---\nVisita: ${APP_BASE_URL}\n\nExtractos EUM - ${COMPANY_WEBSITE}`;

    const startTime = Date.now();

    for (let i = 0; i < emails.length; i++) {
        const email = emails[i];

        // Check hourly limit
        const now = Date.now();
        if (now >= hourlyEmailResetTime) {
            hourlyEmailCount = 0;
            hourlyEmailResetTime = now + 3600000;
        }

        if (hourlyEmailCount >= BULK_EMAIL_CONFIG.MAX_PER_HOUR) {
            console.warn(`[BulkEmail] Hourly limit reached (${BULK_EMAIL_CONFIG.MAX_PER_HOUR}). Stopping.`);
            skippedDueToLimit = emails.length - i;
            break;
        }

        try {
            const result = await araTransporter.sendMail({
                from: `"Ara - Extractos EUM" <${ARA_EMAIL_CONFIG.user}>`,
                to: email,
                subject: subject,
                text: textContent,
                html: html,
                headers: {
                    'X-Campaign-ID': notificationId,
                    'List-Unsubscribe': `<mailto:${ARA_EMAIL_CONFIG.user}?subject=CANCELAR>`
                }
            });

            sent++;
            hourlyEmailCount++;

            // Log to database
            await supabase.from('system_logs').insert({
                event_type: 'bulk_email_sent',
                category: 'marketing',
                metadata: {
                    notification_id: notificationId,
                    to: email,
                    message_id: result.messageId,
                    subject
                }
            });

            // Log progress every 50 emails
            if ((i + 1) % 50 === 0) {
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                const rate = sent / (elapsed / 60);
                console.log(`[BulkEmail] Progress: ${i + 1}/${emails.length} (${sent} sent, ${failed} failed) - ${rate.toFixed(1)} emails/min`);
            }

        } catch (error: any) {
            failed++;
            const errorMsg = error.message || 'Unknown error';
            errors.push(`${email}: ${errorMsg}`);

            // Log error
            await supabase.from('system_logs').insert({
                event_type: 'bulk_email_failed',
                category: 'marketing',
                metadata: {
                    notification_id: notificationId,
                    to: email,
                    error: errorMsg,
                    subject
                }
            });
        }

        // Rate limiting
        if (i < emails.length - 1) {
            if ((i + 1) % BULK_EMAIL_CONFIG.BATCH_SIZE === 0) {
                const batchPause = getRandomDelayEmail(BULK_EMAIL_CONFIG.BATCH_PAUSE_MIN_MS, BULK_EMAIL_CONFIG.BATCH_PAUSE_MAX_MS);
                console.log(`[BulkEmail] Batch ${Math.floor((i + 1) / BULK_EMAIL_CONFIG.BATCH_SIZE)} complete. Pausing ${Math.round(batchPause / 1000)}s...`);
                await delayMs(batchPause);
            } else {
                const emailDelay = getRandomDelayEmail(BULK_EMAIL_CONFIG.MIN_DELAY_MS, BULK_EMAIL_CONFIG.MAX_DELAY_MS);
                await delayMs(emailDelay);
            }
        }
    }

    const totalTime = Math.round((Date.now() - startTime) / 1000);
    console.log(`[BulkEmail] Complete in ${totalTime}s: ${sent} sent, ${failed} failed${skippedDueToLimit > 0 ? `, ${skippedDueToLimit} skipped (hourly limit)` : ''}`);

    // Update notification record
    await supabase
        .from('push_notifications')
        .update({
            email_sent_count: sent,
            email_failed_count: failed
        })
        .eq('id', notificationId);

    return { sent, failed, errors, skippedDueToLimit };
};

/**
 * Check if bulk email is configured and ready
 */
export const isBulkEmailConfigured = (): boolean => {
    return !!(ARA_EMAIL_CONFIG.password || ARA_EMAIL_CONFIG.refreshToken);
};

// ============================================================================
// EDARKSTORE TICKET SYSTEM
// ============================================================================

/**
 * eDarkStore team recipients for ticket notifications
 */
export const EDARKSTORE_RECIPIENTS = {
    primary: [
        'bbeltran@edarkstore.cl',
        'barze@edarkstore.cl',
        'customer.service.test@edarkstore.cl',
        'mvelarde@edarkstore.cl'
    ],
    // Can add specific team members for different ticket types
    logistics: ['bbeltran@edarkstore.cl', 'barze@edarkstore.cl'],
    customerService: ['customer.service.test@edarkstore.cl', 'mvelarde@edarkstore.cl']
};

export type eDarkStoreTicketType = 'shipping_issue' | 'delivery_problem' | 'package_lost' | 'return_request' | 'general_inquiry' | 'urgent';

export interface eDarkStoreTicket {
    type: eDarkStoreTicketType;
    subject: string;
    description: string;
    orderNumber?: string;
    trackingNumber?: string;
    customerEmail?: string;
    customerName?: string;
    priority?: 'low' | 'normal' | 'high' | 'urgent';
    attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
    additionalRecipients?: string[];
}

/**
 * Get email template for eDarkStore tickets
 */
const geteDarkStoreTicketTemplate = (ticket: eDarkStoreTicket, ticketId: string): string => {
    const priorityColors: Record<string, string> = {
        low: '#6B7280',
        normal: '#3B82F6',
        high: '#F59E0B',
        urgent: '#EF4444'
    };

    const priorityColor = priorityColors[ticket.priority || 'normal'];
    const typeLabels: Record<eDarkStoreTicketType, string> = {
        shipping_issue: '📦 Problema de Envío',
        delivery_problem: '🚚 Problema de Entrega',
        package_lost: '❌ Paquete Extraviado',
        return_request: '↩️ Solicitud de Devolución',
        general_inquiry: '❓ Consulta General',
        urgent: '🚨 URGENTE'
    };

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
        .container { max-width: 650px; margin: 20px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%); color: #fff; padding: 20px 30px; }
        .header h1 { margin: 0; font-size: 20px; }
        .header .ticket-id { font-size: 12px; opacity: 0.9; margin-top: 5px; }
        .priority-badge { display: inline-block; padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: bold; background: ${priorityColor}; color: #fff; margin-left: 10px; }
        .content { padding: 30px; }
        .type-badge { display: inline-block; padding: 6px 14px; background: #EEF2FF; color: #4F46E5; border-radius: 6px; font-weight: 600; margin-bottom: 20px; }
        .field { margin-bottom: 15px; }
        .field-label { font-size: 12px; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
        .field-value { font-size: 15px; color: #1F2937; }
        .description { background: #F9FAFB; border-left: 4px solid #4F46E5; padding: 15px; margin: 20px 0; border-radius: 0 8px 8px 0; }
        .footer { background: #F9FAFB; padding: 15px 30px; text-align: center; font-size: 12px; color: #6B7280; border-top: 1px solid #E5E7EB; }
        .order-box { background: #FEF3C7; border: 1px solid #F59E0B; border-radius: 8px; padding: 12px 15px; margin: 15px 0; }
        .order-box strong { color: #92400E; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>
                Nuevo Ticket de Soporte
                <span class="priority-badge">${(ticket.priority || 'normal').toUpperCase()}</span>
            </h1>
            <div class="ticket-id">Ticket ID: ${ticketId}</div>
        </div>
        <div class="content">
            <div class="type-badge">${typeLabels[ticket.type]}</div>

            <h2 style="margin-top: 0; color: #1F2937;">${ticket.subject}</h2>

            ${ticket.orderNumber || ticket.trackingNumber ? `
            <div class="order-box">
                ${ticket.orderNumber ? `<div><strong>📋 Pedido:</strong> ${ticket.orderNumber}</div>` : ''}
                ${ticket.trackingNumber ? `<div><strong>🔍 Tracking:</strong> ${ticket.trackingNumber}</div>` : ''}
            </div>
            ` : ''}

            ${ticket.customerName || ticket.customerEmail ? `
            <div class="field">
                <div class="field-label">Cliente</div>
                <div class="field-value">
                    ${ticket.customerName || 'N/A'}
                    ${ticket.customerEmail ? `<br><a href="mailto:${ticket.customerEmail}">${ticket.customerEmail}</a>` : ''}
                </div>
            </div>
            ` : ''}

            <div class="description">
                <div class="field-label">Descripción del Problema</div>
                <p style="margin: 10px 0 0 0; white-space: pre-wrap;">${ticket.description}</p>
            </div>
        </div>
        <div class="footer">
            <p>Este ticket fue generado automáticamente por el sistema EUM CRM</p>
            <p>Para responder, envía un email a <a href="mailto:ara@extractoseum.com">ara@extractoseum.com</a> con el ID de ticket en el asunto</p>
        </div>
    </div>
</body>
</html>
`;
};

/**
 * Generate unique ticket ID
 */
const generateTicketId = (): string => {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `EDS-${timestamp}-${random}`;
};

/**
 * Send ticket to eDarkStore team
 */
export const sendeDarkStoreTicket = async (
    ticket: eDarkStoreTicket
): Promise<{ success: boolean; ticketId?: string; error?: string }> => {
    if (!araTransporter) {
        initAraTransporter();
    }

    if (!araTransporter) {
        return { success: false, error: 'Email service not configured' };
    }

    const ticketId = generateTicketId();

    // Determine recipients based on ticket type
    let recipients: string[];
    if (ticket.type === 'urgent' || ticket.priority === 'urgent') {
        recipients = [...EDARKSTORE_RECIPIENTS.primary]; // All recipients for urgent
    } else if (ticket.type === 'shipping_issue' || ticket.type === 'delivery_problem' || ticket.type === 'package_lost') {
        recipients = [...EDARKSTORE_RECIPIENTS.logistics];
    } else {
        recipients = [...EDARKSTORE_RECIPIENTS.customerService];
    }

    // Add any additional recipients
    if (ticket.additionalRecipients?.length) {
        recipients = [...new Set([...recipients, ...ticket.additionalRecipients])];
    }

    const priorityPrefix = ticket.priority === 'urgent' ? '🚨 URGENTE: ' :
        ticket.priority === 'high' ? '⚠️ ' : '';

    const subject = `[EDS Ticket ${ticketId}] ${priorityPrefix}${ticket.subject}`;
    const html = geteDarkStoreTicketTemplate(ticket, ticketId);
    const text = `
Nuevo Ticket de Soporte - ${ticketId}
=====================================
Tipo: ${ticket.type}
Prioridad: ${ticket.priority || 'normal'}
Asunto: ${ticket.subject}
${ticket.orderNumber ? `Pedido: ${ticket.orderNumber}` : ''}
${ticket.trackingNumber ? `Tracking: ${ticket.trackingNumber}` : ''}
${ticket.customerName ? `Cliente: ${ticket.customerName}` : ''}
${ticket.customerEmail ? `Email Cliente: ${ticket.customerEmail}` : ''}

Descripción:
${ticket.description}

---
Este ticket fue generado por el sistema EUM CRM.
Para responder, envía un email a ara@extractoseum.com con el ID de ticket en el asunto.
`;

    try {
        const result = await araTransporter.sendMail({
            from: `"Ara - Extractos EUM Tickets" <${ARA_EMAIL_CONFIG.user}>`,
            to: recipients.join(', '),
            subject,
            text,
            html,
            attachments: ticket.attachments,
            headers: {
                'X-Ticket-ID': ticketId,
                'X-Ticket-Type': ticket.type,
                'X-Ticket-Priority': ticket.priority || 'normal'
            }
        });

        console.log(`[eDarkStore] Ticket ${ticketId} sent to ${recipients.length} recipients`);

        // Save ticket to database for tracking
        await supabase.from('support_tickets').insert({
            ticket_id: ticketId,
            type: ticket.type,
            subject: ticket.subject,
            description: ticket.description,
            priority: ticket.priority || 'normal',
            status: 'open',
            order_number: ticket.orderNumber,
            tracking_number: ticket.trackingNumber,
            customer_email: ticket.customerEmail,
            customer_name: ticket.customerName,
            recipient_type: 'edarkstore',
            recipients,
            external_message_id: result.messageId
        });

        // Log to system
        await supabase.from('system_logs').insert({
            event_type: 'edarkstore_ticket_created',
            category: 'ticket',
            metadata: {
                ticket_id: ticketId,
                type: ticket.type,
                priority: ticket.priority || 'normal',
                order_number: ticket.orderNumber,
                tracking_number: ticket.trackingNumber,
                recipients,
                message_id: result.messageId
            }
        });

        return { success: true, ticketId };
    } catch (error: any) {
        console.error('[eDarkStore] Ticket send error:', error.message);
        return { success: false, error: error.message };
    }
};

/**
 * Create eDarkStore ticket from CRM conversation
 */
export const createeDarkStoreTicketFromConversation = async (
    conversationId: string,
    ticketData: Partial<eDarkStoreTicket>
): Promise<{ success: boolean; ticketId?: string; error?: string }> => {
    // Get conversation details
    const { data: conv } = await supabase
        .from('conversations')
        .select('contact_handle, contact_name, facts, summary')
        .eq('id', conversationId)
        .single();

    if (!conv) {
        return { success: false, error: 'Conversation not found' };
    }

    // Get recent messages for context from crm_messages
    const { data: messages } = await supabase
        .from('crm_messages')
        .select('content, direction, role, created_at')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: false })
        .limit(5);

    const messageContext = messages?.reverse().map(m =>
        `[${m.direction === 'inbound' ? 'Cliente' : 'Agente'}]: ${m.content}`
    ).join('\n\n') || '';

    const ticket: eDarkStoreTicket = {
        type: ticketData.type || 'general_inquiry',
        subject: ticketData.subject || conv.summary || 'Consulta desde CRM',
        description: ticketData.description || `
Contexto de la conversación:
${messageContext}

---
Información adicional:
- Handle: ${conv.contact_handle}
- Nombre: ${conv.contact_name || 'N/A'}
`,
        orderNumber: ticketData.orderNumber || conv.facts?.order_number,
        trackingNumber: ticketData.trackingNumber || conv.facts?.tracking_number,
        customerEmail: conv.contact_handle.includes('@') ? conv.contact_handle : conv.facts?.user_email,
        customerName: conv.contact_name || conv.facts?.user_name,
        priority: ticketData.priority || 'normal',
        additionalRecipients: ticketData.additionalRecipients
    };

    const result = await sendeDarkStoreTicket(ticket);

    if (result.success) {
        // Link ticket to conversation in database
        await supabase.from('support_tickets')
            .update({ conversation_id: conversationId })
            .eq('ticket_id', result.ticketId);

        // Add system message to conversation in crm_messages
        await supabase.from('crm_messages').insert({
            conversation_id: conversationId,
            direction: 'outbound',
            role: 'system',
            message_type: 'event',
            status: 'delivered',
            content: `📧 Ticket enviado a eDarkStore: ${result.ticketId}\nTipo: ${ticket.type}\nPrioridad: ${ticket.priority}`,
            raw_payload: { type: 'ticket_created', ticket_id: result.ticketId }
        });
    }

    return result;
};
