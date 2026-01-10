
import { Request, Response } from 'express';
import { CRMService } from '../services/CRMService';
import { getShopifyOrderById, createShopifyPriceRule, createShopifyDiscountCode } from '../services/shopifyService';
import { getVoiceMessage } from '../services/whapiService'; // Phase 69: Audio Fix
import { supabase } from '../config/supabase'; // Phase 69: Storage upload

const crmService = CRMService.getInstance();

export const getOrderDetails = async (req: Request, res: Response): Promise<void> => {
    try {
        const { orderId } = req.params;
        console.log(`[CRM] Fetching details for Shopify Order ID: ${orderId}`);

        // Use ShopifyService directly to get fresh data
        const order = await getShopifyOrderById(orderId);

        if (!order) {
            res.status(404).json({ success: false, error: 'Order not found in Shopify' });
            return;
        }

        res.json({ success: true, data: order });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getColumns = async (req: Request, res: Response): Promise<void> => {
    try {
        const columns = await crmService.getColumns();
        res.json({ success: true, data: columns });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getConversations = async (req: Request, res: Response): Promise<void> => {
    try {
        const conversations = await crmService.getConversations();
        res.json({ success: true, data: conversations });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const moveConversation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId, targetColumnId } = req.body;
        if (!conversationId || !targetColumnId) {
            res.status(400).json({ success: false, error: 'Missing conversationId or targetColumnId' });
            return;
        }
        await crmService.moveConversation(conversationId, targetColumnId);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const handleInbound = async (req: Request, res: Response): Promise<void> => {
    try {
        const payload = req.body;
        console.log('[CRM] Webhook received:', JSON.stringify(payload).substring(0, 500));

        // 0. Check for Status Updates (Delivered/Read)
        if (payload.statuses && Array.isArray(payload.statuses)) {
            console.log(`[CRM] Status updates received: ${payload.statuses.length}`);
            for (const status of payload.statuses) {
                // Determine status: sent, delivered, read, failed
                const s = status.status;
                if (!['sent', 'delivered', 'read', 'failed'].includes(s)) continue;

                // Fire and forget status update
                crmService.updateMessageStatus(status.id, s as any, status.recipient_id || '')
                    .catch(err => console.error('[CRM] Status Update Error:', err));
            }
            res.json({ success: true, processed_statuses: payload.statuses.length });
            return;
        }

        // 1. Check if it's a Whapi.cloud payload (arrays of messages)
        if (payload.messages && Array.isArray(payload.messages)) {
            for (const msg of payload.messages) {
                const handle = msg.chat_id || msg.from;

                // Debug logging for Audio/Voice to trace Role issues
                if (msg.type === 'audio' || msg.type === 'voice' || msg.type === 'ptt') {
                    console.log(`[CRM] [DEBUG-AUDIO] Raw Msg ID: ${msg.id}, Type: ${msg.type}, FromMe (Raw): ${msg.from_me}, ChatID: ${msg.chat_id}, From: ${msg.from}`);
                }

                const fromMe = msg.from_me === true || msg.from_me === 'true';
                console.log(`[CRM] Msg fromMe: ${fromMe}. Type: ${msg.type}`);

                let content = '';
                let type: any = 'text';

                // Basic types
                if (msg.type === 'text') {
                    content = msg.text?.body || '';
                } else if (msg.type === 'image') {
                    const url = msg.image?.link || msg.image?.url || '';
                    const caption = msg.image?.caption || '';
                    content = url ? `[Image](${url}) ${caption}` : `[Foto] ${caption}`;
                    type = 'image';
                } else if (msg.type === 'sticker') {
                    const url = msg.sticker?.link || msg.sticker?.url || '';
                    content = url ? `[Sticker](${url})` : '[Sticker]';
                    type = 'sticker'; // Using specific type if DB supports it, else map to image in service
                } else if (msg.type === 'audio' || msg.type === 'voice') {
                    let url = msg.audio?.link || msg.audio?.url || msg.voice?.link || msg.voice?.url || '';

                    // Phase 69: Server-Side Audio Fetch (Fix for [Audio] text only)
                    if (!url) {
                        try {
                            const mediaId = msg.voice?.id || msg.audio?.id;
                            if (mediaId) {
                                console.log(`[CRM] Audio URL missing for ${msg.id}. Fetching binary for mediaId ${mediaId}...`);
                                const buffer = await getVoiceMessage(mediaId);
                                if (buffer) {
                                    // Fallback to 'images' bucket which exists, using 'voice_inbound' folder
                                    const bucket = process.env.STORAGE_BUCKET_ATTACHMENTS || 'images';
                                    const filename = `voice_inbound/${Date.now()}_${msg.id}.ogg`; // Whapi usually sends OGG/Opus

                                    const { error: uploadError } = await supabase.storage
                                        .from(bucket)
                                        .upload(filename, buffer, { contentType: 'audio/ogg', upsert: false });

                                    if (!uploadError) {
                                        const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(filename);
                                        url = publicData.publicUrl;
                                        console.log(`[CRM] Audio uploaded to Storage: ${url}`);
                                    } else {
                                        console.warn(`[CRM] Storage upload failed: ${uploadError.message}`);
                                    }
                                }
                            } else {
                                console.warn(`[CRM] No voice/audio ID found for msg ${msg.id}`);
                            }
                        } catch (fetchErr) {
                            console.error(`[CRM] Failed to recover audio binary:`, fetchErr);
                        }
                    }

                    content = url ? `[Audio](${url})` : '[Audio]';
                    type = 'audio';
                } else if (msg.type === 'location') {
                    const loc = msg.location;
                    const lat = loc?.latitude;
                    const long = loc?.longitude;
                    const mapLink = `https://www.google.com/maps?q=${lat},${long}`;
                    content = `[Ubicación](${mapLink}) Lat: ${lat}, Long: ${long}`;
                    type = 'file';
                } else if (msg.type === 'contact') {
                    const contacts = msg.contact || [];
                    const names = contacts.map((c: any) => c.name?.formatted_name || c.name).join(', ');
                    content = `[Contacto Compartido]: ${names}`;
                    type = 'text';
                } else if (msg.type === 'poll') {
                    const poll = msg.poll;
                    const title = poll?.title || 'Encuesta';
                    const options = (poll?.options || []).map((o: any) => o.option_name).join(', ');
                    content = `[Encuesta]: ${title} (Opciones: ${options})`;
                    type = 'text';
                } else if (msg.type === 'order') {
                    const order = msg.order;
                    const items = (order?.product_items || []).map((i: any) => `${i.quantity}x ${i.product_retailer_id}`).join(', ');
                    content = `[Pedido WhatsApp]: ${items} (Total: ${order?.total_amount?.value || '?'} ${order?.total_amount?.currency || ''})`;
                    type = 'text';
                } else if (msg.type === 'link_preview') {
                    const preview = msg.link_preview;
                    const url = preview?.url || '';
                    const title = preview?.title || 'Link';
                    const desc = preview?.description ? `\n> ${preview.description}` : '';
                    content = `[Link Preview] [${title}](${url})${desc}`;
                    type = 'text';
                } else if (msg.type === 'action') {
                    if (msg.action?.type === 'reaction') {
                        content = `(Reacción: ${msg.action.emoji})`;
                        type = 'reaction';
                    } else if (msg.action?.type === 'delete') {
                        content = `🚫 This message was deleted.`;
                        type = 'event';
                    } else {
                        content = `[Action: ${msg.action?.type}]`;
                        type = 'event';
                    }
                    // Voice pipeline triggered after DB insert via .then() below
                } else if (msg.type === 'video') {
                    const url = msg.video?.link || msg.video?.url || '';
                    const caption = msg.video?.caption || '';
                    content = url ? `[Video](${url}) ${caption}` : `[Video] ${caption}`;
                    type = 'video';
                } else if (msg.type === 'document' || msg.type === 'file') {
                    const url = msg.document?.link || msg.document?.url || msg.file?.link || msg.file?.url || '';
                    const caption = msg.document?.caption || msg.document?.filename || '';
                    content = url ? `[File](${url}) ${caption}` : `[Archivo] ${caption}`;
                    type = 'file';

                } else if (msg.type === 'button') {
                    content = msg.button?.text || '[Botón]';
                    type = 'button';
                } else if (msg.type === 'interactive') {
                    const interactive = msg.interactive;
                    if (interactive?.type === 'button_reply') {
                        content = interactive.button_reply?.title || '[Respuesta Botón]';
                    } else if (interactive?.type === 'list_reply') {
                        content = interactive.list_reply?.title || '[Respuesta Lista]';
                        if (interactive.list_reply?.description) {
                            content += ` (${interactive.list_reply.description})`;
                        }
                    } else {
                        content = `[Interactivo: ${interactive?.type}]`;
                    }
                    type = 'interactive';
                } else if (msg.type === 'reply') {
                    // This is for quoted replies or button replies processed as 'reply'
                    content = msg.reply?.text || msg.reply?.title || '[Respuesta]';
                    type = 'text'; // Usually contains text
                } else if (msg.type === 'album') {
                    const items = msg.album || [];
                    const count = items.length;
                    const urls = items.map((i: any) => i.image?.link || i.video?.link || i.image?.url || i.video?.url).filter(Boolean);
                    content = `[Álbum: ${count} archivos]\n${urls.map((u: string) => `- ${u}`).join('\n')}`;
                    type = 'file';
                } else if (msg.type === 'sticker') {
                    const url = msg.sticker?.link || msg.sticker?.url || '';
                    content = url ? `[Sticker](${url})` : '[Sticker]';
                    type = 'sticker';
                } else {
                    console.log(`[CRM] Unknown type detected: ${msg.type}. Preserving in content.`);
                    // Preserve as much info as possible for unknown types
                    const rawStr = JSON.stringify(msg[msg.type] || msg).substring(0, 100);
                    content = `[Archivo: ${msg.type}] ${rawStr}`;
                    type = 'file';
                }

                // Skip simple empty, but keep reactions if we want to log them
                if (!content && !msg.type) continue;

                let cleanHandle = handle.replace('@s.whatsapp.net', '').replace('@c.us', '');

                // Fix for Mexico WhatsApp numbers (521 + 10 digits -> 52 + 10 digits)
                if (cleanHandle.startsWith('521') && cleanHandle.length === 13) {
                    cleanHandle = cleanHandle.replace('521', '52');
                }

                // Fire and forget (chained)
                crmService.processInbound(
                    'WA',
                    cleanHandle,
                    content,
                    {
                        ...msg,
                        channel_id: payload.channel_id, // Pass the account ID (from outer payload)
                        type: type, // Normalized type
                        direction: fromMe ? 'outbound' : 'inbound',
                        role: fromMe ? 'assistant' : 'user',
                        _generated_from_me: fromMe,
                        metadata: {
                            original_type: msg.type,
                            context: msg.context || null,
                            whatsapp_id: msg.id
                        }
                    }
                ).then(async (createdMsg: any) => {
                    console.log(`[CRM] processInbound .then() triggered. Type: ${type}, MsgID: ${createdMsg?.id}, HasContent: ${!!createdMsg?.content}`);

                    // Trigger Voice Pipeline if audio and message was created/returned, 
                    // and it has an HTTP link but NO transcript yet.
                    if (createdMsg && type === 'audio' && createdMsg.content.includes('http') && !createdMsg.content.includes('Transcripción')) {
                        console.log('[CRM] Voice condition PASSED. Extracting URL...');
                        const urlMatch = createdMsg.content.match(/\((.*?)\)/);
                        const audioUrl = urlMatch ? urlMatch[1] : null;

                        if (audioUrl) {
                            try {
                                console.log('[CRM] Triggering Voice Pipeline for msg:', createdMsg.id, 'URL:', audioUrl);
                                const audioRes = await fetch(audioUrl);
                                const arrayBuffer = await audioRes.arrayBuffer();
                                const buffer = Buffer.from(arrayBuffer);

                                console.log(`[CRM] Audio downloaded. Buffer size: ${buffer.length}`);
                                const resolvedRole = createdMsg.role === 'assistant' || createdMsg.role === 'system' ? 'assistant' : 'user';
                                console.log(`[CRM] Analyze Voice with Role: ${createdMsg.role} (Resolved: ${resolvedRole})`);

                                const vs = new (require('../services/VoiceService').VoiceService)();
                                await vs.processVoiceMessage(
                                    buffer,
                                    'audio/ogg',
                                    undefined, // Client lookup handled in service if needed
                                    createdMsg.conversation_id,
                                    createdMsg.id,
                                    audioUrl || undefined,
                                    resolvedRole
                                );
                                console.log('[CRM] VoiceService executed successfully.');
                                // Optional: Update message content with transcript here or let Service do it?
                                // We will update Service next to update the CRM message.
                            } catch (ve) {
                                console.error('[CRM] Voice processing failed:', ve);
                            }
                        } else {
                            console.log('[CRM] No Audio URL found in content:', createdMsg.content);
                        }
                    } else {
                        console.log(`[CRM] Voice condition SKIPPED. Type check: ${type}, HTTP check: ${createdMsg?.content?.includes('http')}`);
                    }
                }).catch(err => console.error('[CRM] Background processInbound Error:', err));
            }
            res.json({ success: true, processed: payload.messages.length });
            return;
        }

        // 2. Fallback to legacy/manual format
        const { channel, handle, content, raw } = req.body;
        if (!channel || !handle || !content) {
            res.status(400).json({ success: false, error: 'Missing required fields' });
            return;
        }
        await crmService.processInbound(channel, handle, content, raw || {});
        res.json({ success: true });
    } catch (error: any) {
        console.error('[CRM] handleInbound Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateColumnConfig = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const { mode, config, name, voice_profile, objectives, assigned_agent_id } = req.body;
        if (!id) {
            res.status(400).json({ success: false, error: 'Missing column id' });
            return;
        }
        await crmService.updateColumnConfig(id, { mode, config, name, voice_profile, objectives, assigned_agent_id });
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const createConversation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { channel, handle, column_id } = req.body;
        if (!channel || !handle) {
            res.status(400).json({ success: false, error: 'Missing channel or handle' });
            return;
        }
        const conversation = await crmService.createConversation({ channel, handle, column_id });
        res.json({ success: true, data: conversation });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getMessages = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;
        const messages = await crmService.getMessages(conversationId);
        res.json({ success: true, data: messages });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const sendMessage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;
        const { content, role } = req.body;

        const message = await crmService.appendMessage({
            conversation_id: conversationId,
            direction: 'outbound',
            role: role || 'assistant',
            message_type: 'text',
            status: 'sent',
            content
        });

        res.json({ success: true, data: message });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const sendVoiceMessage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;
        const { content, role } = req.body;

        if (!content) {
            res.status(400).json({ success: false, error: 'Missing content' });
            return;
        }

        const message = await crmService.sendVoiceMessage(conversationId, content, role || 'assistant');
        res.json({ success: true, data: message });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Send internal note (not sent to customer)
 * POST /api/v1/crm/conversations/:conversationId/notes
 */
export const sendInternalNote = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;
        const { content } = req.body;
        const userId = (req as any).user?.id;

        if (!content?.trim()) {
            res.status(400).json({ success: false, error: 'Content is required' });
            return;
        }

        // Insert internal note - use 'event' type with special prefix for backwards compatibility
        // Once migration 069 runs, we can use 'internal_note' type and is_internal column
        const noteContent = `[NOTA INTERNA] ${content.trim()}`;

        const { data: note, error } = await supabase
            .from('crm_messages')
            .insert({
                conversation_id: conversationId,
                direction: 'outbound',
                role: 'system',
                message_type: 'event', // Use 'event' for compatibility, change to 'internal_note' after migration
                status: 'sent',
                content: noteContent,
                // These columns will be added by migration 069:
                // is_internal: true,
                // sent_by_id: userId || null,
            })
            .select('*')
            .single();

        if (error) {
            console.error('[CRM] Internal note error:', error);
            res.status(500).json({ success: false, error: error.message });
            return;
        }

        // Add is_internal flag to response for frontend
        res.json({ success: true, data: { ...note, is_internal: true } });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get internal notes for a conversation
 * GET /api/v1/crm/conversations/:conversationId/notes
 */
export const getInternalNotes = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;

        const { data: notes, error } = await supabase
            .from('crm_messages')
            .select('*, sent_by:sent_by_id(id, name, email)')
            .eq('conversation_id', conversationId)
            .eq('is_internal', true)
            .order('created_at', { ascending: false });

        if (error) {
            res.status(500).json({ success: false, error: error.message });
            return;
        }

        res.json({ success: true, data: notes || [] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Submit AI feedback on a message
 * POST /api/v1/crm/messages/:messageId/feedback
 */
export const submitAIFeedback = async (req: Request, res: Response): Promise<void> => {
    try {
        const { messageId } = req.params;
        const { feedback } = req.body;

        if (!feedback || !['positive', 'negative'].includes(feedback)) {
            res.status(400).json({ success: false, error: 'Valid feedback required (positive/negative)' });
            return;
        }

        const { data, error } = await supabase
            .from('crm_messages')
            .update({
                ai_feedback: feedback,
                ai_feedback_at: new Date().toISOString(),
            })
            .eq('id', messageId)
            .select('id, ai_feedback, ai_feedback_at')
            .single();

        if (error) {
            res.status(500).json({ success: false, error: error.message });
            return;
        }

        // Log for AI learning/analytics
        console.log(`[CRM] AI Feedback: ${feedback} for message ${messageId}`);

        res.json({ success: true, data });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Send message with reply/quote
 * POST /api/v1/crm/conversations/:conversationId/messages/reply
 */
export const sendReplyMessage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;
        const { content, replyToId, role } = req.body;

        if (!content?.trim()) {
            res.status(400).json({ success: false, error: 'Content is required' });
            return;
        }

        // Insert message with reply_to reference
        const { data: message, error } = await supabase
            .from('crm_messages')
            .insert({
                conversation_id: conversationId,
                direction: 'outbound',
                role: role || 'assistant',
                message_type: 'text',
                status: 'sent',
                content: content.trim(),
                reply_to_id: replyToId || null,
            })
            .select('*, reply_to:reply_to_id(id, content, role)')
            .single();

        if (error) {
            res.status(500).json({ success: false, error: error.message });
            return;
        }

        // Dispatch to WhatsApp with reply_to (Whapi supports this)
        if (replyToId) {
            // TODO: Get external_id of original message and pass to Whapi's reply_to parameter
            console.log(`[CRM] Reply message sent, replying to: ${replyToId}`);
        }

        res.json({ success: true, data: message });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Schedule a message to be sent later
 * POST /api/v1/crm/conversations/:conversationId/messages/schedule
 */
export const scheduleMessage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;
        const { content, scheduledFor, isVoice } = req.body;
        const userId = (req as any).user?.id;

        if (!content?.trim()) {
            res.status(400).json({ success: false, error: 'Content is required' });
            return;
        }

        if (!scheduledFor) {
            res.status(400).json({ success: false, error: 'Scheduled time is required' });
            return;
        }

        const scheduledDate = new Date(scheduledFor);
        if (scheduledDate <= new Date()) {
            res.status(400).json({ success: false, error: 'Scheduled time must be in the future' });
            return;
        }

        // Insert scheduled message (status = 'queued')
        const { data: message, error } = await supabase
            .from('crm_messages')
            .insert({
                conversation_id: conversationId,
                direction: 'outbound',
                role: 'assistant',
                message_type: isVoice ? 'audio' : 'text',
                status: 'queued',
                content: content.trim(),
                scheduled_for: scheduledDate.toISOString(),
                sent_by_id: userId || null,
            })
            .select('*')
            .single();

        if (error) {
            console.error('[CRM] Schedule message error:', error);
            res.status(500).json({ success: false, error: error.message });
            return;
        }

        console.log(`[CRM] Message scheduled for ${scheduledDate.toISOString()}: ${message.id}`);

        res.json({ success: true, data: message });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get scheduled messages for a conversation
 * GET /api/v1/crm/conversations/:conversationId/messages/scheduled
 */
export const getScheduledMessages = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;

        const { data: messages, error } = await supabase
            .from('crm_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('status', 'queued')
            .not('scheduled_for', 'is', null)
            .order('scheduled_for', { ascending: true });

        if (error) {
            res.status(500).json({ success: false, error: error.message });
            return;
        }

        res.json({ success: true, data: messages || [] });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Cancel a scheduled message
 * DELETE /api/v1/crm/messages/:messageId/schedule
 */
export const cancelScheduledMessage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { messageId } = req.params;

        // Only delete if message is still queued
        const { data, error } = await supabase
            .from('crm_messages')
            .delete()
            .eq('id', messageId)
            .eq('status', 'queued')
            .select('id')
            .single();

        if (error || !data) {
            res.status(404).json({ success: false, error: 'Scheduled message not found or already sent' });
            return;
        }

        res.json({ success: true, message: 'Scheduled message cancelled' });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const archiveConversation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        await crmService.archiveConversation(id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const deleteConversation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        await crmService.deleteConversation(id);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getContactSnapshot = async (req: Request, res: Response): Promise<void> => {
    try {
        const { handle } = req.params;
        const { channel } = req.query;

        if (!handle) {
            res.status(400).json({ success: false, error: 'Missing handle' });
            return;
        }

        const snapshot = await crmService.getContactSnapshot(handle, String(channel || 'WA'));
        res.json({ success: true, data: snapshot });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get conversation and messages for a specific client (by client_id)
 * Used by Sales Agent Panel during impersonation
 */
export const getClientConversation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { clientId } = req.params;

        if (!clientId) {
            res.status(400).json({ success: false, error: 'Missing clientId' });
            return;
        }

        // 1. Get client info (phone/email)
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('id, phone, email, name')
            .eq('id', clientId)
            .single();

        if (clientError || !client) {
            res.status(404).json({ success: false, error: 'Client not found' });
            return;
        }

        // 2. Find conversation by phone or email
        let conversation = null;

        // Try by phone first (most common for WhatsApp)
        if (client.phone) {
            const cleanPhone = client.phone.replace(/\D/g, '');
            const { data: convByPhone } = await supabase
                .from('conversations')
                .select('*')
                .or(`contact_handle.ilike.%${cleanPhone.slice(-10)}`)
                .order('last_message_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (convByPhone) {
                conversation = convByPhone;
            }
        }

        // If no conversation by phone, try email
        if (!conversation && client.email) {
            const { data: convByEmail } = await supabase
                .from('conversations')
                .select('*')
                .eq('contact_handle', client.email)
                .order('last_message_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (convByEmail) {
                conversation = convByEmail;
            }
        }

        if (!conversation) {
            res.json({
                success: true,
                data: {
                    client,
                    conversation: null,
                    messages: []
                }
            });
            return;
        }

        // 3. Get messages for this conversation
        const messages = await crmService.getMessages(conversation.id);

        res.json({
            success: true,
            data: {
                client,
                conversation,
                messages
            }
        });
    } catch (error: any) {
        console.error('[CRM] getClientConversation error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getClientOrders = async (req: Request, res: Response): Promise<void> => {
    try {
        const { handle } = req.params;
        if (!handle) {
            res.status(400).json({ success: false, error: 'Missing handle' });
            return;
        }
        const orders = await crmService.getClientOrders(handle);
        res.json({ success: true, data: orders });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const createCoupon = async (req: Request, res: Response): Promise<void> => {
    try {
        const { discount, code } = req.body;

        if (!discount || !code) {
            res.status(400).json({ success: false, error: 'Missing discount or code' });
            return;
        }

        const isPercentage = discount.includes('%');
        // Shopify value logic: percentages are like '-15.0', fixed are '-10.0'
        let value = discount.replace('%', '');
        if (!value.startsWith('-')) value = `-${value}`;

        const valueType = isPercentage ? 'percentage' : 'fixed_amount';

        console.log(`[CRM] Creating Shopify Coupon: ${code} (${discount})`);

        // 1. Create Price Rule
        const priceRule = await createShopifyPriceRule({
            title: `CRM_AUTO_${code}_${Date.now()}`,
            target_type: 'line_item',
            target_selection: 'all',
            allocation_method: 'across',
            value_type: valueType as any,
            value: value,
            customer_selection: 'all',
            starts_at: new Date().toISOString()
        });

        // 2. Create Discount Code
        const discountCode = await createShopifyDiscountCode(priceRule.id, code);

        res.json({ success: true, data: discountCode });
    } catch (error: any) {
        console.error('[CRM] Coupon creation error:', error.response?.data || error.message);
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getChannelChips = async (req: Request, res: Response): Promise<void> => {
    try {
        const chips = await crmService.getChannelChips();
        res.json({ success: true, data: chips });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const getMiniChips = async (req: Request, res: Response): Promise<void> => {
    try {
        const chips = await crmService.getMiniChips();
        res.json({ success: true, data: chips });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const upsertMiniChip = async (req: Request, res: Response): Promise<void> => {
    try {
        const chip = await crmService.upsertMiniChip(req.body);
        res.json({ success: true, data: chip });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const upsertChannelChip = async (req: Request, res: Response): Promise<void> => {
    try {
        const chip = await crmService.upsertChannelChip(req.body);
        res.json({ success: true, data: chip });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateContact = async (req: Request, res: Response): Promise<void> => {
    try {
        const { handle } = req.params;
        if (!handle) {
            res.status(400).json({ success: false, error: 'Missing handle' });
            return;
        }
        // Assuming channel WA by default if not provided, or handle logic in service
        const snapshot = await crmService.updateContactSnapshot(handle, 'WA', req.body);
        res.json({ success: true, data: snapshot });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

export const updateConversation = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;
        if (!conversationId) {
            res.status(400).json({ success: false, error: 'Missing conversationId' });
            return;
        }
        // Supports partial updates to root or facts? 
        // For now, if body has 'facts', we update facts specifically using the service method
        // If body has other fields, we could generic update. 
        // IdentityResolutionCard sends { facts: ... } which replaces the whole object or merges?
        // IdentityResolutionCard sends { facts: newFacts } which is the COMPLETE object.
        // But our new service method `updateConversationFacts` does a MERGE.
        // Let's check what the frontend sends.
        // Frontend sends: body: JSON.stringify({ facts: newFacts }) where newFacts is the complete object excluding ambiguity.

        let result;
        if (req.body.facts) {
            // If payload is { facts: ... }, treat keys inside facts as updates if using merge, or replace?
            // The frontend provided the FULL facts object.
            // Our service `updateConversationFacts` does { ...current, ...updates }.
            // If we pass the full object as `updates`, it works fine (overwrites keys, keeps others).
            // However, `updateConversationFacts` expects `updates` to be the fields of facts, not { facts: ... }.
            // Wait, the frontend sends body: { facts: { ... } }
            // So here req.body.facts IS the dictionary of facts.
            result = await crmService.updateConversationFacts(conversationId, req.body.facts);
        } else {
            // Generic update not implemented yet
            res.status(400).json({ success: false, error: 'Only facts update supported via this endpoint currently' });
            return;
        }

        res.json({ success: true, data: result });
    } catch (error: any) {
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Search clients by email, phone, name, or order number
 * Returns clients from the clients table that match the search query
 * Also searches orders by order_number and returns associated clients
 */
export const searchClients = async (req: Request, res: Response): Promise<void> => {
    try {
        const { q } = req.query;
        if (!q || typeof q !== 'string' || q.length < 2) {
            res.status(400).json({ success: false, error: 'Search query must be at least 2 characters' });
            return;
        }

        const searchTerm = q.toLowerCase().trim();
        const rawDigits = searchTerm.replace(/\D/g, '');
        const results: any[] = [];
        const seenClientIds = new Set<string>();

        // 1. Search in clients table by email, phone, or name
        const { data: clients, error: clientsError } = await supabase
            .from('clients')
            .select('id, email, name, phone, tags, shopify_customer_id, created_at, last_login_at, membership_tier')
            .or(`email.ilike.%${searchTerm}%,name.ilike.%${searchTerm}%${rawDigits.length >= 4 ? `,phone.ilike.%${rawDigits}%` : ''}`)
            .order('last_login_at', { ascending: false, nullsFirst: false })
            .limit(15);

        if (clientsError) {
            console.error('[CRM] searchClients clients error:', clientsError);
        }

        // 2. Search orders by order_number (e.g., "EUM_1608", "#1608", "1608")
        // Clean the search term to just get the number portion
        const orderNumberMatch = searchTerm.match(/(\d{3,})/);
        let ordersClients: any[] = [];

        if (orderNumberMatch) {
            const orderNum = orderNumberMatch[1];
            // Search in orders table
            const { data: orders, error: ordersError } = await supabase
                .from('orders')
                .select('id, order_number, client_id, email, total_price, created_at, fulfillment_status, financial_status')
                .or(`order_number.ilike.%${orderNum}%,order_number.ilike.%EUM_${orderNum}%`)
                .limit(10);

            if (!ordersError && orders && orders.length > 0) {
                // Get unique client_ids from orders
                const clientIdsFromOrders = [...new Set(orders.map(o => o.client_id).filter(Boolean))];

                if (clientIdsFromOrders.length > 0) {
                    const { data: orderClients } = await supabase
                        .from('clients')
                        .select('id, email, name, phone, tags, shopify_customer_id, created_at, last_login_at, membership_tier')
                        .in('id', clientIdsFromOrders);

                    if (orderClients) {
                        ordersClients = orderClients.map(c => ({
                            ...c,
                            matched_orders: orders.filter(o => o.client_id === c.id).map(o => ({
                                order_number: o.order_number,
                                total_price: o.total_price,
                                status: o.fulfillment_status || o.financial_status
                            }))
                        }));
                    }
                }

                // Also check by email if no client_id but has email
                const ordersWithEmail = orders.filter(o => !o.client_id && o.email);
                for (const order of ordersWithEmail) {
                    const { data: clientByEmail } = await supabase
                        .from('clients')
                        .select('id, email, name, phone, tags, shopify_customer_id, created_at, last_login_at, membership_tier')
                        .eq('email', order.email)
                        .single();

                    if (clientByEmail && !ordersClients.find(c => c.id === clientByEmail.id)) {
                        ordersClients.push({
                            ...clientByEmail,
                            matched_orders: [{ order_number: order.order_number, total_price: order.total_price, status: order.fulfillment_status || order.financial_status }]
                        });
                    }
                }
            }
        }

        // Combine results, prioritizing order matches
        for (const client of ordersClients) {
            if (!seenClientIds.has(client.id)) {
                seenClientIds.add(client.id);
                results.push(client);
            }
        }

        for (const client of (clients || [])) {
            if (!seenClientIds.has(client.id)) {
                seenClientIds.add(client.id);
                results.push(client);
            }
        }

        // For each client, check if they have an existing conversation and count orders
        const clientsWithConvStatus = await Promise.all(results.map(async (client) => {
            // Check for conversation by phone or email
            const handles = [client.phone, client.email].filter(Boolean);
            let hasConversation = false;
            let conversationId = null;

            for (const handle of handles) {
                const { data: conv } = await supabase
                    .from('conversations')
                    .select('id')
                    .eq('contact_handle', handle?.replace(/\+/g, ''))
                    .single();

                if (conv) {
                    hasConversation = true;
                    conversationId = conv.id;
                    break;
                }
            }

            // Count total orders for this client
            let totalOrders = 0;
            if (client.id) {
                const { count } = await supabase
                    .from('orders')
                    .select('*', { count: 'exact', head: true })
                    .eq('client_id', client.id);
                totalOrders = count || 0;
            }

            return {
                ...client,
                has_conversation: hasConversation,
                conversation_id: conversationId,
                total_orders: totalOrders
            };
        }));

        res.json({ success: true, data: clientsWithConvStatus });
    } catch (error: any) {
        console.error('[CRM] searchClients error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Start a new conversation with a client (by email or phone)
 * Creates a conversation entry and optionally sends an initial message
 */
export const startConversationWithClient = async (req: Request, res: Response): Promise<void> => {
    try {
        const { client_id, channel, initial_message } = req.body;

        if (!client_id || !channel) {
            res.status(400).json({ success: false, error: 'client_id and channel are required' });
            return;
        }

        // Get client details
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .select('*')
            .eq('id', client_id)
            .single();

        if (clientError || !client) {
            res.status(404).json({ success: false, error: 'Client not found' });
            return;
        }

        // Determine the handle based on channel
        let handle: string;
        if (channel === 'EMAIL') {
            handle = client.email;
        } else if (channel === 'WA') {
            handle = client.phone?.replace(/\+/g, '') || '';
        } else {
            handle = client.email || client.phone?.replace(/\+/g, '') || '';
        }

        if (!handle) {
            res.status(400).json({ success: false, error: `No valid handle for channel ${channel}` });
            return;
        }

        // Check if conversation already exists
        const { data: existing } = await supabase
            .from('conversations')
            .select('id')
            .eq('contact_handle', handle)
            .eq('channel', channel)
            .single();

        if (existing) {
            res.json({ success: true, data: { conversation_id: existing.id, existed: true } });
            return;
        }

        // Create new conversation
        const conversation = await crmService.getOrCreateConversation(channel, handle);

        // Update conversation with client info
        await supabase
            .from('conversations')
            .update({
                client_id: client.id,
                contact_name: client.name,
                facts: {
                    user_name: client.name,
                    user_email: client.email,
                    user_phone: client.phone
                }
            })
            .eq('id', conversation.id);

        // If initial message provided and channel is EMAIL, queue it
        if (initial_message && channel === 'EMAIL') {
            // Email sending will be handled by EmailService (to be implemented)
            console.log(`[CRM] Initial email message queued for ${handle}: ${initial_message.substring(0, 50)}...`);
        }

        res.json({ success: true, data: { conversation_id: conversation.id, existed: false } });
    } catch (error: any) {
        console.error('[CRM] startConversationWithClient error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Create eDarkStore support ticket
 * POST /api/v1/crm/tickets/edarkstore
 */
export const createeDarkStoreTicket = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId, type, subject, description, orderNumber, trackingNumber, priority, additionalRecipients } = req.body;

        // Import the ticket function
        const { sendeDarkStoreTicket, createeDarkStoreTicketFromConversation } = require('../services/emailService');

        let result;

        if (conversationId) {
            // Create ticket from conversation context
            result = await createeDarkStoreTicketFromConversation(conversationId, {
                type: type || 'general_inquiry',
                subject,
                description,
                orderNumber,
                trackingNumber,
                priority: priority || 'normal',
                additionalRecipients
            });
        } else {
            // Create standalone ticket
            if (!subject || !description) {
                res.status(400).json({ success: false, error: 'Subject and description are required' });
                return;
            }

            result = await sendeDarkStoreTicket({
                type: type || 'general_inquiry',
                subject,
                description,
                orderNumber,
                trackingNumber,
                priority: priority || 'normal',
                additionalRecipients
            });
        }

        if (result.success) {
            res.json({ success: true, data: { ticketId: result.ticketId } });
        } else {
            res.status(500).json({ success: false, error: result.error });
        }
    } catch (error: any) {
        console.error('[CRM] createeDarkStoreTicket error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get tickets for a conversation
 * GET /api/v1/crm/conversations/:conversationId/tickets
 */
export const getConversationTickets = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;

        const { data: tickets, error } = await supabase
            .from('support_tickets')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[CRM] getConversationTickets error:', error);
            res.status(500).json({ success: false, error: error.message });
            return;
        }

        res.json({ success: true, data: tickets || [] });
    } catch (error: any) {
        console.error('[CRM] getConversationTickets error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Update ticket status
 * PATCH /api/v1/crm/tickets/:ticketId
 */
export const updateTicketStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { ticketId } = req.params;
        const { status } = req.body;

        if (!status || !['open', 'pending', 'in_progress', 'resolved', 'closed'].includes(status)) {
            res.status(400).json({ success: false, error: 'Invalid status' });
            return;
        }

        const updateData: any = { status };
        if (status === 'resolved' || status === 'closed') {
            updateData.resolved_at = new Date().toISOString();
        }

        const { data: ticket, error } = await supabase
            .from('support_tickets')
            .update(updateData)
            .eq('ticket_id', ticketId)
            .select()
            .single();

        if (error) {
            console.error('[CRM] updateTicketStatus error:', error);
            res.status(500).json({ success: false, error: error.message });
            return;
        }

        res.json({ success: true, data: ticket });
    } catch (error: any) {
        console.error('[CRM] updateTicketStatus error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// ============================================================
// Smart Compose: AI-powered text assistance for CRM agents
// ============================================================

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

/**
 * Predictive text completion based on conversation context
 * POST /api/v1/crm/smart-compose/predict
 */
export const smartComposePredict = async (req: Request, res: Response): Promise<void> => {
    try {
        const { text, conversationId, clientContext } = req.body;

        if (!text || text.length < 3) {
            res.json({ success: true, prediction: '' });
            return;
        }

        // Get recent messages for context
        let recentMessages: any[] = [];
        if (conversationId) {
            const { data: msgs } = await supabase
                .from('crm_messages')
                .select('content, role')
                .eq('conversation_id', conversationId)
                .order('created_at', { ascending: false })
                .limit(10);
            recentMessages = msgs || [];
        }

        // Build context for prediction
        const contextParts: string[] = [];
        if (clientContext?.name) contextParts.push(`Cliente: ${clientContext.name}`);
        if (clientContext?.facts?.length) {
            contextParts.push(`Datos del cliente: ${clientContext.facts.slice(0, 5).join(', ')}`);
        }
        if (recentMessages.length) {
            const msgContext = recentMessages.reverse().map(m =>
                `${m.role === 'user' ? 'Cliente' : 'Agente'}: ${m.content?.substring(0, 100)}`
            ).join('\n');
            contextParts.push(`Conversación reciente:\n${msgContext}`);
        }

        // Call Claude for prediction
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 100,
                system: `Eres un asistente de autocompletado para agentes de servicio al cliente de Extractoseum (tienda de extractos naturales).
Tu tarea es predecir cómo el agente completaría su mensaje actual.
Solo responde con la continuación del texto, sin explicaciones.
Si no tienes suficiente contexto, responde vacío.
Mantén el mismo tono y estilo del texto parcial.
${contextParts.length ? '\nContexto:\n' + contextParts.join('\n\n') : ''}`,
                messages: [{
                    role: 'user',
                    content: `Completa este mensaje del agente (solo la continuación): "${text}"`
                }],
            }),
        });

        if (!response.ok) {
            console.error('[SmartCompose] Predict API error:', await response.text());
            res.json({ success: true, prediction: '' });
            return;
        }

        const data = await response.json();
        const prediction = data.content?.[0]?.text?.trim() || '';

        res.json({ success: true, prediction });
    } catch (error: any) {
        console.error('[SmartCompose] Predict error:', error);
        res.json({ success: true, prediction: '' });
    }
};

/**
 * Enhance text for voice synthesis with ElevenLabs audio tags
 * POST /api/v1/crm/smart-compose/enhance-audio
 */
export const smartComposeEnhanceAudio = async (req: Request, res: Response): Promise<void> => {
    try {
        const { text, clientContext } = req.body;

        if (!text?.trim()) {
            res.status(400).json({ success: false, error: 'Text required' });
            return;
        }

        // Build context
        const contextParts: string[] = [];
        if (clientContext?.name) contextParts.push(`Hablando con: ${clientContext.name}`);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 500,
                system: `Eres un experto en mejorar texto para síntesis de voz con ElevenLabs v3.
Tu tarea es agregar tags de audio apropiados para que el mensaje suene natural y emocional.

Tags disponibles de ElevenLabs v3:
EMOCIONES: [whispers], [sighs], [excited], [sad], [angry], [happily], [curious], [thoughtful], [nervously], [warmly], [reassuring]
REACCIONES: [laughs], [laughs softly], [giggles], [clears throat], [gasps], [breathes]
RITMO: [pause], [short pause], [long pause], [slowly], [quickly], [stammers], [hesitates]
VOLUMEN: [quietly], [loudly], [shouts]

Reglas:
1. Agrega tags solo donde mejoren la naturalidad
2. Usa ... (puntos suspensivos) para pausas naturales
3. No abuses de los tags - úsalos estratégicamente
4. Mantén el mensaje original, solo agrega tags
5. Los tags van ANTES del texto que afectan
6. Para preguntas usa tono [curious] o [warmly]
7. Para despedidas usa [warmly] o [happily]
8. Para noticias positivas usa [excited] o [happily]
9. Para empatía usa [softly] o [reassuring]

${contextParts.length ? 'Contexto: ' + contextParts.join('. ') : ''}

Responde SOLO con el texto mejorado, sin explicaciones.`,
                messages: [{
                    role: 'user',
                    content: `Mejora este texto para voz:\n\n"${text}"`
                }],
            }),
        });

        if (!response.ok) {
            console.error('[SmartCompose] Enhance audio API error:', await response.text());
            res.status(500).json({ success: false, error: 'API error' });
            return;
        }

        const data = await response.json();
        let enhancedText = data.content?.[0]?.text?.trim() || text;

        // Remove any quotes that Claude might add
        enhancedText = enhancedText.replace(/^["']|["']$/g, '');

        res.json({ success: true, enhancedText });
    } catch (error: any) {
        console.error('[SmartCompose] Enhance audio error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Help me write - improve, expand, or adjust tone of text
 * POST /api/v1/crm/smart-compose/help-write
 */
export const smartComposeHelpWrite = async (req: Request, res: Response): Promise<void> => {
    try {
        const { text, action, channel, clientContext } = req.body;

        if (!text?.trim()) {
            res.status(400).json({ success: false, error: 'Text required' });
            return;
        }

        const validActions = ['improve', 'expand', 'friendly', 'professional', 'empathetic'];
        if (!action || !validActions.includes(action)) {
            res.status(400).json({ success: false, error: 'Valid action required' });
            return;
        }

        // Valid channels with their formatting rules
        const validChannels = ['whatsapp', 'email', 'tiktok', 'instagram'];
        const selectedChannel = validChannels.includes(channel) ? channel : 'whatsapp';

        // Build context
        const contextParts: string[] = [];
        if (clientContext?.name) contextParts.push(`Cliente: ${clientContext.name}`);
        if (clientContext?.facts?.length) {
            contextParts.push(`Info del cliente: ${clientContext.facts.slice(0, 3).join(', ')}`);
        }

        const actionInstructions: Record<string, string> = {
            improve: 'Mejora la gramática, claridad y fluidez del texto. Corrige errores y haz el mensaje más claro.',
            expand: 'Expande el texto agregando más detalles útiles. Agrega información relevante que pueda ayudar al cliente.',
            friendly: 'Reescribe el texto con un tono más amigable, casual y cercano. Usa un lenguaje cálido y accesible.',
            professional: 'Reescribe el texto con un tono más formal y profesional. Mantén la cortesía pero con más seriedad.',
            empathetic: 'Reescribe el texto mostrando más empatía y comprensión hacia el cliente. Valida sus sentimientos y preocupaciones.',
        };

        // Channel-specific formatting instructions
        const channelInstructions: Record<string, string> = {
            whatsapp: `
FORMATO WHATSAPP:
- Tono casual y directo, como conversación entre amigos
- SIEMPRE usa emojis relevantes (2-4 por mensaje): 😊 para amabilidad, ✨ para destacar, 👍 para confirmación, 🙏 para agradecer, 💚 para productos naturales, 🌿 para extractos
- Usa *asteriscos* para negritas en palabras importantes
- Mensajes concisos (máximo 3-4 líneas)
- Puedes usar "Hola!" o "Hey!" al inicio
- Ejemplo: "Hola! 😊 Claro que sí, *tu pedido* va en camino 📦✨"`,
            email: `
FORMATO EMAIL:
- Tono formal y profesional
- INCLUYE saludo inicial: "Estimado/a [nombre]," o "Hola [nombre],"
- INCLUYE despedida: "Saludos cordiales," o "Quedamos a tus órdenes,"
- NO uses emojis (máximo 1 si es muy apropiado)
- Estructura clara con párrafos separados
- Usa lenguaje cortés: "Le informamos que...", "Con gusto le atendemos..."`,
            tiktok: `
FORMATO TIKTOK:
- Muy corto y directo (1-2 líneas máximo)
- Tono juvenil y trendy
- USA emojis llamativos (3-5): ✨🔥💫🎉💪
- Incluye 2-3 hashtags relevantes al final: #Extractoseum #SaludNatural #Bienestar
- Usa lenguaje casual: "Ey!", "Ya sabes!", "Te va a encantar"
- Ejemplo: "Ey! Tu pedido ya viene en camino 🔥📦 Te va a encantar! ✨ #Extractoseum"`,
            instagram: `
FORMATO INSTAGRAM:
- Tono amigable y visualmente atractivo
- USA emojis expresivos (3-4): 🌿✨💚🙌😍
- Incluye 1-2 hashtags si es apropiado
- Lenguaje cercano pero no tan informal como TikTok
- Puedes usar saltos de línea para separar ideas
- Ejemplo: "Hola! 🌿✨\n\nTu pedido está listo y va en camino 📦💚\n\n¡Te va a encantar!"`,
        };

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 500,
                system: `Eres un asistente de redacción para agentes de servicio al cliente de Extractoseum (tienda de extractos naturales mexicana).

TAREA: ${actionInstructions[action]}
${channelInstructions[selectedChannel]}

REGLAS GENERALES:
1. Mantén el mensaje conciso (no más del doble del original)
2. Mantén la intención original del mensaje
3. Usa español mexicano natural
4. Responde SOLO con el texto mejorado, sin explicaciones ni comillas

${contextParts.length ? 'CONTEXTO DEL CLIENTE: ' + contextParts.join('. ') : ''}`,
                messages: [{
                    role: 'user',
                    content: text
                }],
            }),
        });

        if (!response.ok) {
            console.error('[SmartCompose] Help write API error:', await response.text());
            res.status(500).json({ success: false, error: 'API error' });
            return;
        }

        const data = await response.json();
        let result = data.content?.[0]?.text?.trim() || text;

        // Remove any quotes that Claude might add
        result = result.replace(/^["']|["']$/g, '');

        res.json({ success: true, result });
    } catch (error: any) {
        console.error('[SmartCompose] Help write error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Generate AI summary of conversation
export const generateConversationSummary = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;

        // Get conversation with messages
        const { data: messages, error: msgError } = await supabase
            .from('crm_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true })
            .limit(50);

        if (msgError) {
            res.status(500).json({ success: false, error: msgError.message });
            return;
        }

        if (!messages || messages.length === 0) {
            res.status(400).json({ success: false, error: 'No messages to summarize' });
            return;
        }

        // Get conversation facts for context
        const { data: conversation } = await supabase
            .from('conversations')
            .select('facts, contact_handle, channel')
            .eq('id', conversationId)
            .single();

        // Format messages for Claude
        const formattedMessages = messages.map((m: any) => {
            const role = m.direction === 'inbound' ? 'Cliente' : 'Agente';
            return `${role}: ${m.content || '[mensaje multimedia]'}`;
        }).join('\n');

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 800,
                messages: [{
                    role: 'user',
                    content: `Eres un asistente que resume conversaciones de soporte/ventas para una tienda de extractos naturales y productos de bienestar.

CONVERSACIÓN:
${formattedMessages}

${conversation?.facts ? `DATOS DEL CLIENTE: ${JSON.stringify(conversation.facts)}` : ''}

Genera un resumen estructurado con:
1. **Resumen General** (2-3 oraciones del contexto principal)
2. **Puntos Clave** (lista de 3-5 puntos importantes)
3. **Estado Actual** (¿qué está esperando el cliente? ¿hay algo pendiente?)
4. **Sentimiento** (positivo/neutral/negativo y por qué)
5. **Próximos Pasos Sugeridos** (1-2 acciones recomendadas)

Responde SOLO en español. Sé conciso y directo.`
                }]
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error('[Summary] Claude API error:', errText);
            res.status(500).json({ success: false, error: 'AI service error' });
            return;
        }

        const data = await response.json();
        const summary = data?.content?.[0]?.text || '';

        res.json({ success: true, data: { summary, messageCount: messages.length } });
    } catch (error: any) {
        console.error('[Summary] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Update conversation tags
export const updateConversationTags = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;
        const { tags } = req.body;

        if (!Array.isArray(tags)) {
            res.status(400).json({ success: false, error: 'Tags must be an array' });
            return;
        }

        // Validate and clean tags
        const cleanTags = tags.map(t => String(t).trim().toLowerCase()).filter(Boolean);

        const { data, error } = await supabase
            .from('conversations')
            .update({ tags: cleanTags })
            .eq('id', conversationId)
            .select('id, tags')
            .single();

        if (error) {
            res.status(500).json({ success: false, error: error.message });
            return;
        }

        res.json({ success: true, data });
    } catch (error: any) {
        console.error('[Tags] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

/**
 * Get unified contact view for multi-channel card
 * GET /api/v1/crm/contacts/:handle/unified
 * Returns all conversations and voice calls across channels for a single contact
 */
export const getUnifiedContactView = async (req: Request, res: Response): Promise<void> => {
    try {
        const { handle } = req.params;

        if (!handle) {
            res.status(400).json({ success: false, error: 'Missing handle' });
            return;
        }

        // Normalize handle to get last 10 digits
        const cleanHandle = handle.replace(/\D/g, '').slice(-10);

        // 1. Get contact snapshot
        const { data: snapshot, error: snapErr } = await supabase
            .from('crm_contact_snapshots')
            .select('*')
            .or(`handle.ilike.%${cleanHandle}%`)
            .maybeSingle();

        // 2. Get all conversations for this contact
        const { data: conversations, error: convErr } = await supabase
            .from('conversations')
            .select('id, channel, status, last_message_at, traffic_source, column_id, contact_name, facts')
            .or(`contact_handle.ilike.%${cleanHandle}%`)
            .order('last_message_at', { ascending: false });

        // 3. Get voice calls for this contact
        const { data: voiceCalls, error: voiceErr } = await supabase
            .from('voice_calls')
            .select('id, vapi_call_id, direction, status, duration_seconds, recording_url, recording_sid, transcript, created_at, ended_at, user_sentiment, context_data')
            .or(`phone_number.ilike.%${cleanHandle}%`)
            .order('created_at', { ascending: false })
            .limit(20);

        // 4. Get recent orders for this contact
        const { data: orders, error: orderErr } = await supabase
            .from('orders')
            .select('id, order_number, total_amount, financial_status, fulfillment_status, created_at')
            .or(`phone.ilike.%${cleanHandle}%,email.ilike.%${cleanHandle}%`)
            .order('created_at', { ascending: false })
            .limit(10);

        // Calculate aggregate metrics
        const activeChannels = [...new Set(conversations?.map(c => c.channel) || [])];
        if (voiceCalls && voiceCalls.length > 0) {
            activeChannels.push('voice');
        }

        const totalVoiceDuration = voiceCalls?.reduce((sum, vc) => sum + (vc.duration_seconds || 0), 0) || 0;

        // Find most recent activity across all channels
        const lastMessageAt = conversations?.[0]?.last_message_at;
        const lastVoiceCallAt = voiceCalls?.[0]?.created_at;
        const lastActivityAt = lastMessageAt && lastVoiceCallAt
            ? new Date(lastMessageAt) > new Date(lastVoiceCallAt) ? lastMessageAt : lastVoiceCallAt
            : lastMessageAt || lastVoiceCallAt;

        res.json({
            success: true,
            data: {
                // Contact info
                contact_handle: handle,
                contact_name: snapshot?.name || conversations?.[0]?.contact_name || null,
                primary_channel: snapshot?.channel || conversations?.[0]?.channel || 'unknown',

                // Snapshot data
                snapshot: snapshot || null,

                // Channel activity
                active_channels: [...new Set(activeChannels)],
                conversations_by_channel: conversations?.reduce((acc, c) => {
                    acc[c.channel] = (acc[c.channel] || 0) + 1;
                    return acc;
                }, {} as Record<string, number>) || {},

                // All conversations
                conversations: conversations || [],

                // Voice calls
                voice_calls: voiceCalls?.map(vc => ({
                    id: vc.id,
                    call_sid: vc.vapi_call_id,
                    direction: vc.direction,
                    status: vc.status,
                    duration_seconds: vc.duration_seconds,
                    recording_url: vc.recording_url,
                    transcript: vc.transcript?.substring(0, 500), // Truncate for list view
                    full_transcript: vc.transcript,
                    created_at: vc.created_at,
                    ended_at: vc.ended_at,
                    sentiment: vc.user_sentiment,
                    context: vc.context_data
                })) || [],

                // Orders
                recent_orders: orders || [],

                // Aggregate metrics
                metrics: {
                    total_conversations: conversations?.length || 0,
                    total_voice_calls: voiceCalls?.length || 0,
                    total_voice_duration_seconds: totalVoiceDuration,
                    total_orders: orders?.length || 0,
                    ltv: snapshot?.ltv || 0,
                    last_activity_at: lastActivityAt
                }
            }
        });
    } catch (error: any) {
        console.error('[CRM] getUnifiedContactView error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

// Get sentiment analysis for a conversation
export const getConversationSentiment = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId } = req.params;

        // Get recent messages (last 10)
        const { data: messages, error: msgError } = await supabase
            .from('crm_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .eq('direction', 'inbound') // Only customer messages
            .order('created_at', { ascending: false })
            .limit(10);

        if (msgError) {
            res.status(500).json({ success: false, error: msgError.message });
            return;
        }

        if (!messages || messages.length === 0) {
            res.json({ success: true, data: { sentiment: 'neutral', confidence: 0, reason: 'No hay mensajes del cliente' } });
            return;
        }

        // Format messages for analysis
        const recentMessages = messages.reverse().map((m: any) => m.content || '').filter(Boolean).join('\n');

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 200,
                messages: [{
                    role: 'user',
                    content: `Analiza el sentimiento de estos mensajes de un cliente:

${recentMessages}

Responde SOLO en formato JSON con esta estructura exacta:
{
  "sentiment": "positive" | "neutral" | "negative" | "frustrated" | "excited" | "confused",
  "confidence": 0.0-1.0,
  "emoji": "emoji apropiado",
  "reason": "breve explicación en español (max 10 palabras)"
}

Solo el JSON, nada más.`
                }]
            })
        });

        if (!response.ok) {
            res.json({ success: true, data: { sentiment: 'neutral', confidence: 0.5, emoji: '😐', reason: 'No se pudo analizar' } });
            return;
        }

        const data = await response.json();
        const text = data?.content?.[0]?.text || '';

        // Parse JSON response
        try {
            const jsonMatch = text.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const sentimentData = JSON.parse(jsonMatch[0]);
                res.json({ success: true, data: sentimentData });
                return;
            }
        } catch (e) {
            console.error('[Sentiment] JSON parse error:', e);
        }

        res.json({ success: true, data: { sentiment: 'neutral', confidence: 0.5, emoji: '😐', reason: 'Análisis incompleto' } });
    } catch (error: any) {
        console.error('[Sentiment] Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
};

