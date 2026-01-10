/**
 * Widget Controller - Ara Chat Widget API Handlers
 *
 * Handles all widget-related operations including:
 * - Session management (anonymous → authenticated)
 * - OTP authentication flow
 * - AI chat with Claude
 * - Notifications
 *
 * @see widgetRoutes.ts for route definitions
 */

import { Request, Response } from 'express';
import { supabase } from '../config/supabase';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { WidgetAraService } from '../services/WidgetAraService';

// Initialize Ara service
const araService = new WidgetAraService();

// ============================================
// HELPERS
// ============================================

/**
 * Clean phone number to 10 digits
 */
function cleanupPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    // If starts with 52 (Mexico) and is 12 digits, remove country code
    if (digits.startsWith('52') && digits.length === 12) {
        return digits.slice(2);
    }
    // If starts with 521 (Mexico mobile) and is 13 digits, remove prefix
    if (digits.startsWith('521') && digits.length === 13) {
        return digits.slice(3);
    }
    // If starts with 1 (US/Canada) and is 11 digits, remove country code
    if (digits.startsWith('1') && digits.length === 11) {
        return digits.slice(1);
    }
    return digits.slice(-10); // Last 10 digits
}

/**
 * Hash IP address for privacy
 */
function hashIP(ip: string): string {
    return crypto.createHash('sha256').update(ip + process.env.JWT_SECRET).digest('hex').slice(0, 16);
}

/**
 * Get session from request (header or cookie)
 */
async function getSessionFromRequest(req: Request): Promise<{
    session: any | null;
    error?: string;
}> {
    const sessionToken = req.headers['x-widget-session'] as string ||
        req.cookies?.widget_session;

    if (!sessionToken) {
        return { session: null, error: 'No session token provided' };
    }

    const { data: session, error } = await supabase
        .from('widget_sessions')
        .select('*, client:clients(*)')
        .eq('session_token', sessionToken)
        .gt('expires_at', new Date().toISOString())
        .single();

    if (error || !session) {
        return { session: null, error: 'Invalid or expired session' };
    }

    // Update last activity
    await supabase
        .from('widget_sessions')
        .update({ last_activity_at: new Date().toISOString() })
        .eq('id', session.id);

    return { session };
}

// ============================================
// SESSION MANAGEMENT
// ============================================

/**
 * Create anonymous widget session
 * POST /api/v1/widget/session
 */
export const createSession = async (req: Request, res: Response) => {
    try {
        const { fingerprint, origin } = req.body;
        const userAgent = req.headers['user-agent'] || '';
        const clientIP = req.ip || req.socket.remoteAddress || '';

        // Generate unique session token
        const sessionToken = uuidv4();

        // Create session
        const { data: session, error } = await supabase
            .from('widget_sessions')
            .insert({
                session_token: sessionToken,
                fingerprint: fingerprint || null,
                ip_hash: hashIP(clientIP),
                origin: origin || req.headers.origin || 'unknown',
                user_agent: userAgent.slice(0, 500),
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
            })
            .select()
            .single();

        if (error) {
            console.error('[Widget] Session creation error:', error);
            return res.status(500).json({ success: false, error: 'Error creating session' });
        }

        res.json({
            success: true,
            sessionToken,
            isAuthenticated: false,
            expiresAt: session.expires_at
        });

    } catch (err: any) {
        console.error('[Widget] Create session error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

/**
 * Get current session status
 * GET /api/v1/widget/session
 */
export const getSessionStatus = async (req: Request, res: Response) => {
    try {
        const { session, error } = await getSessionFromRequest(req);

        if (!session) {
            return res.status(401).json({
                success: false,
                error: error || 'Session not found',
                isAuthenticated: false
            });
        }

        res.json({
            success: true,
            isAuthenticated: !!session.client_id,
            client: session.client ? {
                id: session.client.id,
                name: session.client.name,
                email: session.client.email,
                phone: session.client.phone
            } : null,
            conversationId: session.conversation_id,
            expiresAt: session.expires_at
        });

    } catch (err: any) {
        console.error('[Widget] Get session status error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ============================================
// AUTHENTICATION
// ============================================

/**
 * Send OTP for widget authentication
 * POST /api/v1/widget/auth/send-otp
 */
export const sendWidgetOTP = async (req: Request, res: Response) => {
    try {
        const { session, error: sessionError } = await getSessionFromRequest(req);
        if (!session) {
            return res.status(401).json({ success: false, error: sessionError });
        }

        const { identifier } = req.body;
        if (!identifier) {
            return res.status(400).json({ success: false, error: 'Email o teléfono requerido' });
        }

        const isEmail = identifier.includes('@');
        let cleanIdentifier = identifier.trim();
        if (isEmail) {
            cleanIdentifier = cleanIdentifier.toLowerCase();
        } else {
            cleanIdentifier = cleanupPhone(identifier);
        }

        // Check if user exists locally or in Shopify
        let client = null;
        const query = supabase.from('clients').select('id, name, email, phone').eq('is_active', true);

        if (isEmail) {
            query.eq('email', cleanIdentifier);
        } else {
            query.ilike('phone', `%${cleanIdentifier}%`);
        }

        const { data: existingClient } = await query.maybeSingle();
        client = existingClient;

        if (!client) {
            // Check Shopify
            const { findShopifyCustomerByEmail, findShopifyCustomerByPhone } = await import('../services/shopifyAdminService');
            const shopifyCustomer = isEmail
                ? await findShopifyCustomerByEmail(cleanIdentifier)
                : await findShopifyCustomerByPhone(cleanIdentifier);

            if (shopifyCustomer) {
                console.log(`[Widget] Found user in Shopify: ${shopifyCustomer.email}`);
                client = { name: `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim() };
            } else {
                // New user - will be created on verify
                client = { name: 'Nuevo Usuario' };
            }
        }

        // Generate 6-digit code
        const code = crypto.randomInt(100000, 999999).toString();
        const expiresAt = new Date(Date.now() + 10 * 60000); // 10 minutes

        // Determine channel
        let channel = 'email';
        if (!isEmail) {
            const { checkWhapiStatus, checkPhoneExists } = await import('../services/whapiService');
            const whapiStatus = await checkWhapiStatus();

            if (whapiStatus.configured && whapiStatus.connected && await checkPhoneExists(cleanIdentifier)) {
                channel = 'whatsapp';
            } else {
                channel = 'sms';
            }
        }

        // Save OTP
        const { error: otpError } = await supabase
            .from('otp_codes')
            .upsert({
                identifier: cleanIdentifier,
                code,
                channel,
                expires_at: expiresAt.toISOString(),
                attempts: 0
            });

        if (otpError) {
            console.error('[Widget] OTP save error:', otpError);
            return res.status(500).json({ success: false, error: 'Error guardando código' });
        }

        // Send code
        let sendResult = { success: false, error: '' };

        if (channel === 'email') {
            const { sendDataEmail } = await import('../services/emailService');
            const emailRes = await sendDataEmail(
                cleanIdentifier,
                'Tu código de verificación - Ara Chat',
                `<div style="font-family: Arial, sans-serif; color: #333;">
                    <h2>Verificación Ara Chat</h2>
                    <p>Hola ${client?.name || 'Cliente'},</p>
                    <p>Usa este código para acceder al chat de Ara:</p>
                    <div style="background: linear-gradient(135deg, #4F46E5, #7C3AED); padding: 20px; text-align: center; border-radius: 12px; margin: 20px 0;">
                        <span style="color: white; font-size: 32px; font-weight: bold; letter-spacing: 8px;">${code}</span>
                    </div>
                    <p style="color: #666; font-size: 14px;">El código expira en 10 minutos.</p>
                </div>`
            );
            sendResult = { success: emailRes.success, error: emailRes.error ? String(emailRes.error) : '' };
        } else if (channel === 'whatsapp') {
            const { sendWhatsAppMessage } = await import('../services/whapiService');
            const waRes = await sendWhatsAppMessage({
                to: cleanIdentifier,
                body: `*${code}* es tu código para Ara Chat de Extractos EUM.`
            });
            sendResult = { success: waRes.sent, error: waRes.error || '' };
        } else if (channel === 'sms') {
            const { sendSMS, makeVoiceCall } = await import('../services/twilioService');
            const smsRes = await sendSMS(cleanIdentifier, `${code} es tu código para Ara Chat EUM.`);

            if (smsRes.success) {
                sendResult = { success: true, error: '' };
            } else {
                // Fallback to voice call
                console.log(`[Widget] SMS failed, trying voice call...`);
                const voiceRes = await makeVoiceCall(cleanIdentifier, code);
                sendResult = voiceRes.success
                    ? { success: true, error: '' }
                    : { success: false, error: `SMS: ${smsRes.error} | Voice: ${voiceRes.error}` };
                if (voiceRes.success) channel = 'voice';
            }
        }

        if (!sendResult.success) {
            console.error(`[Widget] OTP send failed via ${channel}:`, sendResult.error);
            return res.status(500).json({ success: false, error: `Error enviando código: ${sendResult.error}` });
        }

        res.json({
            success: true,
            message: `Código enviado por ${channel}`,
            channel
        });

    } catch (err: any) {
        console.error('[Widget] Send OTP error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

/**
 * Verify OTP and link session to client
 * POST /api/v1/widget/auth/verify-otp
 */
export const verifyWidgetOTP = async (req: Request, res: Response) => {
    try {
        const { session, error: sessionError } = await getSessionFromRequest(req);
        if (!session) {
            return res.status(401).json({ success: false, error: sessionError });
        }

        const { identifier, code } = req.body;
        if (!identifier || !code) {
            return res.status(400).json({ success: false, error: 'Código y usuario requeridos' });
        }

        const isEmail = identifier.includes('@');
        let cleanIdentifier = identifier.trim();
        if (isEmail) {
            cleanIdentifier = cleanIdentifier.toLowerCase();
        } else {
            cleanIdentifier = cleanupPhone(identifier);
        }

        // Get OTP record
        const { data: record, error } = await supabase
            .from('otp_codes')
            .select('*')
            .eq('identifier', cleanIdentifier)
            .single();

        if (error || !record) {
            return res.status(400).json({ success: false, error: 'Código inválido o expirado' });
        }

        // Validate expiry
        if (new Date(record.expires_at) < new Date()) {
            return res.status(400).json({ success: false, error: 'Código expirado. Solicita uno nuevo.' });
        }

        // Validate attempts
        if (record.attempts >= 5) {
            return res.status(400).json({ success: false, error: 'Demasiados intentos. Solicita nuevo código.' });
        }

        // Compare code
        if (record.code !== code) {
            await supabase.from('otp_codes').update({ attempts: record.attempts + 1 }).eq('identifier', cleanIdentifier);
            return res.status(400).json({ success: false, error: 'Código incorrecto' });
        }

        // === SUCCESS ===

        // Get or create client
        let query = supabase.from('clients').select('*');
        if (isEmail) {
            query = query.eq('email', cleanIdentifier);
        } else {
            query = query.ilike('phone', `%${cleanIdentifier}%`);
        }

        let { data: client } = await query.maybeSingle();

        if (!client) {
            // Create new client
            const { findShopifyCustomerByEmail, findShopifyCustomerByPhone, createShopifyCustomer } = await import('../services/shopifyAdminService');

            let shopifyCustomer = null;
            try {
                shopifyCustomer = await createShopifyCustomer(cleanIdentifier, isEmail);
            } catch (err) {
                shopifyCustomer = isEmail
                    ? await findShopifyCustomerByEmail(cleanIdentifier)
                    : await findShopifyCustomerByPhone(cleanIdentifier);
            }

            const newClientData: any = {
                name: shopifyCustomer ? `${shopifyCustomer.first_name || ''} ${shopifyCustomer.last_name || ''}`.trim() || 'Nuevo Usuario' : 'Nuevo Usuario',
                is_active: true,
                shopify_customer_id: shopifyCustomer?.id?.toString() || null,
                role: 'client'
            };

            if (isEmail) {
                newClientData.email = cleanIdentifier;
            } else {
                newClientData.phone = cleanIdentifier;
                newClientData.email = `phone.${cleanIdentifier}@placeholder.com`;
            }

            const { data: newClient, error: createError } = await supabase
                .from('clients')
                .insert(newClientData)
                .select()
                .single();

            if (createError || !newClient) {
                console.error('[Widget] Client creation failed:', createError);
                return res.status(500).json({ success: false, error: 'Error creando usuario' });
            }

            client = newClient;
            console.log(`[Widget] New client created: ${client.id}`);
        }

        // Get or create widget conversation
        const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('client_id', client.id)
            .eq('channel', 'WIDGET')
            .eq('status', 'active')
            .single();

        let conversationId = existingConv?.id;

        if (!conversationId) {
            // Get widget channel chip for routing
            const { data: chip } = await supabase
                .from('channel_chips')
                .select('default_entry_column_id')
                .eq('channel_id', session.origin?.includes('shopify') ? 'widget_shopify' : 'widget_ara')
                .single();

            const { data: newConv, error: convError } = await supabase
                .from('conversations')
                .insert({
                    client_id: client.id,
                    channel: 'WIDGET',
                    contact_handle: cleanIdentifier,
                    status: 'active',
                    column_id: chip?.default_entry_column_id || null,
                    widget_session_id: session.id,
                    platform: 'widget',
                    traffic_source: session.origin?.includes('shopify') ? 'shopify' : 'direct'
                })
                .select()
                .single();

            if (convError) {
                console.error('[Widget] Conversation creation error:', convError);
            } else {
                conversationId = newConv.id;
            }
        }

        // Link session to client and conversation
        await supabase
            .from('widget_sessions')
            .update({
                client_id: client.id,
                conversation_id: conversationId,
                authenticated_at: new Date().toISOString()
            })
            .eq('id', session.id);

        // Clear OTP
        await supabase.from('otp_codes').delete().eq('identifier', cleanIdentifier);

        // Update client last login
        await supabase.from('clients').update({
            last_login_at: new Date().toISOString(),
            last_verified_at: new Date().toISOString()
        }).eq('id', client.id);

        res.json({
            success: true,
            client: {
                id: client.id,
                name: client.name,
                email: client.email,
                phone: client.phone
            },
            conversationId
        });

    } catch (err: any) {
        console.error('[Widget] Verify OTP error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ============================================
// CONVERSATION & MESSAGING
// ============================================

/**
 * Get or create conversation for authenticated user
 * GET /api/v1/widget/conversation
 */
export const getConversation = async (req: Request, res: Response) => {
    try {
        const { session, error } = await getSessionFromRequest(req);
        if (!session?.client_id) {
            return res.status(401).json({ success: false, error: error || 'Not authenticated' });
        }

        // Get existing conversation
        if (session.conversation_id) {
            const { data: conversation } = await supabase
                .from('conversations')
                .select('id, channel, status, created_at')
                .eq('id', session.conversation_id)
                .single();

            if (conversation) {
                return res.json({ success: true, conversation });
            }
        }

        // Create new conversation if none exists
        const { data: chip } = await supabase
            .from('channel_chips')
            .select('default_entry_column_id')
            .eq('channel_id', 'widget_ara')
            .single();

        const { data: newConv, error: convError } = await supabase
            .from('conversations')
            .insert({
                client_id: session.client_id,
                channel: 'WIDGET',
                contact_handle: session.client?.email || session.client?.phone || 'widget',
                status: 'active',
                column_id: chip?.default_entry_column_id || null,
                widget_session_id: session.id,
                platform: 'widget'
            })
            .select()
            .single();

        if (convError) {
            console.error('[Widget] Conversation creation error:', convError);
            return res.status(500).json({ success: false, error: 'Error creating conversation' });
        }

        // Update session with conversation ID
        await supabase
            .from('widget_sessions')
            .update({ conversation_id: newConv.id })
            .eq('id', session.id);

        res.json({ success: true, conversation: newConv });

    } catch (err: any) {
        console.error('[Widget] Get conversation error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

/**
 * Send message to Ara (AI assistant)
 * POST /api/v1/widget/message
 */
export const sendMessage = async (req: Request, res: Response) => {
    try {
        const { session, error } = await getSessionFromRequest(req);
        if (!session?.client_id) {
            return res.status(401).json({ success: false, error: error || 'Not authenticated' });
        }

        const { message } = req.body;
        if (!message || typeof message !== 'string' || message.trim().length === 0) {
            return res.status(400).json({ success: false, error: 'Message required' });
        }

        // Rate limiting: max 10 messages per minute
        const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
        const { count } = await supabase
            .from('crm_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', session.conversation_id)
            .eq('direction', 'inbound')
            .gte('created_at', oneMinuteAgo);

        if (count && count >= 10) {
            return res.status(429).json({ success: false, error: 'Demasiados mensajes. Espera un momento.' });
        }

        // Send to Ara service
        const result = await araService.chat(message.trim(), {
            clientId: session.client_id,
            conversationId: session.conversation_id,
            sessionId: session.id,
            customerPhone: session.client?.phone,
            customerEmail: session.client?.email,
            customerName: session.client?.name
        });

        res.json({
            success: true,
            userMessage: result.userMessage,
            araResponse: result.araResponse
        });

    } catch (err: any) {
        console.error('[Widget] Send message error:', err);
        res.status(500).json({ success: false, error: 'Error processing message' });
    }
};

/**
 * Get message history (paginated)
 * GET /api/v1/widget/messages
 */
export const getMessages = async (req: Request, res: Response) => {
    try {
        const { session, error } = await getSessionFromRequest(req);
        if (!session?.client_id) {
            return res.status(401).json({ success: false, error: error || 'Not authenticated' });
        }

        if (!session.conversation_id) {
            return res.json({ success: true, messages: [] });
        }

        const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
        const before = req.query.before as string;

        let query = supabase
            .from('crm_messages')
            .select('id, content, direction, channel, created_at, message_type, raw_payload')
            .eq('conversation_id', session.conversation_id)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (before) {
            const { data: beforeMsg } = await supabase
                .from('crm_messages')
                .select('created_at')
                .eq('id', before)
                .single();

            if (beforeMsg) {
                query = query.lt('created_at', beforeMsg.created_at);
            }
        }

        const { data: messages, error: msgError } = await query;

        if (msgError) {
            console.error('[Widget] Get messages error:', msgError);
            return res.status(500).json({ success: false, error: 'Error fetching messages' });
        }

        // Reverse to show oldest first
        res.json({
            success: true,
            messages: (messages || []).reverse().map(m => ({
                id: m.id,
                content: m.content,
                role: m.direction === 'inbound' ? 'user' : 'assistant',
                createdAt: m.created_at,
                type: m.message_type
            }))
        });

    } catch (err: any) {
        console.error('[Widget] Get messages error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ============================================
// NOTIFICATIONS
// ============================================

/**
 * Get notifications for authenticated user
 * GET /api/v1/widget/notifications
 */
export const getNotifications = async (req: Request, res: Response) => {
    try {
        const { session, error } = await getSessionFromRequest(req);
        if (!session?.client_id) {
            return res.status(401).json({ success: false, error: error || 'Not authenticated' });
        }

        const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
        const unreadOnly = req.query.unread_only === 'true';

        let query = supabase
            .from('client_notifications')
            .select('*')
            .eq('client_id', session.client_id)
            .eq('is_archived', false)
            .order('created_at', { ascending: false })
            .limit(limit);

        if (unreadOnly) {
            query = query.eq('is_read', false);
        }

        const { data: notifications, error: notifError } = await query;

        if (notifError) {
            console.error('[Widget] Get notifications error:', notifError);
            return res.status(500).json({ success: false, error: 'Error fetching notifications' });
        }

        res.json({ success: true, notifications: notifications || [] });

    } catch (err: any) {
        console.error('[Widget] Get notifications error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

/**
 * Get unread notification count
 * GET /api/v1/widget/notifications/count
 */
export const getNotificationCount = async (req: Request, res: Response) => {
    try {
        const { session, error } = await getSessionFromRequest(req);
        if (!session?.client_id) {
            return res.status(401).json({ success: false, error: error || 'Not authenticated' });
        }

        const { count, error: countError } = await supabase
            .from('client_notifications')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', session.client_id)
            .eq('is_read', false)
            .eq('is_archived', false);

        if (countError) {
            console.error('[Widget] Get notification count error:', countError);
            return res.status(500).json({ success: false, error: 'Error counting notifications' });
        }

        res.json({ success: true, count: count || 0 });

    } catch (err: any) {
        console.error('[Widget] Get notification count error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

/**
 * Mark notification as read
 * PATCH /api/v1/widget/notifications/:id/read
 */
export const markNotificationRead = async (req: Request, res: Response) => {
    try {
        const { session, error } = await getSessionFromRequest(req);
        if (!session?.client_id) {
            return res.status(401).json({ success: false, error: error || 'Not authenticated' });
        }

        const { id } = req.params;

        const { error: updateError } = await supabase
            .from('client_notifications')
            .update({
                is_read: true,
                read_at: new Date().toISOString()
            })
            .eq('id', id)
            .eq('client_id', session.client_id); // Security: only own notifications

        if (updateError) {
            console.error('[Widget] Mark notification read error:', updateError);
            return res.status(500).json({ success: false, error: 'Error updating notification' });
        }

        res.json({ success: true });

    } catch (err: any) {
        console.error('[Widget] Mark notification read error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};

// ============================================
// APP AUTH LINKING
// ============================================

/**
 * Link widget session with existing app authentication
 * POST /api/v1/widget/auth/link
 *
 * If user is already logged into the main app, they can skip OTP
 * by providing their JWT token from the app.
 */
export const linkWithAppAuth = async (req: Request, res: Response) => {
    try {
        const { session, error: sessionError } = await getSessionFromRequest(req);
        if (!session) {
            return res.status(401).json({ success: false, error: sessionError });
        }

        // Already authenticated via widget
        if (session.client_id) {
            return res.json({
                success: true,
                client: {
                    id: session.client.id,
                    name: session.client.name,
                    email: session.client.email,
                    phone: session.client.phone
                },
                conversationId: session.conversation_id
            });
        }

        // Get JWT from Authorization header
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, error: 'No app token provided' });
        }

        const token = authHeader.slice(7);

        // Verify JWT
        const jwt = await import('jsonwebtoken');
        let decoded: any;
        try {
            decoded = jwt.default.verify(token, process.env.JWT_SECRET!);
        } catch (jwtErr) {
            return res.status(401).json({ success: false, error: 'Invalid app token' });
        }

        // Get client from token
        const clientId = decoded.sub || decoded.userId || decoded.id;
        if (!clientId) {
            return res.status(401).json({ success: false, error: 'Invalid token payload' });
        }

        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', clientId)
            .eq('is_active', true)
            .single();

        if (clientError || !client) {
            return res.status(404).json({ success: false, error: 'Client not found' });
        }

        // Get or create widget conversation
        const { data: existingConv } = await supabase
            .from('conversations')
            .select('id')
            .eq('client_id', client.id)
            .eq('channel', 'WIDGET')
            .eq('status', 'active')
            .single();

        let conversationId = existingConv?.id;

        if (!conversationId) {
            const { data: chip } = await supabase
                .from('channel_chips')
                .select('default_entry_column_id')
                .eq('channel_id', session.origin?.includes('shopify') ? 'widget_shopify' : 'widget_ara')
                .single();

            const { data: newConv, error: convError } = await supabase
                .from('conversations')
                .insert({
                    client_id: client.id,
                    channel: 'WIDGET',
                    contact_handle: client.email || client.phone || 'widget',
                    status: 'active',
                    column_id: chip?.default_entry_column_id || null,
                    widget_session_id: session.id,
                    platform: 'widget',
                    traffic_source: session.origin?.includes('shopify') ? 'shopify' : 'direct'
                })
                .select()
                .single();

            if (!convError && newConv) {
                conversationId = newConv.id;
            }
        }

        // Link session to client
        await supabase
            .from('widget_sessions')
            .update({
                client_id: client.id,
                conversation_id: conversationId,
                authenticated_at: new Date().toISOString()
            })
            .eq('id', session.id);

        console.log(`[Widget] Session ${session.id} linked to client ${client.id} via app auth`);

        res.json({
            success: true,
            client: {
                id: client.id,
                name: client.name,
                email: client.email,
                phone: client.phone
            },
            conversationId
        });

    } catch (err: any) {
        console.error('[Widget] Link with app auth error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
};
