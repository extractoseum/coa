import { supabase } from '../config/supabase';

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

/**
 * VapiContextService - Builds and injects context for VAPI voice calls
 *
 * This service constructs rich client context that gets injected into VAPI calls
 * via assistantOverrides. The main Ara prompt stays in VAPI Dashboard, we only
 * add contextual information about the specific client.
 */
export class VapiContextService {

    /**
     * Build complete context for a client based on phone number
     */
    async buildContextForPhone(phoneNumber: string): Promise<{
        client: ClientContext | null;
        conversation: ConversationContext | null;
        contextMessage: string;
        firstMessage: string;
    }> {
        // Normalize phone for lookup
        const normalizedPhone = this.normalizePhoneForLookup(phoneNumber);

        // Try to find client
        const client = await this.lookupClient(normalizedPhone);

        // Try to find or reference existing conversation
        const conversation = client ? await this.getActiveConversation(client.client_id!) : null;

        // Build context message for injection
        const contextMessage = this.buildContextMessage(client, conversation);

        // Build personalized first message
        const firstMessage = this.buildFirstMessage(client?.name);

        return {
            client,
            conversation,
            contextMessage,
            firstMessage
        };
    }

    /**
     * Build context for an existing conversation (outbound calls)
     */
    async buildContextForConversation(conversationId: string): Promise<{
        client: ClientContext | null;
        conversation: ConversationContext | null;
        contextMessage: string;
        firstMessage: string;
    }> {
        // Get conversation with client info
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

        return {
            client,
            conversation,
            contextMessage,
            firstMessage
        };
    }

    /**
     * Lookup client by phone number
     */
    private async lookupClient(phone: string): Promise<ClientContext | null> {
        // Try exact match first, then fuzzy
        const { data: client } = await supabase
            .from('clients')
            .select('*')
            .or(`phone.ilike.%${phone}%,phone.ilike.%${phone.slice(-10)}%`)
            .limit(1)
            .maybeSingle();

        if (!client) return null;

        return this.enrichClientData(client);
    }

    /**
     * Enrich basic client data with orders, LTV, etc.
     */
    private async enrichClientData(client: any): Promise<ClientContext> {
        const clientId = client.id;

        // Get order stats
        const { data: orders } = await supabase
            .from('orders')
            .select('id, order_number, status, created_at, total')
            .eq('client_id', clientId)
            .order('created_at', { ascending: false })
            .limit(10);

        const totalOrders = orders?.length || 0;
        const ltv = orders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
        const lastOrder = orders?.[0];
        const pendingOrders = orders?.filter(o =>
            ['pending', 'processing', 'shipped', 'in_transit'].includes(o.status)
        );

        // Get conversation facts/indicators if available
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
                order_number: lastOrder.order_number,
                status: lastOrder.status,
                created_at: lastOrder.created_at,
                total: lastOrder.total
            } : undefined,
            pending_orders: pendingOrders?.map(o => ({
                order_number: o.order_number,
                status: o.status
            })),
            tags: convData?.tags || [],
            emotional_vibe: convData?.facts?.emotional_vibe
        };
    }

    /**
     * Get active conversation for client
     */
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

    /**
     * Build conversation context from DB record
     */
    private async buildConversationContext(conv: any): Promise<ConversationContext> {
        // Get recent messages for context
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
                content: m.content?.substring(0, 200) || '', // Truncate for context
                created_at: m.created_at
            })),
            facts: conv.facts,
            sentiment_trend: conv.facts?.sentiment_trend,
            unresolved_issues: conv.facts?.unresolved_issues
        };
    }

    /**
     * Build the context message that gets injected into VAPI
     * This is added as additional context, NOT replacing the main prompt
     */
    buildContextMessage(client: ClientContext | null, conversation: ConversationContext | null): string {
        if (!client && !conversation) {
            return '[CONTEXTO: Cliente nuevo o no identificado. Pide su nombre amablemente.]';
        }

        const lines: string[] = [
            '[CONTEXTO DEL CLIENTE - Usa esta información para personalizar, no la menciones directamente]'
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
            if (client.emotional_vibe) {
                lines.push(`- Estado emocional reciente: ${client.emotional_vibe}`);
            }
            if (client.tags && client.tags.length > 0) {
                lines.push(`- Tags: ${client.tags.join(', ')}`);
            }
        }

        if (conversation?.recent_messages && conversation.recent_messages.length > 0) {
            lines.push('\n[MENSAJES RECIENTES POR WHATSAPP]');
            for (const msg of conversation.recent_messages.slice(-3)) {
                const role = msg.role === 'assistant' ? 'Ara' : 'Cliente';
                lines.push(`${role}: ${msg.content}`);
            }
        }

        if (conversation?.unresolved_issues && conversation.unresolved_issues.length > 0) {
            lines.push(`\n[TEMAS PENDIENTES: ${conversation.unresolved_issues.join(', ')}]`);
        }

        return lines.join('\n');
    }

    /**
     * Build personalized first message for the call
     */
    buildFirstMessage(clientName?: string): string {
        if (clientName) {
            const firstName = clientName.split(' ')[0];
            return `¡Hola ${firstName}! Soy Ara de Extractos EUM. ¿Cómo estás? ¿En qué te puedo ayudar hoy?`;
        }
        return '¡Hola! Soy Ara de Extractos EUM. ¿Con quién tengo el gusto?';
    }

    /**
     * Normalize phone number for database lookup
     */
    private normalizePhoneForLookup(phone: string): string {
        // Remove all non-digits
        let cleaned = phone.replace(/\D/g, '');

        // If it starts with country code, keep last 10 digits
        if (cleaned.length > 10) {
            cleaned = cleaned.slice(-10);
        }

        return cleaned;
    }
}

export const vapiContextService = new VapiContextService();
