
import { supabase } from '../config/supabase';
import { AIService } from './aiService';
import fs from 'fs';
import path from 'path';

// Base directory for metadata
const KNOWLEDGE_BASE_DIR = path.join(__dirname, '../../data/ai_knowledge_base');

export interface CRMMessage {
    id?: string;
    conversation_id: string;
    direction: 'inbound' | 'outbound';
    role: 'user' | 'assistant' | 'system';
    message_type: 'text' | 'image' | 'video' | 'audio' | 'file' | 'template' | 'event';
    status: 'queued' | 'sent' | 'delivered' | 'read' | 'failed';
    external_id?: string;
    channel_thread_id?: string;
    content: string;
    raw_payload?: any;
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
    facts?: any;
    facts_version?: number;
    agent_override_id?: string;
    model_override?: string;
    last_message_at: string;
}

export class CRMService {
    private static instance: CRMService;
    private aiService: AIService;

    private constructor() {
        this.aiService = AIService.getInstance();
    }

    public static getInstance(): CRMService {
        if (!CRMService.instance) {
            CRMService.instance = new CRMService();
        }
        return CRMService.instance;
    }

    /**
     * Finds or creates a conversation based on channel and handle.
     */
    public async getOrCreateConversation(channel: CRMConversation['channel'], handle: string): Promise<CRMConversation> {
        // 1. Try to find existing
        const { data: existing, error: findError } = await supabase
            .from('conversations')
            .select('*')
            .eq('channel', channel)
            .eq('contact_handle', handle)
            .single();

        if (existing) return existing;

        // 2. Find default column (usually the first one by position)
        const { data: defaultCol } = await supabase
            .from('crm_columns')
            .select('id')
            .order('position', { ascending: true })
            .limit(1)
            .single();

        // 3. Create new
        const { data: created, error: createError } = await supabase
            .from('conversations')
            .insert({
                channel,
                contact_handle: handle,
                column_id: defaultCol?.id || null,
                status: 'active'
            })
            .select('*')
            .single();

        if (createError) throw new Error(`[CRMService] Failed to create conversation: ${createError.message}`);
        return created;
    }

    /**
     * Appends a message to a conversation and updates the last_message_at timestamp.
     */
    public async appendMessage(msg: CRMMessage): Promise<CRMMessage> {
        const { data, error } = await supabase
            .from('crm_messages')
            .insert(msg)
            .select('*')
            .single();

        if (error) throw new Error(`[CRMService] Failed to append message: ${error.message}`);

        // Update conversation timestamp
        await supabase
            .from('conversations')
            .update({ last_message_at: new Date().toISOString() })
            .eq('id', msg.conversation_id);

        return data;
    }

    /**
     * Dispatcher logic with Fast Gates.
     * Decides if an incoming message needs an AI response or just a status update.
     */
    public async processInbound(channel: CRMConversation['channel'], handle: string, content: string, raw: any): Promise<void> {
        const conversation = await this.getOrCreateConversation(channel, handle);

        // 1. Log inbound message
        await this.appendMessage({
            conversation_id: conversation.id,
            direction: 'inbound',
            role: 'user',
            message_type: 'text',
            status: 'delivered',
            content,
            raw_payload: raw
        });

        // 2. Load Column Brain (Inheritance)
        const { data: column } = await supabase
            .from('crm_columns')
            .select('*')
            .eq('id', conversation.column_id)
            .single();

        if (!column || column.mode === 'HUMAN_MODE') {
            console.log(`[CRMService] Column ${column?.name || 'unknown'} is in HUMAN_MODE or missing. AI silenced.`);
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
        let toolsWhitelist: string[] = [];
        const policy = config.tools_policy || { mode: 'inherit' };

        if (policy.mode === 'override') {
            toolsWhitelist = policy.allowed_tools || [];
        } else {
            // Inherit from Agent Metadata
            const meta = await this.getAgentMetadata(agentId);
            toolsWhitelist = meta?.default_tools || [];
        }

        console.log(`[CRMService] Dispatching to Agent: ${agentId} [${model}] in Column: ${column.name}`);

        // 5. Dispatch to AI with Context Inheritance
        try {
            // Merge column specific tool constraints into the AI call 
            // (Final implementation will involve passing toolsWhitelist to AIService)
            const response = await this.aiService.chatWithPersona(
                agentId,
                content,
                [], // Fetch history logic can be added here
                model,
                { toolsWhitelist } // Custom parameter to enforce column-specific tool access
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
        } catch (aiError) {
            console.error('[CRMService] AI Dispatch failed:', aiError);
        }
    }

    /**
     * Gets all active and review conversations.
     */
    public async getConversations(): Promise<CRMConversation[]> {
        const { data, error } = await supabase
            .from('conversations')
            .select('*')
            .in('status', ['active', 'review', 'paused'])
            .order('last_message_at', { ascending: false });

        if (error) throw new Error(`[CRMService] Failed to fetch conversations: ${error.message}`);
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

    public async updateColumnConfig(columnId: string, mode: string, config: any): Promise<void> {
        const { error } = await supabase
            .from('crm_columns')
            .update({
                mode,
                config,
                updated_at: new Date().toISOString()
            })
            .eq('id', columnId);

        if (error) throw new Error(`[CRMService] Failed to update column config: ${error.message}`);
    }
}
