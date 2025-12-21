"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CRMService = void 0;
const supabase_1 = require("../config/supabase");
const aiService_1 = require("./aiService");
const whapiService_1 = require("./whapiService");
const emailService_1 = require("./emailService");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
// Base directory for metadata
const KNOWLEDGE_BASE_DIR = path_1.default.join(__dirname, '../../data/ai_knowledge_base');
class CRMService {
    constructor() {
        this.aiService = aiService_1.AIService.getInstance();
    }
    static getInstance() {
        if (!CRMService.instance) {
            CRMService.instance = new CRMService();
        }
        return CRMService.instance;
    }
    /**
     * Finds or creates a conversation based on channel and handle.
     */
    async getOrCreateConversation(channel, handle) {
        console.log(`[CRMService] [TRACE_CONV] Entry for handle: ${handle}, channel: ${channel}`);
        // 1. Try to find existing (Exact match)
        const { data: exactMatch, error: exactError } = await supabase_1.supabase
            .from('conversations')
            .select('*')
            .eq('channel', channel)
            .eq('contact_handle', handle)
            .maybeSingle();
        if (exactError)
            console.error(`[CRMService] [TRACE_CONV] Exact match error: ${exactError.message}`);
        if (exactMatch) {
            console.log(`[CRMService] [TRACE_CONV] Found Exact Match: ${exactMatch.id}`);
            return exactMatch;
        }
        console.log(`[CRMService] [TRACE_CONV] No exact match. Checking strategies...`);
        // 2. Fuzzy match for WhatsApp (Match by last 10 digits)
        if (channel === 'WA') {
            const last10 = handle.substring(handle.length - 10);
            if (last10.length === 10) {
                const { data: fuzzyMatches, error: fuzzyError } = await supabase_1.supabase
                    .from('conversations')
                    .select('*')
                    .eq('channel', 'WA')
                    .ilike('contact_handle', `%${last10}`);
                if (fuzzyError)
                    console.error(`[CRMService] [TRACE_CONV] Fuzzy match error: ${fuzzyError.message}`);
                if (fuzzyMatches && fuzzyMatches.length > 0) {
                    console.log(`[CRMService] [TRACE_CONV] Fuzzy match found: ${handle} -> ${fuzzyMatches[0].contact_handle} (${fuzzyMatches[0].id})`);
                    return fuzzyMatches[0];
                }
            }
        }
        console.log(`[CRMService] [TRACE_CONV] No matches found. Creating new conversation...`);
        // 3. Find default column (usually the first one by position)
        const { data: defaultCol, error: colError } = await supabase_1.supabase
            .from('crm_columns')
            .select('id')
            .order('position', { ascending: true })
            .limit(1)
            .maybeSingle();
        if (colError)
            console.error(`[CRMService] [TRACE_CONV] Default column error: ${colError.message}`);
        console.log(`[CRMService] [TRACE_CONV] Using default column: ${defaultCol?.id}`);
        // 4. Create new
        const { data: created, error: createError } = await supabase_1.supabase
            .from('conversations')
            .insert({
            channel,
            contact_handle: handle,
            column_id: defaultCol?.id || null,
            status: 'active'
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
     * Appends a message to a conversation and updates the last_message_at timestamp.
     * If the message is outbound, it attempts to dispatch it to the real channel.
     */
    async appendMessage(msg) {
        // Extract skipDispatch so it doesn't go into the DB (it's a local flag)
        const { skipDispatch, ...dbMsg } = msg;
        console.log(`[CRMService] [DEBUG] Attempting Insert. Content: ${dbMsg.content.substring(0, 20)}... Type: ${dbMsg.message_type}`);
        // Insert into DB first
        const { data: insertedMsg, error: insertError } = await supabase_1.supabase
            .from('crm_messages')
            .insert(dbMsg)
            .select('*')
            .single();
        if (insertError) {
            console.error('[CRMService] [FATAL] Insert Error:', JSON.stringify(insertError));
            throw new Error(`[CRMService] Failed to append message: ${insertError.message}`);
        }
        console.log(`[CRMService] [DEBUG] Insert Success. ID: ${insertedMsg.id}`);
        // Update conversation timestamp
        await supabase_1.supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', msg.conversation_id);
        // REAL DISPATCH: If outbound, send to actual WhatsApp/Email
        // But SKIP if skipDispatch is true (used for echoes)
        if (msg.direction === 'outbound' && msg.role !== 'system' && !skipDispatch) {
            this.dispatchMessage(msg.conversation_id, insertedMsg.id, msg.content).catch(err => {
                console.error('[CRMService] Background dispatch error:', err);
            });
        }
        return insertedMsg;
    }
    /**
     * Dispatcher to real-world channels
     */
    async dispatchMessage(conversationId, messageId, content) {
        try {
            // Get conversation details
            const { data: conv } = await supabase_1.supabase
                .from('conversations')
                .select('channel, contact_handle')
                .eq('id', conversationId)
                .single();
            if (!conv)
                return;
            let success = false;
            let errorMsg = '';
            if (conv.channel === 'WA') {
                const res = await (0, whapiService_1.sendWhatsAppMessage)({ to: conv.contact_handle, body: content });
                success = res.sent;
                errorMsg = res.error || '';
            }
            else if (conv.channel === 'EMAIL') {
                const res = await (0, emailService_1.sendDataEmail)(conv.contact_handle, '[EUM] Nuevo mensaje de Ara', content, { fromName: 'Ara de Extractos EUM', replyTo: 'ara@extractoseum.com' });
                success = res.success;
                errorMsg = res.error || '';
            }
            // Update status in DB
            await supabase_1.supabase
                .from('crm_messages')
                .update({
                status: success ? 'delivered' : 'failed',
                raw_payload: !success ? { error: errorMsg } : {}
            })
                .eq('id', messageId);
        }
        catch (err) {
            console.error('[CRMService] Dispatch failed:', err);
            await supabase_1.supabase
                .from('crm_messages')
                .update({ status: 'failed', raw_payload: { system_error: err.message } })
                .eq('id', messageId);
        }
    }
    /**
     * Dispatcher logic with Fast Gates.
     * Decides if an incoming message needs an AI response or just a status update.
     */
    async processInbound(channel, handle, content, raw) {
        console.log(`[CRMService] Incoming Inbound: ${handle} (Channel: ${channel})`);
        console.log(`[CRMService] Incoming RAW:`, JSON.stringify(raw).substring(0, 500));
        const conversation = await this.getOrCreateConversation(channel, handle);
        // 1. Log message (Could be inbound from customer OR outbound from external mobile app/echo)
        await this.appendMessage({
            conversation_id: conversation.id,
            direction: raw.direction || 'inbound',
            role: raw.role || 'user',
            message_type: raw.type || 'text',
            status: 'delivered',
            content,
            raw_payload: raw,
            // DO NOT re-dispatch if this is already an outbound message (echo)
            skipDispatch: (raw.direction === 'outbound' || raw.from_me === true || raw._generated_from_me === true)
        });
        // 2. Load Column Brain (Inheritance)
        const { data: column } = await supabase_1.supabase
            .from('crm_columns')
            .select('*')
            .eq('id', conversation.column_id)
            .single();
        if (!column || column.mode === 'HUMAN_MODE') {
            console.log(`[CRMService] Column ${column?.name || 'unknown'} is in HUMAN_MODE or missing. AI silenced.`);
            return;
        }
        // 2.1 STOP if this is my own message (prevent infinite loops)
        // Check raw.from_me OR the explicit controller flag _generated_from_me
        if (raw.from_me || raw._generated_from_me === true || raw.direction === 'outbound' || raw.role === 'assistant') {
            console.log(`[CRMService] Skipping AI for outbound/assistant message (Flag: ${raw._generated_from_me}, Raw: ${raw.from_me}).`);
            return;
        }
        // 2.2 EMERGENCY LOOP BREAKER
        // If the message contains the AI's own signature, it is a self-reply loop. STOP.
        // Use lower case check to capture "Soy Ara", "soy Ara", "SOY ARA" etc.
        const lowerContent = content.toLowerCase();
        if (lowerContent.includes('test_09002') || lowerContent.includes('soy ara')) {
            console.log(`[CRMService] Skipping AI - Detected self-signature in content.`);
            return;
        }
        // 3. Fast Gate: Low Value Content
        const lowValuePattern = /^(ok|gracias|thanks|👍|emoji|hola|hello|hi|si|no|chau|bye)$/i;
        if (lowValuePattern.test(content.trim())) {
            console.log(`[CRMService] Low value content detected. Skipping LLM.`);
            return;
        }
        // 4. Operational Brain Config
        const config = column.config || {};
        const agentId = conversation.agent_override_id || config.agent_id || 'sales_ara';
        const model = conversation.model_override || config.model || 'gpt-4o';
        // Resolve Tools Whitelist based on Policy
        let toolsWhitelist = [];
        const policy = config.tools_policy || { mode: 'inherit' };
        if (policy.mode === 'override') {
            toolsWhitelist = policy.allowed_tools || [];
        }
        else {
            // Inherit from Agent Metadata
            const meta = await this.getAgentMetadata(agentId);
            toolsWhitelist = meta?.default_tools || [];
        }
        console.log(`[CRMService] Dispatching to Agent: ${agentId} [${model}] in Column: ${column.name}`);
        // 5. Dispatch to AI with Context Inheritance
        try {
            // Merge column specific tool constraints into the AI call 
            // (Final implementation will involve passing toolsWhitelist to AIService)
            const response = await this.aiService.chatWithPersona(agentId, content, [], // Fetch history logic can be added here
            model, { toolsWhitelist } // Custom parameter to enforce column-specific tool access
            );
            if (response && response.content) {
                // Log outbound message (AI Response)
                await this.appendMessage({
                    conversation_id: conversation.id,
                    direction: 'outbound',
                    role: 'assistant',
                    message_type: 'text',
                    status: 'sent',
                    content: response.content,
                    raw_payload: response
                });
                // Auto-move logic if guardrails triggered (Phase 3)
            }
            // 6. Automatic Fact Synchronization (AI Analysis)
            // Fire and forget in the background
            this.syncConversationFacts(conversation.id).catch(err => console.error(`[CRMService] Fact sync failed for ${conversation.id}:`, err));
        }
        catch (aiError) {
            console.error('[CRMService] AI Dispatch failed:', aiError);
        }
    }
    /**
     * Gets conversations by status.
     * By default returns active types for the Kanban.
     */
    async getConversations(status = ['active', 'review', 'paused']) {
        console.log('[CRMService] Fetching conversations (v2.5 enrichment)...');
        const { data: convs, error } = await supabase_1.supabase
            .from('conversations')
            .select('*')
            .in('status', status)
            .order('last_message_at', { ascending: false });
        if (error)
            throw new Error(`[CRMService] Failed to fetch conversations: ${error.message}`);
        if (!convs || convs.length === 0)
            return [];
        // 1. Collect all handles to fetch snapshots in bulk
        const handles = Array.from(new Set(convs.map(c => c.contact_handle)));
        // 2. Fetch snapshots
        const { data: snapshots } = await supabase_1.supabase
            .from('crm_contact_snapshots')
            .select('handle, name, ltv, risk_level')
            .in('handle', handles);
        // 3. Merge snapshots into conversations for UI enrichment
        const snapshotMap = (snapshots || []).reduce((acc, s) => {
            acc[s.handle] = s;
            return acc;
        }, {});
        return convs.map(conv => ({
            ...conv,
            contact_name: snapshotMap[conv.contact_handle]?.name || null,
            ltv: snapshotMap[conv.contact_handle]?.ltv || 0,
            risk_level: snapshotMap[conv.contact_handle]?.risk_level || 'low'
        }));
    }
    /**
     * Archive a conversation.
     */
    async archiveConversation(id) {
        const { error } = await supabase_1.supabase
            .from('conversations')
            .update({ status: 'archived' })
            .eq('id', id);
        if (error)
            throw error;
    }
    /**
     * Close a conversation.
     */
    async closeConversation(id) {
        const { error } = await supabase_1.supabase
            .from('conversations')
            .update({ status: 'closed' })
            .eq('id', id);
        if (error)
            throw error;
    }
    /**
     * Delete a conversation and its messages.
     */
    async deleteConversation(id) {
        // RLS or cascade should handle messages, but let's be safe
        await supabase_1.supabase.from('crm_messages').delete().eq('conversation_id', id);
        const { error } = await supabase_1.supabase.from('conversations').delete().eq('id', id);
        if (error)
            throw error;
    }
    /**
     * Gets all messages for a specific conversation.
     */
    async getMessages(conversationId) {
        const { data, error } = await supabase_1.supabase
            .from('crm_messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });
        if (error)
            throw new Error(`[CRMService] Failed to fetch messages: ${error.message}`);
        return data || [];
    }
    /**
     * Gets all columns for the Kanban board.
     */
    async getColumns() {
        const { data, error } = await supabase_1.supabase
            .from('crm_columns')
            .select('*')
            .order('position', { ascending: true });
        return data || [];
    }
    /**
     * Moves a conversation between columns.
     */
    async moveConversation(conversationId, targetColumnId) {
        // Get column names for logging
        const { data: cols } = await supabase_1.supabase
            .from('crm_columns')
            .select('id, name');
        const { data: conv, error: convError } = await supabase_1.supabase
            .from('conversations')
            .select('column_id')
            .eq('id', conversationId)
            .single();
        if (convError || !conv)
            throw new Error(`[CRMService] Conversation not found: ${conversationId}`);
        const fromCol = cols?.find(c => c.id === conv.column_id)?.name || 'Unknown';
        const toCol = cols?.find(c => c.id === targetColumnId)?.name || 'Unknown';
        const { error } = await supabase_1.supabase
            .from('conversations')
            .update({ column_id: targetColumnId })
            .eq('id', conversationId);
        if (error)
            throw new Error(`[CRMService] Failed to move conversation: ${error.message}`);
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
    async getAgentMetadata(agentId) {
        const categories = ['agents_god_mode', 'agents_public', 'agents_internal'];
        for (const cat of categories) {
            const metaPath = path_1.default.join(KNOWLEDGE_BASE_DIR, cat, agentId, 'metadata.json');
            if (fs_1.default.existsSync(metaPath)) {
                try {
                    return JSON.parse(fs_1.default.readFileSync(metaPath, 'utf-8'));
                }
                catch (e) {
                    console.error(`[CRMService] Error reading metadata for ${agentId}:`, e);
                }
            }
        }
        return null;
    }
    async updateColumnConfig(columnId, mode, config) {
        const { error } = await supabase_1.supabase
            .from('crm_columns')
            .update({
            mode,
            config,
            updated_at: new Date().toISOString()
        })
            .eq('id', columnId);
        if (error)
            throw new Error(`[CRMService] Failed to update column config: ${error.message}`);
    }
    /**
     * Aggregates customer data and updates the snapshot cache.
     */
    async syncContactSnapshot(handle, channel) {
        // 1. Fetch Client Profile (if exists)
        // Normalize handle (remove +52 for search if needed, or exact match)
        const { data: client } = await supabase_1.supabase
            .from('clients')
            .select('*')
            .or(`phone.eq.${handle},email.eq.${handle}`)
            .single();
        let ltv = 0;
        let ordersCount = 0;
        let avgTicket = 0;
        let risk = 'low';
        let tags = [];
        let name = '';
        let lastShipping = null;
        if (client) {
            name = client.name;
            tags = client.tags || [];
            // 2. Fetch Orders (Mocking logic for now if order table not strict linked)
            // Ideally we query 'orders' table by client_id or email
            // For V1, we trust 'facts' or do a quick lookup if 'orders' table exists and has phone/email
            const { data: orders } = await supabase_1.supabase
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
        // 3. Update Snapshot Table
        const { data: snapshot, error } = await supabase_1.supabase
            .from('crm_contact_snapshots')
            .upsert({
            handle,
            channel,
            name: name || handle,
            ltv,
            orders_count: ordersCount,
            average_ticket: avgTicket,
            risk_level: ltv > 5000 ? 'vip' : 'low',
            tags,
            last_shipping_status: lastShipping?.status,
            last_shipping_carrier: lastShipping?.carrier,
            last_shipping_tracking: lastShipping?.tracking,
            last_updated_at: new Date().toISOString()
        }, { onConflict: 'handle' })
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
    async getContactSnapshot(handle, channel) {
        const { data } = await supabase_1.supabase
            .from('crm_contact_snapshots')
            .select('*')
            .eq('handle', handle)
            .single();
        if (!data) {
            return this.syncContactSnapshot(handle, channel);
        }
        // Check staleness (e.g., 24 hours) - simplified for now, always return DB version, 
        // frontend can trigger forced sync.
        return data;
    }
    /**
     * Creates a new conversation manually.
     */
    async createConversation(payload) {
        const { data, error } = await supabase_1.supabase
            .from('conversations')
            .insert({
            channel: payload.channel,
            contact_handle: payload.handle,
            column_id: payload.column_id || null,
            status: 'active'
        })
            .select('*')
            .single();
        if (error)
            throw new Error(`[CRMService] Failed to create manual conversation: ${error.message}`);
        return data;
    }
    /**
     * Get orders for a specific contact handle.
     */
    async getClientOrders(handle) {
        // 1. Find Client by Handle (Phone or Email)
        const { data: client } = await supabase_1.supabase
            .from('clients')
            .select('id')
            .or(`phone.eq.${handle},email.eq.${handle}`)
            .single();
        if (!client) {
            console.log(`[CRMService] No client found for handle: ${handle}`);
            return [];
        }
        // 2. Fetch Orders linked by client_id
        const { data: orders, error } = await supabase_1.supabase
            .from('orders')
            .select('*')
            .eq('client_id', client.id)
            .order('created_at', { ascending: false });
        if (error)
            throw new Error(`Failed to fetch orders: ${error.message}`);
        return orders || [];
    }
    /**
     * Analyzes conversation history to update facts (personality, interests, action plan).
     */
    async syncConversationFacts(conversationId) {
        console.log(`[CRMService] Starting Fact Sync for: ${conversationId}`);
        try {
            // 1. Get Conversation and Messages
            const { data: conv } = await supabase_1.supabase.from('conversations').select('*').eq('id', conversationId).single();
            const messages = await this.getMessages(conversationId);
            if (!conv || messages.length < 2)
                return;
            // 2. Prepare analysis prompt
            const historyText = messages.slice(-15).map(m => `${m.role}: ${m.content}`).join('\n');
            const systemPrompt = `Analyze the conversation history and extract user insights in JSON format.
            - personality: Array of 3 short traits (e.g., ["Directo", "Amable"]).
            - interests: Array of specific products mentioned (e.g., ["Sour Extreme Gummies"]).
            - action_plan: Array of items { label, meta, action_type, payload }.
              - action_type: 'coupon' (payload: {discount, code}) or 'link' (payload: {url}).
            
            IMPORTANT: Return ONLY the raw JSON object. Do not include markdown or text.`;
            const userPrompt = `History:\n${historyText}\n\nCurrent Facts: ${JSON.stringify(conv.facts || {})}`;
            // 3. Call AI for classification
            const result = await this.aiService.classify(systemPrompt, userPrompt);
            if (result) {
                // 4. Merge with existing facts (especially tags)
                const newFacts = {
                    ...conv.facts,
                    personality: result.personality || conv.facts?.personality || [],
                    interests: result.interests || conv.facts?.interests || [],
                    action_plan: result.action_plan || conv.facts?.action_plan || []
                };
                // 5. Update DB
                await supabase_1.supabase
                    .from('conversations')
                    .update({ facts: newFacts })
                    .eq('id', conversationId);
                console.log(`[CRMService] facts updated for ${conversationId}`);
            }
        }
        catch (err) {
            console.error('[CRMService] syncConversationFacts failed:', err);
        }
    }
}
exports.CRMService = CRMService;
