
import axios from 'axios';
import { supabase } from '../config/supabase';
import { normalizePhone } from '../utils/phoneUtils';
import { handleToolCall } from './VapiToolHandlers';

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = 'https://api.vapi.ai';

// Phone number IDs for different countries
const VAPI_PHONE_MX = process.env.VAPI_PHONE_NUMBER_ID || process.env.VAPI_PHONE_NUMBER_ID_MX;
const VAPI_PHONE_US = process.env.VAPI_PHONE_NUMBER_ID_US;

const vapiApi = axios.create({
    baseURL: VAPI_BASE_URL,
    headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
    }
});

interface ClientContext {
    client_id?: string;
    name?: string;
    email?: string;
    phone?: string;
    first_order_date?: string;
    total_orders?: number;
    ltv?: number;
    last_order?: {
        order_number: string;
        status: string;
        created_at: string;
        total: number;
    };
    pending_orders?: Array<{
        order_number: string;
        status: string;
        estimated_delivery?: string;
    }>;
    favorite_products?: string[];
    tags?: string[];
    emotional_vibe?: string;
    last_interaction?: string;
}

interface ConversationContext {
    conversation_id: string;
    channel: string;
    recent_messages?: Array<{
        role: string;
        content: string;
        created_at: string;
    }>;
    facts?: Record<string, any>;
    sentiment_trend?: string;
    unresolved_issues?: string[];
}

export class VapiService {

    /**
     * Determine which VAPI phone number to use based on destination
     */
    private getPhoneNumberId(destinationPhone: string): string {
        // If phone starts with +1, use US number if available
        if (destinationPhone.startsWith('+1') && VAPI_PHONE_US) {
            return VAPI_PHONE_US;
        }
        // Default to MX number
        return VAPI_PHONE_MX || '';
    }

    /**
     * Initiate outbound call to customer with context injection
     */
    async createCall(params: {
        phoneNumber: string;
        customerName?: string;
        assistantId?: string;
        conversationId?: string;
        metadata?: Record<string, any>;
    }) {
        // Normalize phone (ensure it has + if missing, or handle Mexico specific)
        const normalizedPhone = normalizePhone(params.phoneNumber, 'vapi');

        // Determine which VAPI phone to use
        const phoneNumberId = this.getPhoneNumberId(normalizedPhone);
        if (!phoneNumberId) {
            throw new Error('VAPI_PHONE_NUMBER_ID not configured. Add it to GitHub Secrets and redeploy.');
        }

        console.log(`[VapiService] Initiating call to ${normalizedPhone} (Conv: ${params.conversationId}) using phone ${phoneNumberId.substring(0, 8)}...`);

        // Build context for the call
        let contextData: { contextMessage: string; firstMessage: string; client: any; conversation: any } = {
            contextMessage: '',
            firstMessage: '',
            client: null,
            conversation: null
        };

        try {
            if (params.conversationId) {
                contextData = await this.buildContextForConversation(params.conversationId);
            } else {
                contextData = await this.buildContextForPhone(params.phoneNumber);
            }
        } catch (error) {
            console.error('[VapiService] Error building context, proceeding without context:', error);
            // Fallback default message
            contextData.firstMessage = this.buildFirstMessage(params.customerName);
        }

        const assistantId = params.assistantId || process.env.VAPI_DEFAULT_ASSISTANT_ID;
        if (!assistantId) {
            throw new Error('VAPI_DEFAULT_ASSISTANT_ID not configured. Add it to GitHub Secrets and redeploy.');
        }

        // Build request with context injection via assistantOverrides
        const callRequest: any = {
            phoneNumberId,
            customer: {
                number: normalizedPhone,
                name: params.customerName || contextData.client?.name
            },
            assistantId,
            metadata: {
                conversationId: params.conversationId,
                clientId: contextData.client?.client_id,
                ...params.metadata
            }
        };

        // Inject context via assistantOverrides if we have context
        if (contextData.contextMessage) {
            callRequest.assistantOverrides = {
                firstMessage: contextData.firstMessage,
                model: {
                    messages: [
                        {
                            role: 'system',
                            content: contextData.contextMessage
                        }
                    ]
                }
            };
        }

        console.log(`[VapiService] Call request sent to VAPI`);

        const response = await vapiApi.post('/call', callRequest);

        // Track in DB
        const { error } = await supabase.from('voice_calls').insert({
            vapi_call_id: response.data.id,
            conversation_id: params.conversationId,
            direction: 'outbound',
            phone_number: params.phoneNumber,
            status: 'queued'
        });

        if (error) console.error('[VapiService] DB Insert Error:', error.message);

        return response.data;
    }

    /**
     * Handle incoming webhook events
     */
    async handleWebhook(payload: any) {
        const { message } = payload;
        if (!message) return { success: false };

        const type = message.type;
        const call = message.call;

        console.log(`[VapiService] Webhook received: ${type}`);

        try {
            switch (type) {
                case 'assistant-request':
                    return this.handleAssistantRequest(call);

                case 'tool-calls':
                    return this.handleToolCalls(message);

                case 'status-update':
                    await this.logStatusUpdate(call);
                    break;

                case 'end-of-call-report':
                    await this.handleEndOfCall(message);
                    break;

                case 'transcript':
                    await this.logTranscript(message);
                    break;

                case 'user-interrupted':
                    // Just log event
                    break;

                case 'hang':
                    // Just log event
                    break;
            }
        } catch (e: any) {
            console.error(`[VapiService] Error handling ${type}:`, e.message);
        }

        return { success: true };
    }

    /**
     * Dynamic assistant selection for inbound calls with context injection
     */
    private async handleAssistantRequest(call: any) {
        const phoneNumber = call.customer?.number;
        const phoneNumberId = call.phoneNumberId;

        console.log(`[VapiService] Assistant Request for ${phoneNumber}`);

        // Build context for the caller
        let contextData: any = {
            client: null,
            conversation: null,
            contextMessage: '',
            firstMessage: this.buildFirstMessage()
        };

        try {
            contextData = await this.buildContextForPhone(phoneNumber);
        } catch (error) {
            console.error('[VapiService] Error building context for inbound call:', error);
        }

        // If we found a client, try to get or create conversation for tracking
        let conversationId: string | undefined;
        if (contextData.client?.client_id) {
            // Check for existing conversation or create one
            const { data: existingConv } = await supabase
                .from('conversations')
                .select('id')
                .eq('client_id', contextData.client.client_id)
                .eq('is_archived', false)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            conversationId = existingConv?.id;

            // If no conversation, we could create one here for inbound calls
            if (!conversationId) {
                const { data: newConv } = await supabase
                    .from('conversations')
                    .insert({
                        client_id: contextData.client.client_id,
                        handle: phoneNumber,
                        channel: 'voice',
                        is_archived: false
                    })
                    .select('id')
                    .single();
                conversationId = newConv?.id;
            }
        }

        // [FIX] Ensure inbound call is logged in voice_calls immediately
        await supabase.from('voice_calls').insert({
            vapi_call_id: call.id,
            conversation_id: conversationId,
            direction: 'inbound',
            phone_number: phoneNumber,
            status: 'in-progress',
            started_at: new Date().toISOString()
        });

        const assistantId = process.env.VAPI_DEFAULT_ASSISTANT_ID;

        // Build response with context injection
        const response: any = {
            assistantId
        };

        // Inject context if available
        if (contextData.contextMessage) {
            response.assistantOverrides = {
                firstMessage: contextData.firstMessage,
                model: {
                    messages: [
                        {
                            role: 'system',
                            content: contextData.contextMessage
                        }
                    ]
                },
                metadata: {
                    conversationId,
                    clientId: contextData.client?.client_id,
                    context: 'inbound'
                }
            };
        }

        return response;
    }

    /**
     * Execute tool calls
     */
    private async handleToolCalls(message: any) {
        const results = [];
        const call = message.call;

        // Extract context from call metadata - prioritization: call.metadata -> call.customer
        // This is CRITICAL for existing tools to work
        let context = {
            conversationId: call?.metadata?.conversationId,
            clientId: call?.metadata?.clientId,
            customerPhone: call?.customer?.number,
            callId: call?.id
        };

        // SAFETY NET: If clientId is missing but we have phone, look it up now
        if (!context.clientId && context.customerPhone) {
            console.log(`[VapiService] Missing clientId in metadata. Attempting fallback lookup for ${context.customerPhone}`);
            try {
                const client = await this.lookupClient(this.normalizePhoneForLookup(context.customerPhone));
                if (client) {
                    console.log(`[VapiService] Fallback found client: ${client.client_id}`);
                    context.clientId = client.client_id;
                    // Also try to find active conversation
                    if (!context.conversationId && client.client_id) {
                        const conv = await this.getActiveConversation(client.client_id);
                        if (conv) context.conversationId = conv.conversation_id;
                    }
                }
            } catch (e) {
                console.error('[VapiService] Fallback lookup failed:', e);
            }
        }

        // VAPI sends tool calls in toolWithToolCallList
        const toolCalls = message.toolWithToolCallList || message.toolCallList || [];

        for (const toolCall of toolCalls) {
            const toolCallId = toolCall.id || toolCall.toolCall?.id;
            const functionName = toolCall.function?.name || toolCall.name;
            const functionArgs = toolCall.function?.arguments || toolCall.parameters || '{}';

            console.log(`[VapiService] Executing Tool: ${functionName}`);
            console.log(`[VapiService] Raw ToolCall Payload: ${JSON.stringify(toolCall)}`);

            const startTime = Date.now();
            let parsedArgs: Record<string, any> = {};

            try {
                parsedArgs = typeof functionArgs === 'string'
                    ? JSON.parse(functionArgs)
                    : functionArgs || {};

                // Execute via centralized handler
                const result = await handleToolCall(functionName, parsedArgs, context);
                const duration = Date.now() - startTime;

                console.log(`[VapiService] Tool success (${duration}ms)`);

                // Log to Supabase
                await this.logToolCallActivity({
                    vapi_call_id: call?.id,
                    conversation_id: context.conversationId,
                    client_id: context.clientId,
                    tool_name: functionName,
                    tool_call_id: toolCallId,
                    arguments: parsedArgs,
                    raw_payload: toolCall, // [NEW] Pass raw object
                    success: result.success !== false, // Default to true unless explicitly false
                    result: result,
                    duration_ms: duration,
                    customer_phone: context.customerPhone
                });

                // Result for Vapi must be string
                const resultString = JSON.stringify(result).replace(/\n/g, ' ').replace(/\r/g, '');

                results.push({
                    toolCallId: toolCallId,
                    result: resultString
                });
            } catch (e: any) {
                const duration = Date.now() - startTime;
                console.error(`[VapiService] Tool error for ${functionName}:`, e.message);

                await this.logToolCallActivity({
                    vapi_call_id: call?.id,
                    conversation_id: context.conversationId,
                    client_id: context.clientId,
                    tool_name: functionName,
                    tool_call_id: toolCallId,
                    arguments: parsedArgs,
                    raw_payload: toolCall, // [NEW] Pass raw object
                    success: false,
                    error_message: e.message,
                    duration_ms: duration,
                    customer_phone: context.customerPhone
                });

                results.push({
                    toolCallId: toolCallId,
                    error: e.message.replace(/\n/g, ' ')
                });
            }
        }

        return { results };
    }

    /**
     * Handle end of call
     */
    private async handleEndOfCall(message: any) {
        const call = message.call;
        const report = message;

        // Update voice_calls with final data
        try {
            await supabase
                .from('voice_calls')
                .update({
                    status: 'ended',
                    ended_at: new Date().toISOString(),
                    duration_seconds: report.durationSeconds || 0,
                    transcript: report.transcript,
                    summary: report.summary,
                    ended_reason: report.endedReason,
                    cost: report.cost,
                    messages_json: report.messages
                })
                .eq('vapi_call_id', call.id);
        } catch (e: any) {
            console.error('[VapiService] Error updating voice_calls:', e.message);
        }

        // Create simplified summary for CRM
        let summaryContent = `📞 **Llamada finalizada** (${Math.round(report.durationSeconds || 0)}s)\n\n**Resumen:** ${report.summary || 'N/A'}\n\n**Razón:** ${report.endedReason}`;
        summaryContent += `\n\n[🎧 Escuchar Grabación](${report.recordingUrl})`;

        // Get conversation ID to reuse if possible
        const conversationId = call.metadata?.conversationId;

        if (conversationId) {
            await supabase.from('crm_messages').insert({
                conversation_id: conversationId,
                direction: 'inbound',
                role: 'system',
                message_type: 'call_summary',
                content: summaryContent,
                status: 'delivered',
                raw_payload: report
            });
        }
    }

    // --- Logging Helpers ---

    private async logStatusUpdate(call: any) {
        if (!call?.id) return;
        await supabase.from('voice_calls').update({
            status: call.status,
            started_at: call.startedAt,
            ended_at: call.endedAt
        }).eq('vapi_call_id', call.id);
    }

    private async logTranscript(message: any) {
        const call = message.call;
        if (!call?.id || message.type !== 'transcript') return;

        // Only log final transcripts to avoid spamming DB? 
        // Or simplified logging.
        // For now, let's skip high-frequency transcript logging to DB unless critical
        // But the user liked "Transcript" in the original code, so maybe keep minimal logging?
        // Original code logged to `vapi_call_events`. 
        // Let's implement minimal event logging if needed, or skip for simplicity as requested.
        // User asked to simplify. Real-time transcript logging is complex. 
        // Detailed transcript is saved at end of call in `voice_calls`.
        // So we will SKIP real-time transcript logging to DB to save simplified lines.
    }

    private async logToolCallActivity(log: any) {
        try {
            await supabase
                .from('vapi_tool_logs')
                .insert({
                    vapi_call_id: log.vapi_call_id,
                    conversation_id: log.conversation_id,
                    client_id: log.client_id,
                    tool_name: log.tool_name,
                    tool_call_id: log.tool_call_id,
                    arguments: log.arguments,
                    arguments_raw: JSON.stringify(log.raw_payload || {}), // [NEW] Capture raw payload
                    success: log.success,
                    result: log.result,
                    error_message: log.error_message,
                    duration_ms: log.duration_ms,
                    customer_phone: log.customer_phone,
                    started_at: new Date().toISOString() // approximated
                });
        } catch (e) {
            console.error('[VapiService] Error logging tool:', e);
        }
    }


    // --- Context Methods (Migrated from VapiContextService) ---

    async buildContextForPhone(phoneNumber: string): Promise<{
        client: ClientContext | null;
        conversation: ConversationContext | null;
        contextMessage: string;
        firstMessage: string;
    }> {
        const normalizedPhone = this.normalizePhoneForLookup(phoneNumber);
        const client = await this.lookupClient(normalizedPhone);
        const conversation = client ? await this.getActiveConversation(client.client_id!) : null;
        const contextMessage = this.buildContextMessage(client, conversation);
        const firstMessage = this.buildFirstMessage(client?.name);

        return { client, conversation, contextMessage, firstMessage };
    }

    async buildContextForConversation(conversationId: string): Promise<{
        client: ClientContext | null;
        conversation: ConversationContext | null;
        contextMessage: string;
        firstMessage: string;
    }> {
        const { data: conv } = await supabase
            .from('conversations')
            .select(`
                *,
                clients!conversations_client_id_fkey (
                    id, name, email, phone
                )
            `)
            .eq('id', conversationId)
            .single();

        if (!conv) {
            return {
                client: null,
                conversation: null,
                contextMessage: '',
                firstMessage: this.buildFirstMessage()
            };
        }

        const client = conv.clients ? await this.enrichClientData(conv.clients) : null;
        const conversation = await this.buildConversationContext(conv);
        const contextMessage = this.buildContextMessage(client, conversation);
        const firstMessage = this.buildFirstMessage(client?.name);

        return { client, conversation, contextMessage, firstMessage };
    }

    private async lookupClient(phone: string): Promise<ClientContext | null> {
        // robust lookup: try exact match, then last 10 digits
        const cleanPhone = phone.replace(/\D/g, '');
        const last10 = cleanPhone.slice(-10);

        // Try exact match first
        const { data: exactClient } = await supabase
            .from('clients')
            .select('*')
            .eq('phone', phone)
            .maybeSingle();

        if (exactClient) return this.enrichClientData(exactClient);

        // Try last 10 match
        if (last10.length >= 7) {
            const { data: fuzzyClient } = await supabase
                .from('clients')
                .select('*')
                .ilike('phone', `%${last10}`)
                .limit(1)
                .maybeSingle();

            if (fuzzyClient) return this.enrichClientData(fuzzyClient);
        }

        return null;
    }

    private async enrichClientData(client: any): Promise<ClientContext> {
        const clientId = client.id;
        // Execute parallel queries to avoid .or() syntax fragility
        const orderQueries = [];

        // Query 1: By Email
        if (client.email) {
            orderQueries.push(
                supabase
                    .from('orders')
                    .select('id, order_number, financial_status, fulfillment_status, created_at, customer_phone, customer_email')
                    .eq('customer_email', client.email)
                    .order('created_at', { ascending: false })
                    .limit(10)
            );
        }

        // Query 2: By Phone (Last 10 digits)
        const last10 = client.phone?.replace(/\D/g, '').slice(-10);
        if (last10 && last10.length >= 7) {
            orderQueries.push(
                supabase
                    .from('orders')
                    .select('id, order_number, financial_status, fulfillment_status, created_at, customer_phone, customer_email')
                    .ilike('customer_phone', `%${last10}%`)
                    .order('created_at', { ascending: false })
                    .limit(10)
            );
        }

        const results = await Promise.all(orderQueries);

        // Merge and Deduplicate
        const allOrders = results.flatMap(r => r.data || []);
        const uniqueOrdersMap = new Map();
        allOrders.forEach(o => uniqueOrdersMap.set(o.id, o));

        const orders = Array.from(uniqueOrdersMap.values())
            .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) // sort descending
            .slice(0, 10);



        const totalOrders = orders?.length || 0;
        // @ts-ignore
        const ltv = orders?.reduce((sum, o) => sum + (parseFloat(o.total_price) || 0), 0) || 0;
        const lastOrder = orders?.[0];
        const pendingOrders = orders?.filter(o =>
            ['paid', 'partially_paid'].includes(o.financial_status) &&
            ['unfulfilled', 'partial'].includes(o.fulfillment_status)
        );

        const { data: convData } = await supabase
            .from('conversations')
            .select('facts, tags')
            .eq('client_id', clientId)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        return {
            client_id: clientId,
            name: client.name,
            email: client.email,
            phone: client.phone,
            first_order_date: orders?.[orders.length - 1]?.created_at,
            total_orders: totalOrders,
            ltv: Math.round(ltv),
            last_order: lastOrder ? {
                order_number: lastOrder.order_number, // @ts-ignore
                status: `${lastOrder.financial_status}/${lastOrder.fulfillment_status}`,
                created_at: lastOrder.created_at,
                total: parseFloat(lastOrder.total_price)
            } : undefined,
            pending_orders: pendingOrders?.map(o => ({
                order_number: o.order_number,
                status: `${o.financial_status}/${o.fulfillment_status}`,
                created_at: o.created_at,
                total: parseFloat(o.total_price)
            })),
            tags: convData?.tags || [],
            emotional_vibe: convData?.facts?.emotional_vibe
        };
    }

    private async getActiveConversation(clientId: string): Promise<ConversationContext | null> {
        const { data: conv } = await supabase
            .from('conversations')
            .select('*')
            .eq('client_id', clientId)
            .eq('is_archived', false)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!conv) return null;
        return this.buildConversationContext(conv);
    }

    private async buildConversationContext(conv: any): Promise<ConversationContext> {
        const { data: messages } = await supabase
            .from('crm_messages')
            .select('role, content, created_at')
            .eq('conversation_id', conv.id)
            .eq('is_internal', false)
            .order('created_at', { ascending: false })
            .limit(5);

        return {
            conversation_id: conv.id,
            channel: conv.channel || 'unknown',
            recent_messages: messages?.reverse().map(m => ({
                role: m.role,
                content: m.content?.substring(0, 200) || '',
                created_at: m.created_at
            })),
            facts: conv.facts,
            sentiment_trend: conv.facts?.sentiment_trend,
            unresolved_issues: conv.facts?.unresolved_issues
        };
    }

    private buildContextMessage(client: ClientContext | null, conversation: ConversationContext | null): string {
        if (!client && !conversation) {
            return '[CONTEXTO: Cliente nuevo o no identificado. Pide su nombre amablemente.]';
        }

        const lines: string[] = [
            '[INSTRUCCIONES DEL SISTEMA]',
            '- Eres Ara, el asistente de Extractos EUM. Tu objetivo es vender y dar soporte.',
            '- USA TUS HERRAMIENTAS. No inventes información de productos ni pedidos.',
            '- Si te preguntan por productos, usa "search_products".',
            '- Si te preguntan por un pedido, usa "lookup_order".',
            '- Si necesitan un COA, pregunta el lote o producto y usa "get_coa".',
            '- Sé breve, amable y profesional.',
            '',
            '[CONTEXTO DEL CLIENTE - Usa esta información para personalizar]'
        ];

        if (client) {
            if (client.name) lines.push(`- Nombre: ${client.name}`);
            if (client.total_orders && client.ltv) {
                lines.push(`- Cliente con ${client.total_orders} pedidos | LTV: $${client.ltv} MXN`);
            }
            if (client.last_order) {
                lines.push(`- Último pedido: #${client.last_order.order_number} (${client.last_order.status})`);
            }
            if (client.pending_orders && client.pending_orders.length > 0) {
                const pending = client.pending_orders.map(o => `#${o.order_number}`).join(', ');
                lines.push(`- Pedidos pendientes: ${pending}`);
            }
        }

        if (conversation?.recent_messages && conversation.recent_messages.length > 0) {
            lines.push('\n[MENSAJES RECIENTES POR WHATSAPP]');
            for (const msg of conversation.recent_messages.slice(-3)) {
                const role = msg.role === 'assistant' ? 'Ara' : 'Cliente';
                lines.push(`${role}: ${msg.content}`);
            }
        }

        return lines.join('\n');
    }

    private buildFirstMessage(clientName?: string): string {
        if (clientName) {
            const firstName = clientName.split(' ')[0];
            return `¡Hola ${firstName}! Soy Ara de Extractos EUM. ¿Cómo estás?`;
        }
        return '¡Hola! Soy Ara de Extractos EUM. ¿Con quién tengo el gusto?';
    }

    private normalizePhoneForLookup(phone: string): string {
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.length > 10) {
            cleaned = cleaned.slice(-10);
        }
        return cleaned;
    }
}
