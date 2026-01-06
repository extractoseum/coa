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
import { simpleParser, ParsedMail } from 'mailparser';
import { supabase } from '../config/supabase';

// Ara's email configuration
const ARA_EMAIL_CONFIG = {
    user: process.env.ARA_EMAIL_USER || 'ara@extractoseum.com',
    password: process.env.ARA_EMAIL_PASSWORD || '',
    smtp: {
        host: process.env.ARA_SMTP_HOST || 'mail.extractoseum.com',
        port: parseInt(process.env.ARA_SMTP_PORT || '465'),
        secure: true
    },
    imap: {
        host: process.env.ARA_IMAP_HOST || 'mail.extractoseum.com',
        port: parseInt(process.env.ARA_IMAP_PORT || '993'),
        tls: true
    }
};

// Create Ara's transporter (separate from marketing emails)
let araTransporter: nodemailer.Transporter | null = null;

const initAraTransporter = () => {
    if (!ARA_EMAIL_CONFIG.password) {
        console.warn('[AraEmail] No password configured - Ara email disabled');
        return null;
    }

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

        await supabase.from('messages').insert({
            conversation_id: conversationId,
            sender: senderId,
            content: content.substring(0, 5000),
            message_type: 'email',
            metadata: {
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
    if (!ARA_EMAIL_CONFIG.password) {
        return [];
    }

    const emails: IncomingEmail[] = [];
    const client = new ImapFlow({
        host: ARA_EMAIL_CONFIG.imap.host,
        port: ARA_EMAIL_CONFIG.imap.port,
        secure: ARA_EMAIL_CONFIG.imap.tls,
        auth: {
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
        .select('id')
        .eq('contact_handle', senderEmail)
        .eq('channel', 'EMAIL')
        .single();

    let conversationId: string;

    if (existingConv) {
        conversationId = existingConv.id;
    } else {
        // Check if client exists
        const { data: client } = await supabase
            .from('clients')
            .select('id, name')
            .eq('email', senderEmail)
            .single();

        // Create new conversation
        const { data: newConv, error } = await supabase
            .from('conversations')
            .insert({
                contact_handle: senderEmail,
                contact_name: email.fromName || client?.name || senderEmail.split('@')[0],
                channel: 'EMAIL',
                column_id: 'col_nuevos',
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

    // Create message
    const messageContent = email.text || email.html || '(Empty email)';

    await supabase.from('messages').insert({
        conversation_id: conversationId,
        sender: 'client',
        content: messageContent.substring(0, 10000),
        message_type: 'email',
        metadata: {
            email_message_id: email.messageId,
            subject: email.subject,
            from: email.from,
            from_name: email.fromName,
            has_attachments: (email.attachments?.length || 0) > 0
        }
    });

    await supabase.from('conversations').update({
        last_message_at: email.date.toISOString(),
        summary: `Email: ${email.subject}`
    }).eq('id', conversationId);

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

    if (!ARA_EMAIL_CONFIG.password) {
        console.warn('[AraEmail] Cannot start polling - no password configured');
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
    try {
        const emails = await fetchAraEmails();
        for (const email of emails) {
            await processIncomingAraEmail(email);
        }
    } catch (error: any) {
        console.error('[AraEmail] Poll error:', error.message);
    }
};

/**
 * Get Ara email service status
 */
export const getAraEmailStatus = (): { configured: boolean; polling: boolean; email: string } => {
    return {
        configured: !!ARA_EMAIL_CONFIG.password,
        polling: isPollingEmails,
        email: ARA_EMAIL_CONFIG.user
    };
};

// Initialize Ara transporter on module load
initAraTransporter();
