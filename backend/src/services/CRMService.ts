import { supabase } from '../config/supabase';
import { AIService, CustomerContext } from './aiService';
import { logger } from '../utils/Logger'; // Phase 31: Structured Logging
import { sendWhatsAppMessage, sendWhatsAppVoice, getContactInfo } from './whapiService';
import { sendDataEmail } from './emailService';
import { searchShopifyCustomers, getShopifyCustomerOrders, searchShopifyCustomerByPhone } from './shopifyService';
import { ChannelRouter } from './channelRouter';
import { ChipEngine } from './chipEngine';
import { VoiceService } from './VoiceService';
import { normalizePhone, cleanupPhone } from '../utils/phoneUtils';
import fs from 'fs';
import path from 'path';

// Base directory for metadata
const KNOWLEDGE_BASE_DIR = path.join(__dirname, '../../data/ai_knowledge_base');

export interface CRMMessage {
    id?: string;
    conversation_id: string;
    direction: 'inbound' | 'outbound';
    role: 'user' | 'assistant' | 'system';
    message_type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'template' | 'event' | 'sticker';
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
    external_id?: string;
    channel_thread_id?: string;
    content: string;
    raw_payload?: any;
    skipDispatch?: boolean;
    created_at?: string;
}

export interface CRMConversation {
    id: string;
    channel: 'WA' | 'IG' | 'FB' | 'EMAIL' | 'WEBCHAT';
    contact_handle: string;
    status: 'active' | 'paused' | 'review' | 'archived';
    column_id: string;
    summary?: string;
    summary_version?: number;
    last_summarized_at?: string;
    facts?: {
        personality?: string[];
        interests?: string[];
        intent_score?: number;
        friction_score?: number;
        emotional_vibe?: string;
        browsing_summary?: string;
        user_email?: string;
        user_name?: string;
        identity_ambiguity?: boolean;
        ambiguity_candidates?: string[];
        action_plan?: Array<{
            label: string;
            meta?: string;
            action_type: 'coupon' | 'link' | 'text';
            payload: any;
        }>;
        system_inquiry?: {
            id: string;
            type: 'identity_ambiguity' | 'ghost_data' | 'error_resolution';
            question: string;
            options: Array<{ label: string; action: string; payload?: any }>;
        };
    };
    facts_version?: number;
    agent_override_id?: string;
    model_override?: string;
    channel_chip_id?: string;
    last_message_at: string;
    contact_name?: string;
    avatar_url?: string;
    ltv?: number;
    risk_level?: string;
    tags?: string[];
}

export interface ContactSnapshot {
    id?: string;
    handle: string;
    channel: string;
    name?: string;
    ltv?: number;
    orders_count?: number;
    average_ticket?: number;
    risk_level?: string;
    tags?: string[];
    last_shipping_status?: string;
    last_shipping_carrier?: string;
    last_shipping_tracking?: string;
    avatar_url?: string;
    last_updated_at?: string;
    created_at?: string;
    updated_at?: string;
}


export class CRMService {
    private static instance: CRMService;
    private aiService: AIService;
    private channelRouter: ChannelRouter;
    private chipEngine: ChipEngine;

    private constructor() {
        this.aiService = AIService.getInstance();
        this.channelRouter = ChannelRouter.getInstance();
        this.chipEngine = ChipEngine.getInstance();
    }

    public static getInstance(): CRMService {
        if (!CRMService.instance) {
            CRMService.instance = new CRMService();
        }
        return CRMService.instance;
    }

    /**
     * Finds or creates a conversation based on channel and handle.
     * Uses ChannelRouter for new conversations.
     */
    public async getOrCreateConversation(channel: CRMConversation['channel'], handle: string, channelReference?: string): Promise<CRMConversation> {
        console.log(`[CRMService] [TRACE_CONV] Entry for handle: ${handle}, channel: ${channel}, reference: ${channelReference}`);

        // 1. Try to find existing (Exact match)
        const { data: exactMatch, error: exactError } = await supabase
            .from('conversations')
            .select('*')
            .eq('channel', channel)
            .eq('contact_handle', handle)
            .maybeSingle();

        if (exactError) console.error(`[CRMService] [TRACE_CONV] Exact match error: ${exactError.message}`);

        if (exactMatch) {
            console.log(`[CRMService] [TRACE_CONV] Found Exact Match: ${exactMatch.id}`);
            return exactMatch;
        }

        console.log(`[CRMService] [TRACE_CONV] No exact match. Checking strategies...`);

        // 2. Fuzzy match for WhatsApp (Match by last 10 digits)
        if (channel === 'WA') {
            const last10 = handle.substring(handle.length - 10);
            if (last10.length === 10) {
                const { data: fuzzyMatches, error: fuzzyError } = await supabase
                    .from('conversations')
                    .select('*')
                    .eq('channel', 'WA')
                    .ilike('contact_handle', `%${last10}`);

                if (fuzzyError) console.error(`[CRMService] [TRACE_CONV] Fuzzy match error: ${fuzzyError.message}`);

                if (fuzzyMatches && fuzzyMatches.length > 0) {
                    console.log(`[CRMService] [TRACE_CONV] Fuzzy match found: ${handle} -> ${fuzzyMatches[0].contact_handle} (${fuzzyMatches[0].id})`);
                    return fuzzyMatches[0];
                }
            }
        }

        console.log(`[CRMService] [TRACE_CONV] No matches found. Requesting Routing Decision...`);

        // 3. Request Routing Decision from ChannelRouter
        const routing = await this.channelRouter.getRouting(channel, channelReference || handle);

        // 4. Find fallback column if routing failed
        let targetColumnId = routing.column_id;
        if (!targetColumnId) {
            console.warn(`[CRMService] [TRACE_CONV] Router returned no column. Falling back to default.`);
            const { data: defaultCol } = await supabase
                .from('crm_columns')
                .select('id')
                .order('position', { ascending: true })
                .limit(1)
                .maybeSingle();
            targetColumnId = defaultCol?.id || null;
        }

        console.log(`[CRMService] [TRACE_CONV] Routing: Column=${targetColumnId}, Agent=${routing.agent_id}, Source=${routing.traffic_source}`);

        // 5. Create new
        const finalHandle = (channel === 'WA') ? cleanupPhone(handle) : handle;

        const { data: created, error: createError } = await supabase
            .from('conversations')
            .insert({
                channel,
                contact_handle: finalHandle,
                column_id: targetColumnId,
                agent_override_id: routing.agent_id,
                status: 'active',
                traffic_source: routing.traffic_source || 'organic',
                last_message_at: new Date().toISOString(),
                summary: 'Nueva conversación'
            })
            .select('*')
            .single();

        if (createError) {
            console.error(`[CRMService] [FATAL] Failed to create conversation: ${createError.message}`);
            throw new Error(`[CRMService] Failed to create conversation: ${createError.message}`);
        }

        console.log(`[CRMService] [TRACE_CONV] Created Success: ${created.id}`);
        return created;
    }

    /**
     * Generates a voice message (TTS) and sends it as an audio message.
     */
    public async sendVoiceMessage(conversationId: string, text: string, role: CRMMessage['role'] = 'assistant'): Promise<CRMMessage> {
        // 1. Get Conversation to find voice profile
        const { data: conv, error } = await supabase
            .from('conversations')
            .select('*, crm_columns(voice_profile)')
            .eq('id', conversationId)
            .single();

        if (error || !conv) {
            console.error(`[CRMService] SendVoice error: ${error?.message || 'Conv not found'}`);
            throw new Error('Conversation not found');
        }

        // 2. Resolve Voice Profile
        // Priority: Conversation Override > Column Config > Default (Nova)
        let voiceProfile: any = conv.crm_columns?.voice_profile || { provider: 'openai', voice_id: 'nova' };
        if (typeof voiceProfile === 'string') {
            voiceProfile = { provider: 'openai', voice_id: voiceProfile };
        }

        // 3. Analyze Text & Generate Audio
        const vs = new VoiceService();
        let emotion: string | undefined;
        let analysis: any;

        try {
            analysis = await vs.analyzeTranscript(text, undefined, role);
            emotion = analysis.emotionFusionPrimary;
            console.log(`[CRMService] Analyzed text for voice. Emotion: ${emotion}, Intent: ${analysis.intent}`);
        } catch (ae) {
            console.error('[CRMService] Text analysis before voice generation failed:', ae);
        }

        const audioBuffer = await vs.generateAudioResponse(text, voiceProfile, emotion);

        // 4. Upload to Storage
        const bucket = process.env.STORAGE_BUCKET_ATTACHMENTS || 'images';
        const filename = `voice_manual/${Date.now()}_${conversationId}.mp3`;
        const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(filename, audioBuffer, { contentType: 'audio/mpeg', upsert: false });

        if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

        const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filename);
        const audioUrl = publicUrlData.publicUrl;

        // 5. Append & Dispatch
        // Enrich content with transcription and analysis for UI
        let enrichedContent = `[Audio](${audioUrl})`;
        if (analysis) {
            enrichedContent += `\n\n> 🎙️ **Transcripción:** ${text}\n> 💡 **Resumen:** ${analysis.summary}\n> 🏷️ **Intención:** ${analysis.intent} (${emotion || 'Neutral'})`;
        } else {
            enrichedContent += `\n\n> 🎙️ **Transcripción:** ${text}`;
        }

        return await this.appendMessage({
            conversation_id: conversationId,
            direction: 'outbound',
            role: role,
            message_type: 'audio',
            status: 'sent',
            content: enrichedContent,
            raw_payload: {
                audio_url: audioUrl,
                original_text: text,
                generated: true,
                manual_trigger: true,
                analysis: analysis || null
            }
        });
    }

    /**
     * Appends a message to a conversation and updates the last_message_at timestamp.
     * If the message is outbound, it attempts to dispatch it to the real channel.
     */
    public async appendMessage(msg: CRMMessage): Promise<CRMMessage> {
        // Extract skipDispatch so it doesn't go into the DB (it's a local flag)
        const { skipDispatch, ...dbMsg } = msg;

        console.log(`[CRMService] [DEBUG] Attempting Insert. Content: ${dbMsg.content.substring(0, 20)}... Type: ${dbMsg.message_type}`);

        // Insert into DB first
        const { data: insertedMsg, error: insertError } = await supabase
            .from('crm_messages')
            .insert(dbMsg)
            .select('*')
            .single();

        if (insertError) {
            console.error('[CRMService] [FATAL] Insert Error:', JSON.stringify(insertError));
            throw new Error(`[CRMService] Failed to append message: ${insertError.message}`);
        }

        console.log(`[CRMService] [DEBUG] Insert Success. ID: ${insertedMsg.id}`);

        // Update conversation timestamp and summary preview
        await supabase
            .from('conversations')
            .update({
                last_message_at: new Date().toISOString(),
                summary: msg.content.substring(0, 160)
            })
            .eq('id', msg.conversation_id);

        // REAL DISPATCH: If outbound, send to actual WhatsApp/Email
        // But SKIP if skipDispatch is true (used for echoes)
        if (msg.direction === 'outbound' && msg.role !== 'system' && !skipDispatch) {
            let type: 'text' | 'audio' = 'text';
            if (msg.message_type === 'audio') type = 'audio';

            // Extract URL if audio
            let payload = msg.content;
            if (type === 'audio' && msg.content.includes('(')) {
                const match = msg.content.match(/\((.*?)\)/);
                if (match) payload = match[1];
            }

            // Retry logic wrap
            const attemptDispatch = async (retries = 3) => {
                try {
                    await this.dispatchMessage(msg.conversation_id, insertedMsg.id, payload, type);
                } catch (err: any) {
                    if (retries > 0) {
                        console.warn(`[CRMService] Dispatch failed. Retrying... (${retries} attempts left). Error: ${err.message}`);
                        await new Promise(res => setTimeout(res, 1000)); // Wait 1s
                        await attemptDispatch(retries - 1);
                    } else {
                        console.error('[CRMService] Background dispatch failed after retries:', err);
                        // Optional: Update DB status to 'failed'
                    }
                }
            };

            await attemptDispatch();
        }

        return insertedMsg;
    }

    /**
     * Dispatcher to real-world channels
     */
    private async dispatchMessage(conversationId: string, messageId: string, content: string, type: 'text' | 'audio' = 'text'): Promise<void> {
        try {
            // 1. Get Conversation and its linked Chip
            const { data: conv } = await supabase
                .from('conversations')
                .select('channel, contact_handle, channel_chip_id')
                .eq('id', conversationId)
                .single();

            if (!conv) return;

            let success = false;
            let errorMsg = '';
            let customToken: string | undefined;

            // 2. Resolve Chip Configuration
            if (conv.channel_chip_id) {
                const { data: chip } = await supabase
                    .from('channel_chips')
                    .select('*')
                    .eq('id', conv.channel_chip_id)
                    .single();

                if (chip && chip.is_active) {
                    // Extract token from JSON config if present
                    if (chip.config && typeof chip.config === 'object' && chip.config.token) {
                        customToken = chip.config.token;
                        console.log(`[CRMService] Routing through Chip: ${chip.channel_id} (Custom Token Detected)`);
                    } else {
                        console.log(`[CRMService] Routing through Chip: ${chip.channel_id} (Using Default Token)`);
                    }
                }
            }

            let externalId: string | null = null;
            let res: any;
            if (conv.channel === 'WA') {
                if (type === 'audio') {
                    res = await sendWhatsAppVoice(conv.contact_handle, content, customToken);
                } else {
                    res = await sendWhatsAppMessage({ to: conv.contact_handle, body: content }, customToken);
                }
                success = res.sent;
                errorMsg = res.error || '';
                externalId = res.message?.id || null;
            } else if (conv.channel === 'IG' || conv.channel === 'FB') {
                // Bridge through Whapi if configured, or future direct integrations
                console.log(`[CRMService] Bridging ${conv.channel} message for ${conv.contact_handle}...`);
                res = await sendWhatsAppMessage({ to: conv.contact_handle, body: content }, customToken);
                success = res.sent;
                errorMsg = res.error || '';
                externalId = res.message?.id || null;
            } else if (conv.channel === 'EMAIL') {
                const emailRes = await sendDataEmail(
                    conv.contact_handle,
                    '[EUM] Nuevo mensaje de Ara',
                    content,
                    { fromName: 'Ara de Extractos EUM', replyTo: 'ara@extractoseum.com' }
                );
                success = emailRes.success;
                errorMsg = emailRes.error || '';
                res = emailRes;
                // Emails don't have a simple external ID we track this way usually
            }

            // Update status in DB
            await supabase
                .from('crm_messages')
                .update({
                    status: success ? 'delivered' : 'failed',
                    external_id: externalId, // SAVE THE EXTERNAL ID
                    raw_payload: !success ? { error: errorMsg } : (res as any)?.message || res || {}
                })
                .eq('id', messageId)
                .select('id, status, external_id');

        } catch (err: any) {
            console.error('[CRMService] Dispatch failed:', err);
            await supabase
                .from('crm_messages')
                .update({ status: 'failed', raw_payload: { system_error: err.message } })
                .eq('id', messageId);
        }
    }

    /**
     * Updates the status of a message based on external provider ID (Whapi).
     */
    public async updateMessageStatus(externalId: string, status: 'sent' | 'delivered' | 'read' | 'failed', recipientId: string): Promise<void> {
        console.log(`[CRMService] Updating status for external_id ${externalId} -> ${status}`);

        // 1. Find message by external_id (or try simplistic match if external_id missing)
        // We only care about outbound messages usually, but logic applies to all
        let { data, error } = await supabase
            .from('crm_messages')
            .update({
                status: status,
                // Optionally update metadata with timestamp if needed
                // raw_payload: { ...existing, status_history: [...] } 
            })
            .eq('external_id', externalId)
            .select('id, status');

        // Fix #11: Race Condition (Retry logic)
        if (!error && (!data || data.length === 0)) {
            console.warn(`[CRMService] Message not found for status ${status} (ext: ${externalId}). Retrying in 500ms...`);
            await new Promise(r => setTimeout(r, 500));
            // Retry once
            const retry = await supabase
                .from('crm_messages')
                .update({ status: status })
                .eq('external_id', externalId)
                .select('id, status');
            data = retry.data;
            error = retry.error;
        }

        if (error) {
            console.error(`[CRMService] Failed to update status for ${externalId}:`, error.message);
        } else if (!data || data.length === 0) {
            console.error(`[CRMService] GHOST DATA ERROR: Message ${externalId} lost definitively.`);
        } else {
            console.log(`[CRMService] Status updated successfully for ${data[0].id}.`);
        }
    }



    /**
     * Dispatcher logic with Fast Gates.
     * Decides if an incoming message needs an AI response or just a status update.
     */
    public async processInbound(channel: CRMConversation['channel'], handle: string, content: string, raw: any): Promise<CRMMessage | void> {
        // STRICT: Enforce 10-digit handle consistency immediately
        const cleanHandle = cleanupPhone(handle);
        console.log(`[CRMService] Incoming Inbound: ${cleanHandle} (Raw: ${handle}, Channel: ${channel})`);

        // Use cleanHandle everywhere below
        const conversation = await this.getOrCreateConversation(channel, cleanHandle, raw.channel_id || null);

        // --- NEW: AUTO-ENRICHMENT (Phase 53/59 - AWAITED) ---
        // Ensure we always have the latest Avatar/Name when they write to us.
        // Awaiting this (Phase 59) guarantees UI parity on new message arrival.
        try {
            await this.syncContactSnapshot(cleanHandle, channel);
        } catch (e) {
            console.error(`[CRMService] Enrichment failed for ${cleanHandle}:`, e);
        }

        // --- NEW: DEDUPLICATION CHECK ---
        // If external_id (raw.id) already exists, skip insertion!
        if (raw.id) {
            const { data: existing } = await supabase
                .from('crm_messages')
                .select('id, content')
                .eq('external_id', raw.id)
                .maybeSingle();

            if (existing) {
                console.log(`[CRMService] Returning existing message for duplicate external_id: ${raw.id}`);
                // Return existing to allow downstream (Voice Pipeline) to retry if it lacked media before
                return existing as any;
            }
        }

        // --- NEW: CONTENT DEDUPLICATION (Safety for race conditions) ---
        // If it's outbound and sent within the last 5 seconds with same content, it's likely an echo of what we just sent.
        if (raw.direction === 'outbound' || raw.from_me) {
            const fiveSecondsAgo = new Date(Date.now() - 5000).toISOString();
            const { data: recentEcho } = await supabase
                .from('crm_messages')
                .select('id')
                .eq('conversation_id', conversation.id)
                .eq('direction', 'outbound')
                .eq('content', content)
                .gte('created_at', fiveSecondsAgo)
                .maybeSingle();

            if (recentEcho) {
                console.log(`[CRMService] Skipping echo message (content match in last 5s)`);
                return;
            }
        }

        // 1. Log message (Could be inbound from customer OR outbound from external mobile app/echo)
        const createdMsg = await this.appendMessage({
            conversation_id: conversation.id,
            direction: raw.direction || 'inbound',
            role: raw.role || 'user',
            message_type: raw.type || 'text',
            status: 'delivered',
            content,
            external_id: raw.id || null, // Map Whapi ID
            raw_payload: raw,
            // DO NOT re-dispatch if this is already an outbound message (echo)
            skipDispatch: (raw.direction === 'outbound' || raw.from_me === true || raw._generated_from_me === true)
        });

        // 2. Load Column Brain (Inheritance)
        // ... (existing logic) ...

        // NEW: Trigger Chip Engine (Synchronous await to ensure context for AI)
        // Fixes "Ghost Data #2": ChipEngine failing silently/race condition
        if (createdMsg && createdMsg.id && createdMsg.direction === 'inbound') {
            try {
                await this.chipEngine.processMessage(
                    createdMsg.id,
                    createdMsg.content,
                    conversation.id,
                    conversation.channel_chip_id || null
                );
            } catch (err) {
                console.error('[CRMService] ChipEngine Critical Error:', err);
                // We continue, but now we know it failed before AI starts
            }
        }

        const { data: column, error } = await supabase
            .from('crm_columns')
            .select('*')
            .eq('id', conversation.column_id)
            .eq('id', conversation.column_id)
            .single();

        if (error) {
            console.warn(`[CRMService] Column fetch failed: ${error.message}`);
        }

        if (!column || column.mode === 'HUMAN_MODE') {
            console.log(`[CRMService] Column ${column?.name || 'unknown'} is in HUMAN_MODE or missing. AI response silenced.`);
            // Continue to facts sync below
        } else {
            // 2.1 STOP if this is my own message (prevent infinite loops)
            // Check raw.from_me OR the explicit controller flag _generated_from_me
            if (raw.from_me || raw._generated_from_me === true || raw.direction === 'outbound' || raw.role === 'assistant') {
                console.log(`[CRMService] Skipping AI for outbound/assistant message (Flag: ${raw._generated_from_me}, Raw: ${raw.from_me}).`);
                return createdMsg;
            }

            // 2.2 EMERGENCY LOOP BREAKER
            // If the message contains the AI's own signature, it is a self-reply loop. STOP.
            // Use lower case check to capture "Soy Ara", "soy Ara", "SOY ARA" etc.
            const lowerContent = content.toLowerCase();
            if (lowerContent.includes('test_09002') || lowerContent.includes('soy ara')) {
                console.log(`[CRMService] Skipping AI - Detected self-signature in content.`);
                // skip AI
            } else {
                // 3. Fast Gate: Low Value Content
                const lowValuePattern = /^(ok|gracias|thanks|👍|emoji|hola|hello|hi|si|no|chau|bye)$/i;
                if (lowValuePattern.test(content.trim())) {
                    console.log(`[CRMService] Low value content detected. Skipping LLM.`);
                } else {
                    // 4. Operational Brain Config
                    const agentId = conversation.agent_override_id || column.assigned_agent_id || 'sales_ara';
                    const model = conversation.model_override || 'gpt-4o';
                    const objectives = column.objectives || null;

                    // Resolve Tools Whitelist based on Policy
                    let toolsWhitelist: string[] = [];
                    const policy = (column as any).config?.tools_policy || { mode: 'inherit' };

                    if (policy.mode === 'override') {
                        toolsWhitelist = policy.allowed_tools || [];
                    } else {
                        // Inherit from Agent Metadata
                        const meta = await this.getAgentMetadata(agentId);
                        toolsWhitelist = meta?.default_tools || [];
                    }

                    console.log(`[CRMService] Dispatching to Agent: ${agentId} [${model}] in Column: ${column.name}`);

                    // 5. Dispatch to AI with Context Inheritance + Customer Context
                    try {
                        // Get customer context (pending orders, LTV, etc.) for personalization
                        const customerContext = await this.getCustomerContextForAI(cleanHandle);

                        const response = await this.aiService.chatWithPersona(
                            agentId,
                            content,
                            [],
                            model,
                            { toolsWhitelist, objectives, customerContext }
                        );

                        if (response && response.content) {
                            await this.appendMessage({
                                conversation_id: conversation.id,
                                direction: 'outbound',
                                role: 'assistant',
                                message_type: 'text',
                                status: 'sent',
                                content: response.content,
                                raw_payload: response
                            });

                            // VOICE CHECK... (I will keep the voice logic as is but wrapped in a try/catch)
                            const wasAudioInput = raw.type === 'voice' || raw.type === 'audio';
                            if (wasAudioInput && column.voice_profile) {
                                try {
                                    const vs = new VoiceService();
                                    let emotion: string | undefined;
                                    let analysis: any;
                                    try {
                                        analysis = await vs.analyzeTranscript(response.content);
                                        emotion = analysis.emotionFusionPrimary;
                                    } catch (ae) { console.error('[CRMService] Auto-voice analysis failed:', ae); }

                                    const audioBuffer = await vs.generateAudioResponse(response.content, column.voice_profile, emotion);
                                    const bucket = process.env.STORAGE_BUCKET_ATTACHMENTS || 'crm_attachments';
                                    const filename = `voice_outbound/${Date.now()}_${conversation.id}.mp3`;
                                    const { error: uploadError } = await supabase.storage
                                        .from(bucket)
                                        .upload(filename, audioBuffer, { contentType: 'audio/mpeg', upsert: false });

                                    if (uploadError) throw new Error(uploadError.message);
                                    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filename);
                                    const audioUrl = publicUrlData.publicUrl;

                                    let enrichedContent = `[Audio](${audioUrl})`;
                                    if (analysis) {
                                        enrichedContent += `\n\n> 🎙️ **Transcripción:** ${response.content}\n> 💡 **Resumen:** ${analysis.summary}\n> 🏷️ **Intención:** ${analysis.intent} (${emotion || 'Neutral'})`;
                                    }

                                    await this.appendMessage({
                                        conversation_id: conversation.id,
                                        direction: 'outbound',
                                        role: 'assistant',
                                        message_type: 'audio',
                                        status: 'sent',
                                        content: enrichedContent,
                                        raw_payload: { audio_url: audioUrl, generated: true, analysis: analysis || null }
                                    });
                                } catch (voiceErr: any) {
                                    console.error('[CRMService] Voice Generation Failed:', voiceErr.message);
                                    // Fix #7: Voice Feedback (Notify user)
                                    await this.appendMessage({
                                        conversation_id: conversation.id,
                                        direction: 'outbound',
                                        role: 'system', // Use system role to distinguish
                                        message_type: 'text',
                                        status: 'delivered',
                                        content: `⚠️ Audio generation failed (${voiceErr.message}). You can read the text above.`
                                    });
                                }
                            }
                        }
                    } catch (aiErr) {
                        console.error('[CRMService] AI Dispatch failed:', aiErr);
                    }
                }
            }
        }

        // 6. Automatic Fact Synchronization (AI Analysis) - RUNS ALWAYS for Inbound
        // Awaiting this (Phase 59) ensures action plans are updated before the user refreshes.
        if (createdMsg && createdMsg.direction === 'inbound') {
            try {
                await this.syncConversationFacts(conversation.id);
            } catch (err) {
                console.error(`[CRMService] Fact sync failed for ${conversation.id}:`, err);
            }
        }

        return createdMsg;
    }

    /**
     * Gets conversations by status.
     * By default returns active types for the Kanban.
     */
    public async getConversations(status: CRMConversation['status'][] = ['active', 'review', 'paused'], includeArchived: boolean = false): Promise<any[]> {
        console.log('[CRMService] Fetching conversations (v2.5 enrichment)...');
        const { data: convs, error } = await supabase
            .from('conversations')
            .select('*')
            .in('status', status)
            // Fix #12: Explicitly filter out archived unless requested (redundant if status array is strict, but safe)
            .neq('status', includeArchived ? '' : 'archived')
            .order('last_message_at', { ascending: false });

        if (error) throw new Error(`[CRMService] Failed to fetch conversations: ${error.message}`);
        if (!convs || convs.length === 0) return [];

        // 1. Deduplicate by ID (in case of race conditions or bad joins)
        const uniqueConvs = Array.from(new Map(convs.map(c => [c.id, c])).values());

        // 2. Collect all handles to fetch snapshots in bulk
        const handles = Array.from(new Set(uniqueConvs.map(c => c.contact_handle)));

        // 2. Fetch snapshots
        const { data: snapshots } = await supabase
            .from('crm_contact_snapshots')
            .select('handle, name, ltv, risk_level, tags, avatar_url')
            .in('handle', handles);

        // 3. Merge snapshots into conversations for UI enrichment
        const snapshotMap = (snapshots || []).reduce((acc: any, s) => {
            acc[s.handle] = s;
            return acc;
        }, {});

        return uniqueConvs.map(conv => ({
            ...conv,
            contact_name: snapshotMap[conv.contact_handle]?.name || null,
            avatar_url: snapshotMap[conv.contact_handle]?.avatar_url || null,
            ltv: snapshotMap[conv.contact_handle]?.ltv || 0,
            risk_level: snapshotMap[conv.contact_handle]?.risk_level || 'low',
            tags: snapshotMap[conv.contact_handle]?.tags || []
        }));
    }

    /**
     * Archive a conversation.
     */
    public async archiveConversation(id: string): Promise<void> {
        const { error } = await supabase
            .from('conversations')
            .update({ status: 'archived' })
            .eq('id', id);
        if (error) throw error;
    }

    /**
     * Close a conversation.
     */
    public async closeConversation(id: string): Promise<void> {
        const { error } = await supabase
            .from('conversations')
            .update({ status: 'closed' })
            .eq('id', id);
        if (error) throw error;
    }

    /**
     * Delete a conversation and its messages.
     */
    public async deleteConversation(id: string): Promise<void> {
        // RLS or cascade should handle messages, but let's be safe
        await supabase.from('crm_messages').delete().eq('conversation_id', id);
        const { error } = await supabase.from('conversations').delete().eq('id', id);
        if (error) throw error;
    }

    /**
     * Gets all messages for a specific conversation.
     */
    public async getMessages(conversationId: string): Promise<CRMMessage[]> {
        const { data, error } = await supabase
            .from('crm_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });

        if (error) throw new Error(`[CRMService] Failed to fetch messages: ${error.message}`);
        return data || [];
    }

    /**
     * Gets all columns for the Kanban board.
     */
    public async getColumns(): Promise<any[]> {
        const { data, error } = await supabase
            .from('crm_columns')
            .select('*')
            .order('position', { ascending: true });

        return data || [];
    }

    /**
     * Moves a conversation between columns.
     */
    public async moveConversation(conversationId: string, targetColumnId: string): Promise<void> {
        // Get column names for logging
        const { data: cols } = await supabase
            .from('crm_columns')
            .select('id, name');

        const { data: conv, error: convError } = await supabase
            .from('conversations')
            .select('column_id')
            .eq('id', conversationId)
            .single();

        if (convError || !conv) throw new Error(`[CRMService] Conversation not found: ${conversationId}`);

        const fromCol = cols?.find(c => c.id === conv.column_id)?.name || 'Unknown';
        const toCol = cols?.find(c => c.id === targetColumnId)?.name || 'Unknown';

        const { error } = await supabase
            .from('conversations')
            .update({ column_id: targetColumnId })
            .eq('id', conversationId);

        if (error) throw new Error(`[CRMService] Failed to move conversation: ${error.message}`);

        // Log move event
        await this.appendMessage({
            conversation_id: conversationId,
            direction: 'inbound', // System generated
            role: 'system',
            message_type: 'event',
            status: 'delivered',
            content: `Conversation moved from **${fromCol}** to **${toCol}**.`
        });
    }

    private async getAgentMetadata(agentId: string): Promise<any> {
        const categories = ['agents_god_mode', 'agents_public', 'agents_internal'];
        for (const cat of categories) {
            const metaPath = path.join(KNOWLEDGE_BASE_DIR, cat, agentId, 'metadata.json');
            if (fs.existsSync(metaPath)) {
                try {
                    return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
                } catch (e) {
                    console.error(`[CRMService] Error reading metadata for ${agentId}:`, e);
                }
            }
        }
        return null;
    }

    public async updateColumnConfig(columnId: string, data: { mode?: string, name?: string, config?: any, voice_profile?: any, objectives?: string, assigned_agent_id?: string }): Promise<void> {
        const updateData: any = {
            updated_at: new Date().toISOString()
        };

        if (data.mode) updateData.mode = data.mode;
        if (data.name) updateData.name = data.name;
        if (data.config) updateData.config = data.config;
        if (data.voice_profile) updateData.voice_profile = data.voice_profile;
        if (data.objectives !== undefined) updateData.objectives = data.objectives;
        if (data.assigned_agent_id !== undefined) updateData.assigned_agent_id = data.assigned_agent_id;

        const { error } = await supabase
            .from('crm_columns')
            .update(updateData)
            .eq('id', columnId);

        if (error) throw new Error(`[CRMService] Failed to update column config: ${error.message}`);
    }

    /**
     * Aggregates customer data and updates the snapshot cache.
     */
    public async syncContactSnapshot(handle: string, channel: string): Promise<any> {
        // 1. Fetch Client Profile (if exists)
        // Normalize handle for fuzzy phone matching
        const cleanPhone = cleanupPhone(handle);
        const { data: client } = await supabase
            .from('clients')
            .select('*')
            .or(`phone.ilike.%${cleanPhone},email.eq.${handle}`)
            .maybeSingle();

        let ltv = 0;
        let ordersCount = 0;
        let avgTicket = 0;
        let risk = 'low';
        let tags: string[] = [];
        let name = '';
        let lastShipping = null;

        if (client) {
            name = client.name;
            tags = client.tags || [];

            // 2. Fetch Orders (Mocking logic for now if order table not strict linked)
            // Ideally we query 'orders' table by client_id or email
            // For V1, we trust 'facts' or do a quick lookup if 'orders' table exists and has phone/email
            const { data: orders } = await supabase
                .from('orders')
                .select('total_price, created_at, status, fulfillment_status, tracking_number, tracking_company')
                .eq('customer_email', client.email) // Assuming email link
                .order('created_at', { ascending: false });

            if (orders && orders.length > 0) {
                ordersCount = orders.length;
                const total = orders.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0);
                ltv = total;
                avgTicket = ordersCount > 0 ? total / ordersCount : 0;

                // Get last shipping info
                const lastOrder = orders[0];
                lastShipping = {
                    status: lastOrder.fulfillment_status,
                    carrier: lastOrder.tracking_company,
                    tracking: lastOrder.tracking_number
                };
            }
        }

        // 2.0.1 LIVE SHOPIFY FALLBACK (Data Harmonization)
        // If we didn't find orders locally, let's check Shopify real-time 
        if (ordersCount === 0) {
            console.log(`[CRMService] No local orders for ${handle}. Trying Shopify Live Link...`);
            try {
                let shopifyCustomers: any[] = [];
                if (client && client.email) {
                    shopifyCustomers = await searchShopifyCustomers(`email:${client.email}`);
                } else {
                    shopifyCustomers = await searchShopifyCustomerByPhone(handle);
                }

                if (shopifyCustomers.length > 0) {
                    // Prioritize the account with orders/activity if multiple matches exist for the same phone
                    let shopifyCustomer = shopifyCustomers[0];
                    if (shopifyCustomers.length > 1) {
                        const activeMatch = shopifyCustomers.find(c => (c.orders_count || 0) > 0);
                        if (activeMatch) shopifyCustomer = activeMatch;
                    }
                    console.log(`[CRMService] Linked to Shopify Customer: ${shopifyCustomer.id} (${shopifyCustomer.email})`);
                    name = name || `${shopifyCustomer.first_name} ${shopifyCustomer.last_name}`;

                    // --- IDENTITY BRIDGE: PERSIST LINK TO CLIENTS TABLE ---
                    if (shopifyCustomer.email || shopifyCustomer.phone) {
                        try {
                            const cleanPhone = cleanupPhone(shopifyCustomer.phone || handle);
                            await supabase.from('clients').upsert({
                                phone: cleanPhone,
                                email: shopifyCustomer.email || client?.email,
                                name: name,
                                last_seen_at: new Date().toISOString()
                            }, { onConflict: 'phone' });
                            console.log(`[CRMService] Identity Bridge: Persisted Email ${shopifyCustomer.email} for Phone ${cleanPhone}`);
                        } catch (ibErr) {
                            console.warn('[CRMService] Identity Bridge Persist failed:', ibErr);
                        }
                    }

                    const liveOrders = await getShopifyCustomerOrders(shopifyCustomer.id);
                    if (liveOrders && liveOrders.length > 0) {
                        ordersCount = liveOrders.length; // Override mostly
                        const total = liveOrders.reduce((sum: number, o: any) => sum + (parseFloat(o.total_price) || 0), 0);
                        ltv = total;
                        avgTicket = total / ordersCount;

                        const lastOrder = liveOrders[0];
                        lastShipping = {
                            status: lastOrder.fulfillment_status || 'unfulfilled',
                            carrier: (lastOrder.fulfillments && lastOrder.fulfillments[0]) ? lastOrder.fulfillments[0].tracking_company : null,
                            tracking: (lastOrder.fulfillments && lastOrder.fulfillments[0]) ? lastOrder.fulfillments[0].tracking_number : null
                        };

                        // Merge tags
                        if (shopifyCustomer.tags) {
                            const sTags = shopifyCustomer.tags.split(',').map((t: string) => t.trim());
                            tags = Array.from(new Set([...tags, ...sTags]));
                        }
                    }
                }
            } catch (e) {
                console.warn('[CRMService] Live Shopify Link failed:', e);
            }
        }

        // 2.1 Fetch External Profile (Avatar) for WhatsApp
        let avatarUrl = null;
        if (channel === 'WA') {
            try {
                // FORCE use of cleanPhone (10 digits) which whapiService will normalize for API
                const waProfile = await getContactInfo(cleanPhone);
                if (waProfile.exists && waProfile.profilePic && waProfile.profilePic.startsWith('http')) {
                    avatarUrl = waProfile.profilePic;
                    console.log(`[CRMService] Got avatar from Whapi for ${cleanPhone}: ${avatarUrl.substring(0, 60)}...`);
                } else {
                    console.log(`[CRMService] No avatar from Whapi for ${cleanPhone} (profilePic: ${waProfile.profilePic || 'null'})`);
                }
            } catch (e) {
                console.warn('[CRMService] Failed to fetch WA avatar:', e);
            }
        }

        // 3. Update Snapshot Table
        const payload = {
            handle: cleanPhone,
            channel,
            name: name || cleanPhone,
            ltv,
            orders_count: ordersCount,
            average_ticket: avgTicket,
            risk_level: ltv > 5000 ? 'vip' : 'low',
            tags,
            last_shipping_status: lastShipping?.status,
            last_shipping_carrier: lastShipping?.carrier,
            last_shipping_tracking: lastShipping?.tracking,
            last_updated_at: new Date().toISOString()
        };

        // Fix #15: Protect existing avatar if new one is null
        if (avatarUrl) {
            (payload as any).avatar_url = avatarUrl;
        } else {
            // Check if we need to preserve existing?
            const { data: existing } = await supabase
                .from('crm_contact_snapshots')
                .select('avatar_url')
                .eq('handle', handle)
                .maybeSingle();

            if (existing?.avatar_url) {
                (payload as any).avatar_url = existing.avatar_url;
            }
        }

        const { data: snapshot, error } = await supabase
            .from('crm_contact_snapshots')
            .upsert(payload, { onConflict: 'handle' })
            .select('*')
            .single();

        if (error) {
            console.error('[CRMService] Snapshot sync failed:', error);
            throw error;
        }

        return snapshot;
    }

    /**
     * Gets a contact snapshot, syncing if stale (> 24h)
     */
    public async getContactSnapshot(handle: string, channel: string): Promise<any> {
        const { data } = await supabase
            .from('crm_contact_snapshots')
            .select('*')
            .eq('handle', handle)
            .maybeSingle();

        if (!data) {
            return this.syncContactSnapshot(handle, channel);
        }

        // Check staleness (e.g., 24 hours) - simplified for now, always return DB version,
        // frontend can trigger forced sync.
        return data;
    }

    /**
     * Gets customer context for AI personalization (pending orders, recent orders, LTV, etc.)
     */
    public async getCustomerContextForAI(handle: string): Promise<CustomerContext> {
        const cleanPhone = cleanupPhone(handle);
        const context: CustomerContext = { phone: cleanPhone };

        try {
            // 1. Get Client Profile
            // Note: total_spent column doesn't exist in clients table, removed
            const { data: client, error: clientError } = await supabase
                .from('clients')
                .select('id, name, email, phone, tags')
                .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%${cleanPhone.slice(-10)}%`)
                .maybeSingle();

            if (clientError) {
                console.error(`[CRMService] Client query failed:`, clientError.message);
            }

            if (client) {
                console.log(`[CRMService] Found client: ${client.id} (${client.name}) for phone ${cleanPhone}`);
                context.name = client.name || undefined;
                context.email = client.email || undefined;
                context.tags = client.tags || [];

                // 2. Get Orders for this client
                // Note: Using correct column names (total_amount not total_price, no line_items/tracking columns)
                const { data: orders, error: ordersError } = await supabase
                    .from('orders')
                    .select('id, order_number, total_amount, financial_status, fulfillment_status, status, shopify_created_at')
                    .eq('client_id', client.id)
                    .order('shopify_created_at', { ascending: false })
                    .limit(10);

                if (ordersError) {
                    console.error(`[CRMService] Orders query failed:`, ordersError.message);
                }

                console.log(`[CRMService] Found ${orders?.length || 0} orders for client_id ${client.id}`);

                if (orders && orders.length > 0) {
                    // Separate pending vs completed orders
                    const pendingOrders: CustomerContext['pendingOrders'] = [];
                    const recentOrders: CustomerContext['recentOrders'] = [];

                    for (const order of orders) {
                        const orderData = {
                            order_number: order.order_number || `#${order.id}`,
                            total: String(order.total_amount || '0'),
                            status: order.financial_status || order.status || 'pending',
                            fulfillment_status: order.fulfillment_status,
                            tracking_number: undefined, // Not available in orders table
                            tracking_url: undefined,    // Not available in orders table
                            created_at: order.shopify_created_at || new Date().toISOString(),
                            items: [] as string[] // Line items not stored in orders table
                        };

                        // Pending = not fulfilled or partially fulfilled
                        if (!order.fulfillment_status || order.fulfillment_status === 'partial' || order.fulfillment_status === 'unfulfilled') {
                            pendingOrders.push(orderData);
                        } else {
                            recentOrders.push({
                                order_number: orderData.order_number,
                                total: orderData.total,
                                created_at: orderData.created_at
                            });
                        }
                    }

                    context.pendingOrders = pendingOrders;
                    context.recentOrders = recentOrders.slice(0, 3);
                }
            } else {
                console.log(`[CRMService] No client found for phone ${cleanPhone}, trying orders table directly`);
                // Try to find orders by phone directly in orders table
                const { data: ordersOnly, error: ordersOnlyError } = await supabase
                    .from('orders')
                    .select('id, order_number, total_amount, financial_status, fulfillment_status, status, shopify_created_at, customer_phone')
                    .or(`customer_phone.ilike.%${cleanPhone}%,customer_phone.ilike.%${cleanPhone.slice(-10)}%`)
                    .order('shopify_created_at', { ascending: false })
                    .limit(5);

                if (ordersOnlyError) {
                    console.error(`[CRMService] Orders by phone query failed:`, ordersOnlyError.message);
                }

                if (ordersOnly && ordersOnly.length > 0) {
                    context.pendingOrders = ordersOnly
                        .filter(o => !o.fulfillment_status || o.fulfillment_status === 'partial' || o.fulfillment_status === 'unfulfilled')
                        .map(order => ({
                            order_number: order.order_number || `#${order.id}`,
                            total: String(order.total_amount || '0'),
                            status: order.financial_status || order.status || 'pending',
                            fulfillment_status: order.fulfillment_status,
                            tracking_number: undefined,
                            tracking_url: undefined,
                            created_at: order.shopify_created_at || new Date().toISOString(),
                            items: [] as string[]
                        }));
                }
            }

            console.log(`[CRMService] CustomerContext for ${cleanPhone}: ${context.pendingOrders?.length || 0} pending, ${context.recentOrders?.length || 0} recent orders`);

        } catch (e: any) {
            console.error(`[CRMService] getCustomerContextForAI failed for ${handle}:`, e.message);
        }

        return context;
    }

    /**
     * Creates a new conversation manually.
     */
    public async createConversation(payload: { channel: CRMConversation['channel'], handle: string, column_id?: string }): Promise<CRMConversation> {
        const { data, error } = await supabase
            .from('conversations')
            .insert({
                channel: payload.channel,
                contact_handle: payload.handle,
                column_id: payload.column_id || null,
                status: 'active'
            })
            .select('*')
            .single();

        if (error) throw new Error(`[CRMService] Failed to create manual conversation: ${error.message}`);
        return data;
    }

    /**
     * Get orders for a specific contact handle.
     */
    public async getClientOrders(handle: string): Promise<any[]> {
        // 1. Find Client by Handle (Phone or Email)
        const { data: client } = await supabase
            .from('clients')
            .select('id, email, phone')
            .or(`phone.eq.${handle},email.eq.${handle}`)
            .maybeSingle();

        let query = supabase.from('orders').select('*');

        if (client) {
            // 2a. Fetch Orders linked by client_id OR matching handle
            query = query.or(`client_id.eq.${client.id},customer_email.eq.${client.email || 'N/A'},customer_phone.eq.${client.phone || 'N/A'}`);
        } else {
            // 2b. Fallback: Search by handle directly (Phone/Email)
            const isEmail = handle.includes('@');
            if (isEmail) {
                query = query.eq('customer_email', handle);
            } else {
                // Robust Phone Match: Last 10 digits to handle country codes (e.g. +52)
                const cleanPhone = cleanupPhone(handle);
                if (cleanPhone.length >= 10) {
                    query = query.ilike('customer_phone', `%${cleanPhone}`);
                } else {
                    query = query.eq('customer_phone', handle);
                }
            }
            console.log(`[CRMService] No client found for handle: ${handle}, searching orders by literal/partial.`);
        }

        const { data: orders, error } = await query.order('created_at', { ascending: false });

        if (error) throw new Error(`Failed to fetch orders: ${error.message}`);

        // --- NEW: FETCH ABANDONED CHECKOUTS (Phase 53) ---
        let abandoned: any[] = [];
        if (client) {
            const { data: abandData } = await supabase
                .from('abandoned_checkouts')
                .select('*')
                .eq('client_id', client.id)
                .order('created_at', { ascending: false });
            abandoned = abandData || [];
        } else if (handle.includes('@')) {
            const { data: abandData } = await supabase
                .from('abandoned_checkouts')
                .select('*')
                .eq('email', handle)
                .order('created_at', { ascending: false });
            abandoned = abandData || [];
        }

        const abandonedFormatted = abandoned.map(a => ({
            id: 'ac_' + a.id,
            order_number: 'Carrito Abandonado',
            status: 'abandoned',
            total_amount: a.total_price,
            currency: a.currency,
            created_at: a.updated_at || a.created_at,
            shopify_order_id: a.shopify_checkout_id,
            is_abandoned: true,
            checkout_url: a.checkout_url
        }));

        const unifiedOrders = [...(orders || []), ...abandonedFormatted].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        // --- FALLBACK: If local DB empty, try Live Shopify Search ---
        if (unifiedOrders.length === 0) {
            console.log(`[CRMService] Local orders empty for ${handle}. Falling back to Live Shopify Search...`);
            try {
                // 1. Search customer in Shopify
                const customers = await searchShopifyCustomers(handle); // Works for email or phone query
                if (customers && customers.length > 0) {
                    const shopifyCustomer = customers[0];
                    console.log(`[CRMService] Found Live Shopify Customer: ${shopifyCustomer.id} (${shopifyCustomer.email})`);

                    // 2. Fetch Live Orders
                    const liveOrders = await getShopifyCustomerOrders(shopifyCustomer.id);
                    console.log(`[CRMService] Retrieved ${liveOrders.length} live orders.`);

                    // 3. Map to local format (lightweight)
                    return liveOrders.map((o: any) => ({
                        id: 'live_' + o.id, // temporary ID
                        order_number: o.name,
                        status: o.financial_status === 'paid' ? 'paid' : o.financial_status,
                        total_amount: o.total_price,
                        currency: o.currency,
                        created_at: o.created_at,
                        shopify_order_id: o.id,
                        is_live: true // Flag for UI
                    }));
                }
            } catch (fallbackErr) {
                console.warn('[CRMService] Live Fallback failed:', fallbackErr);
            }
        }

        return unifiedOrders;
    }

    /**
     * Analyzes conversation history to update facts (personality, interests, action plan).
     */
    public async syncConversationFacts(conversationId: string): Promise<any> {
        console.log(`[CRMService] Starting Fact Sync for: ${conversationId}`);

        try {
            // 1. Get Conversation and Messages
            const { data: conv } = await supabase.from('conversations').select('*').eq('id', conversationId).single();
            const messages = await this.getMessages(conversationId);

            if (!conv || messages.length < 2) return;

            // 2. Fetch Recent Browsing Behavior
            const last10 = cleanupPhone(conv.contact_handle);
            const { data: client } = await supabase
                .from('clients')
                .select('id, email')
                .or(`email.eq.${conv.contact_handle},phone.ilike.%${last10 || conv.contact_handle}`)
                .maybeSingle();

            const { data: browsingBehavior } = await supabase
                .from('browsing_events')
                .select('event_type, metadata, created_at, handle')
                .or(`handle.eq.${conv.contact_handle}${client ? `,client_id.eq.${client.id}` : ''}${client?.email ? `,handle.eq.${client.email}` : ''}`)
                .order('created_at', { ascending: false })
                .limit(10);

            const browsingText = browsingBehavior && browsingBehavior.length > 0
                ? browsingBehavior.map(b => `- [${b.created_at}] ${b.event_type}: ${JSON.stringify(b.metadata)}`).join('\n')
                : 'No recent browsing activity records.';

            // 3. Prepare analysis prompt
            const historyText = messages.slice(-15).map(m => `${m.role}: ${m.content}`).join('\n');
            const systemPrompt = `Analyze the conversation history and browsing behavior to extract user insights in JSON format.
            - personality: Array of 3 short traits (e.g., ["Directo", "Amable"]).
            - interests: Array of specific products mentioned or browsed (e.g., ["Sour Extreme Gummies"]).
            - intent_score: Number 0-100 indicating how close they are to buying.
            - friction_score: Number 0-100 (High = upset/stuck/churn risk).
            - emotional_vibe: One descriptive phrase of their current mood (e.g., "Frustrado por envío tardío", "Entusiasta esperando preventa").
            - browsing_summary: Concisely describe what they were looking at in the store (max 15 words).
            - user_email: Extract if mentioned in chat (e.g., "test@gmail.com").
            - user_name: Extract ONLY if it belongs to the CUSTOMER. DO NOT extract the Agent/Admin's name (e.g. Bernardo, Ara).
            - identity_ambiguity: Boolean (true if you detect conflicting names or are unsure who the customer is).
            - ambiguity_candidates: Array of strings (e.g. ["Bernardo", "Brittany"]) if ambiguity exists.
            - action_plan: Array of items { label, meta, action_type, payload }.
              - COMPULSORY: You MUST provide at least 1-3 actionable steps. If no urgent issue, suggest proactive outreach (e.g., "Saludar proactivamente", "Confirmar recepción de pedido", "Enviar recomendación de producto").
              - action_type: 'coupon' (payload: {discount, code}), 'link' (payload: {url}), or 'text' (payload: {newMessageText}).
            - system_inquiry: Optional object. Generate THIS instead of ambiguity_candidates if you need human help.
              - id: "inq_" + random string
              - type: "identity_ambiguity" | "ghost_data" | "error_resolution"
              - question: Short question for the admin (e.g. "Duplicate names found. Who is this?")
              - options: Array of { label, action, payload }. Action usually 'update_contact_name' or 'custom_response'.
              - allow_custom: ALWAYS set to true. Admins should always be able to provide a custom explanation.
              - context: Brief context about WHY this inquiry is being raised (helps admin understand the situation).
            
            IMPORTANT: Return ONLY the raw JSON object. Do not include markdown or text.`;

            const userPrompt = `Conversation History:\n${historyText}\n\nRecent Store Browsing:\n${browsingText}\n\nCurrent Facts: ${JSON.stringify(conv.facts || {})}`;

            // 3. Call AI for classification
            const result = await this.aiService.classify(systemPrompt, userPrompt);

            if (result) {
                // --- NEW: PROACTIVE NAME EXTRACTION (FAST GATE) ---
                // If AI missed it, look for patterns in last 5 messages
                if (!result.user_name) {
                    const greetingRegex = /(?:hola|hello|hi|buen(?:as)?\s*(?:dias|tardes|noches)),?\s*(?:soy|me llamo)?\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i;
                    for (const msg of messages.slice(-5)) {
                        // STRICT RULE: Only extract name from INBOUND messages (User saying their own name)
                        // OR Outbound messages where Agent says "Hola [ClientName]"
                        if (msg.direction === 'inbound') {
                            const match = msg.content.match(/(?:soy|me llamo)\s+([A-Z][a-z]+)/i); // User intro "Soy Juan"
                            if (match && match[1]) {
                                result.user_name = match[1];
                                logger.info(`[CRMService] Proactive Name Discovery (Inbound): Caught "${result.user_name}"`, { handle: conv.contact_handle });
                                break;
                            }
                        } else if (msg.direction === 'outbound' || msg.role === 'assistant') {
                            // Agent saying "Hola Brittany" -> Brittany is the user
                            const match = msg.content.match(/hola\s+([A-Z][a-z]+)/i);
                            if (match && match[1] && match[1].toLowerCase() !== 'bernardo') { // Safety check against self-greeting loops
                                result.user_name = match[1];
                                logger.info(`[CRMService] Proactive Name Discovery (Outbound): Caught "${result.user_name}"`, { handle: conv.contact_handle });
                                break;
                            }
                        }
                    }
                } // End if !result.user_name
                // 4. Merge with existing facts
                const newFacts = {
                    ...conv.facts,
                    personality: result.personality || (conv as any).facts?.personality || [],
                    interests: result.interests || (conv as any).facts?.interests || [],
                    intent_score: result.intent_score ?? (conv as any).facts?.intent_score,
                    friction_score: result.friction_score ?? (conv as any).facts?.friction_score,
                    emotional_vibe: result.emotional_vibe || (conv as any).facts?.emotional_vibe,
                    user_email: result.user_email || (conv as any).facts?.user_email,
                    user_name: result.user_name || (conv as any).facts?.user_name,
                    action_plan: result.action_plan || (conv as any).facts?.action_plan || [],
                    system_inquiry: result.system_inquiry || (conv as any).facts?.system_inquiry
                };

                // --- IDENTITY BRIDGE: IF EMAIL FOUND, UPDATE CLIENT RECORD ---
                if (result.user_email && !conv.contact_handle.includes('@')) {
                    try {
                        const cleanPhone = cleanupPhone(conv.contact_handle);
                        await supabase.from('clients').upsert({
                            phone: cleanPhone,
                            email: result.user_email,
                            name: result.user_name || (conv as any).facts?.user_name
                        }, { onConflict: 'phone' });
                        logger.info(`[CRMService] Identity Bridge: Linked ${cleanPhone} to ${result.user_email} via Chat Analysis.`, { handle: conv.contact_handle });

                        // Force a snapshot sync to propagate the new name/info to the Kanban UI
                        await this.syncContactSnapshot(conv.contact_handle, conv.channel);
                    } catch (e) {
                        logger.warn('[CRMService] Identity Bridge update failed:', e, { handle: conv.contact_handle });
                        // Fix #8: E-mail Discovery Retry (Simple robustness)
                        try {
                            await new Promise(r => setTimeout(r, 1000));
                            // Retry logic ... implementation omitted for brevity, just re-running upsert if needed
                            // but Identity Bridge is best effort.
                            // Actually user requested "Email discovery retry".
                            console.log('[CRMService] Retrying Identity Bridge...');
                            const cleanPhone = cleanupPhone(conv.contact_handle);
                            await supabase.from('clients').upsert({
                                phone: cleanPhone,
                                email: result.user_email,
                                name: result.user_name
                            }, { onConflict: 'phone' });
                        } catch (retryErr) {
                            console.error('[CRMService] Identity Bridge Retry Failed Definitively:', retryErr);
                        }
                    }
                }

                // 5. Update DB
                await supabase
                    .from('conversations')
                    .update({ facts: newFacts })
                    .eq('id', conversationId);

                // --- NEW: IDENTITY PROMOTION (Phase 63) ---
                if (result.user_name) {
                    try {
                        const { data: currentSnapshot } = await supabase
                            .from('crm_contact_snapshots')
                            .select('name')
                            .eq('handle', conv.contact_handle)
                            .single();

                        // Promote if snapshot has no name OR name is just the phone number
                        const needsPromotion =
                            !currentSnapshot?.name ||
                            currentSnapshot.name === conv.contact_handle ||
                            currentSnapshot.name.replace(/\D/g, '') === conv.contact_handle.replace(/\D/g, '');

                        if (needsPromotion) {
                            console.log(`[CRMService] Promoting Identity: "${result.user_name}" for ${conv.contact_handle}`);
                            await supabase
                                .from('crm_contact_snapshots')
                                .update({ name: result.user_name })
                                .eq('handle', conv.contact_handle);
                        }
                    } catch (promoErr) {
                        console.error('[CRMService] Identity promotion failed:', promoErr);
                    }
                }

                // Duplicate Identity Promotion block removed (Phase 66 audit fix)

                console.log(`[CRMService] facts updated for ${conversationId} (Predicted Friction: ${result.friction_score})`);

                // Fix #6: Return facts
                return newFacts;
            }
        } catch (err) {
            console.error('[CRMService] syncConversationFacts failed:', err);
        }
    }

    /**
     * Orchestrator: Chips Management
     */
    public async getChannelChips() {
        const { data, error } = await supabase.from('channel_chips').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    }

    public async getMiniChips() {
        const { data, error } = await supabase.from('mini_chips').select('*').order('priority', { ascending: false });
        if (error) throw error;
        return data;
    }

    public async upsertChannelChip(chip: any) {
        const { data, error } = await supabase.from('channel_chips').upsert(chip).select().single();
        if (error) throw error;
        return data;
    }

    public async upsertMiniChip(chip: any) {
        const { data, error } = await supabase.from('mini_chips').upsert(chip).select().single();
        if (error) throw error;
        return data;
    }

    public async updateContactSnapshot(handle: string, channel: string, updates: Partial<ContactSnapshot>): Promise<ContactSnapshot> {
        console.log(`[CRMService] Updating snapshot for ${handle}: ${JSON.stringify(updates)}`);

        // 1. Get existing or create if missing
        const cleanHandle = cleanupPhone(handle);
        const { data: existing } = await supabase
            .from('crm_contact_snapshots')
            .select('*')
            .eq('handle', cleanHandle)
            .eq('channel', channel)
            .maybeSingle();

        if (existing) {
            const { data, error } = await supabase
                .from('crm_contact_snapshots')
                .update({ ...updates, last_updated_at: new Date().toISOString() })
                .eq('id', existing.id)
                .select('*')
                .single();

            if (error) throw new Error(error.message);
            return data;
        } else {
            // Create new
            const { data, error } = await supabase
                .from('crm_contact_snapshots')
                .insert({
                    handle: cleanHandle,
                    channel,
                    ...updates,
                    last_updated_at: new Date().toISOString()
                })
                .select('*')
                .single();

            if (error) throw new Error(error.message);
            return data;
        }
    }

    public async updateConversationFacts(conversationId: string, updates: Partial<any>): Promise<any> {
        console.log(`[CRMService] Updating facts for conv ${conversationId}: ${JSON.stringify(updates)}`);

        // 1. Get current facts
        const { data: conv } = await supabase
            .from('conversations')
            .select('facts')
            .eq('id', conversationId)
            .single();

        if (!conv) throw new Error('Conversation not found');

        const currentFacts = conv.facts || {};
        const newFacts = { ...currentFacts, ...updates };

        const { data, error } = await supabase
            .from('conversations')
            .update({ facts: newFacts })
            .eq('id', conversationId)
            .select('facts')
            .single();

        if (error) throw new Error(error.message);
        return data.facts;
    }

    public async resolveInquiry(conversationId: string, inquiryId: string, action: string, payload: any, customValue?: string): Promise<any> {
        console.log(`[CRMService] Resolving inquiry ${inquiryId} with action ${action}`);

        // 1. Get Conversation to check handle and facts
        const { data: conv } = await supabase
            .from('conversations')
            .select('*')
            .eq('id', conversationId)
            .single();

        if (!conv) throw new Error('Conversation not found');

        // 1.1 Validate Inquiry matches valid state
        const activeInquiry = conv.facts?.system_inquiry;
        if (!activeInquiry || activeInquiry.id !== inquiryId) {
            console.warn(`[CRMService] Warning: Inquiry ${inquiryId} mismatch or already resolved.`);
            throw new Error(`Inquiry ${inquiryId} is not active on this conversation.`);
        }

        // 2. Handle Action Logic
        if (action === 'update_contact_name' || action === 'custom_response') {
            const name = customValue || payload?.name;
            if (name) {
                await this.updateContactSnapshot(conv.contact_handle, conv.channel, { name });
            }
        }

        // Ghost Data Logic (Example)
        if (action === 'ghost_mark_delivered') {
            // Logic to update order status would go here
            // For now, we assume the AI just needed confirmation
        }

        // 3. LOG RESOLUTION FOR LEARNING (Smart System Improvement)
        // Save inquiry resolutions to system_logs so the system can learn patterns
        try {
            await supabase.from('system_logs').insert({
                event_type: 'inquiry_resolution',
                message: `Inquiry resolved: ${activeInquiry.type} - ${action}`,
                metadata: {
                    inquiry_id: inquiryId,
                    inquiry_type: activeInquiry.type,
                    inquiry_question: activeInquiry.question,
                    inquiry_context: activeInquiry.context,
                    action_taken: action,
                    custom_explanation: customValue || null,
                    payload: payload,
                    conversation_id: conversationId,
                    contact_handle: conv.contact_handle,
                    // This data helps the AI learn from human decisions
                    learning_context: {
                        original_options: activeInquiry.options?.map((o: any) => o.label),
                        selected_action: action,
                        was_custom_response: action === 'custom_response',
                        human_explanation: customValue
                    }
                }
            });
            console.log(`[CRMService] Inquiry resolution logged for learning: ${inquiryId}`);
        } catch (logError: any) {
            console.warn(`[CRMService] Failed to log inquiry resolution:`, logError.message);
            // Don't fail the resolution if logging fails
        }

        // 4. Clear Inquiry from Facts (Resolution)
        const currentFacts = conv.facts || {};
        const newFacts = { ...currentFacts };

        // Remove system_inquiry
        if (newFacts.system_inquiry && newFacts.system_inquiry.id === inquiryId) {
            delete newFacts.system_inquiry;
        }

        // Also remove legacy identity_ambiguity if present
        if (newFacts.identity_ambiguity) {
            delete newFacts.identity_ambiguity;
            delete newFacts.ambiguity_candidates;
        }

        // Update DB
        const { data, error } = await supabase
            .from('conversations')
            .update({ facts: newFacts })
            .eq('id', conversationId)
            .select('facts')
            .single();

        if (error) throw new Error(error.message);
        return data.facts;
    }
}
