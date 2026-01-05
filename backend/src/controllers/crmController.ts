
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

