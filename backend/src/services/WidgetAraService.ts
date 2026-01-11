/**
 * WidgetAraService - AI Chat Service for Ara Widget
 *
 * Provides text-based AI chat using Claude with the same tools
 * available to the voice assistant:
 * - search_products: Search product catalog
 * - lookup_order: Check order status
 * - get_coa: Retrieve Certificate of Analysis
 * - send_whatsapp: Send info to customer's WhatsApp
 * - escalate_to_human: Request human agent
 *
 * Messages are stored in crm_messages for CRM integration.
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/supabase';
import { ToolRegistry } from './ToolRegistry';
import { ToolDispatcher } from './ToolDispatcher';
import {
    AgentToolService,
    AuditCollector,
    AuditStep
} from './AgentToolService';
import * as path from 'path';
import * as fs from 'fs';
import { IntelligenceService } from './intelligenceService';

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// Tool names for widget Ara
const WIDGET_TOOL_NAMES = [
    'search_products',
    'lookup_order',
    'get_coa',
    'send_whatsapp',
    'escalate_to_human',
    'audit_decision',
    'create_checkout_link'
];

// System prompt for widget Ara
const WIDGET_SYSTEM_PROMPT = `Eres Ara, la asistente virtual de Extractos EUM, una tienda de productos de CBD y cannabinoides en México.

PERSONALIDAD:
- Amigable, profesional y empática
- Usa español mexicano casual pero respetuoso
- Respuestas concisas para formato de chat (máximo 2-3 oraciones por mensaje)
- Usa emojis con moderación para mantener un tono cálido

CAPACIDADES:
- Buscar productos en el catálogo
- Consultar estado de pedidos
- Proporcionar Certificados de Análisis (COA)
- Enviar información al WhatsApp del cliente
- Crear enlaces de checkout para agregar productos al carrito
- Escalar a un agente humano si es necesario

REGLAS:
1. SIEMPRE usa las herramientas disponibles para buscar información actualizada
2. NO inventes información sobre productos, precios o pedidos
3. Si no encuentras un producto, sugiere alternativas o pide más detalles
4. Para temas médicos, recomienda consultar con un profesional de salud
5. Si el cliente está frustrado o tienes dudas, ofrece escalación a un agente

FORMATO DE RESPUESTA:
- Mantén respuestas cortas y directas
- Usa listas cuando enumeres productos o pasos
- Incluye links o información de contacto cuando sea relevante

Recuerda: Eres la primera línea de soporte. Tu objetivo es ayudar rápidamente o conectar con alguien que pueda hacerlo.`;

interface WidgetChatContext {
    clientId: string;
    conversationId: string;
    sessionId: string;
    correlationId?: string;
    customerPhone?: string;
    customerEmail?: string;
    customerName?: string;
    agentId?: string;
    auditCollector?: AuditCollector;
}

interface ChatMessage {
    id: string;
    content: string;
    role: 'user' | 'assistant';
    createdAt: string;
}

interface ChatResult {
    userMessage: ChatMessage;
    araResponse: ChatMessage;
}

export class WidgetAraService {
    /**
     * Enrich context with client data if missing phone/email
     * This ensures tools like send_whatsapp have contact info even if not passed from controller
     */
    private async enrichContext(context: WidgetChatContext): Promise<WidgetChatContext> {
        // If we already have both phone and email, no need to enrich
        if (context.customerPhone && context.customerEmail) {
            return context;
        }

        // Try to fetch from clients table using clientId
        if (context.clientId) {
            try {
                const { data: client, error } = await supabase
                    .from('clients')
                    .select('phone, email')
                    .eq('id', context.clientId)
                    .single();

                if (!error && client) {
                    return {
                        ...context,
                        customerPhone: context.customerPhone || client.phone || undefined,
                        customerEmail: context.customerEmail || client.email || undefined
                    };
                }
            } catch (e) {
                console.warn('[WidgetAraService] Error enriching context:', e);
            }
        }

        return context;
    }

    /**
     * Process a chat message and generate AI response
     */
    async chat(message: string, context: WidgetChatContext): Promise<ChatResult> {
        const startTime = Date.now();

        // Enrich context with client data before processing
        context = await this.enrichContext(context);

        // 1. Store user message
        const { data: userMsg, error: userMsgError } = await supabase
            .from('crm_messages')
            .insert({
                conversation_id: context.conversationId,
                direction: 'inbound',
                role: 'user',
                message_type: 'text',
                content: message,
                status: 'delivered',
                channel: 'WIDGET',
                raw_payload: {
                    source: 'widget_chat',
                    session_id: context.sessionId,
                    client_id: context.clientId
                }
            })
            .select('id, created_at')
            .single();

        if (userMsgError) {
            console.error('[WidgetAra] Error storing user message:', userMsgError);
        }

        // 2. Get conversation history (last 10 messages for context)
        const { data: history } = await supabase
            .from('crm_messages')
            .select('content, direction, role')
            .eq('conversation_id', context.conversationId)
            .order('created_at', { ascending: false })
            .limit(10);

        // Build message history for Claude
        const messages: Anthropic.MessageParam[] = [];

        // Add history (oldest first)
        if (history && history.length > 0) {
            const reversedHistory = [...history].reverse();
            for (const msg of reversedHistory.slice(0, -1)) { // Exclude the message we just inserted
                messages.push({
                    role: msg.direction === 'inbound' ? 'user' : 'assistant',
                    content: msg.content
                });
            }
        }

        // Add current message
        messages.push({ role: 'user', content: message });

        const auditCollector = new AuditCollector();

        // 3. Build context-aware system prompt
        let systemPrompt = WIDGET_SYSTEM_PROMPT;

        // Add confidence instructions
        systemPrompt += `\n\n${IntelligenceService.getInstance().generateConfidenceInstructions()}`;

        // LOAD AGENT KNOWLEDGE
        const agentId = context.agentId || 'sales_ara';
        const agentKnowledge = await this.loadAgentKnowledge(agentId, message, auditCollector);

        if (agentKnowledge) {
            // Append agent knowledge (we don't replace the whole thing to keep widget rules and confidence)
            systemPrompt += `\n\n### CONOCIMIENTO ESPECÍFICO DEL AGENTE:\n${agentKnowledge}`;
        }

        // Add customer context if available
        if (context.customerName || context.customerPhone || context.customerEmail) {
            systemPrompt += `\n\nCONTEXTO DEL CLIENTE AUTENTICADO:`;
            if (context.customerName) systemPrompt += `\n- Nombre: ${context.customerName}`;
            if (context.customerPhone) systemPrompt += `\n- Teléfono: ${context.customerPhone}`;
            if (context.customerEmail) systemPrompt += `\n- Email: ${context.customerEmail}`;
            systemPrompt += `\n\nIMPORTANTE: Este cliente está autenticado. Cuando pregunte por "mi pedido" o "mis pedidos", usa la herramienta lookup_order SIN parámetros - automáticamente buscará sus pedidos usando su cuenta. NO necesitas pedirle número de orden ni teléfono.`;
        }

        // 4. Call Claude with tools
        let response: Anthropic.Message;
        let toolResults: { toolUseId: string; result: any }[] = [];
        let iterations = 0;
        const maxIterations = 5;

        try {
            // Initial API call
            response = await anthropic.messages.create({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 1024,
                system: systemPrompt,
                tools: ToolRegistry.getInstance().getAnthropicTools(WIDGET_TOOL_NAMES),
                messages
            });

            // Handle tool use loop
            while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
                iterations++;

                const toolUseBlocks = response.content.filter(
                    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
                );

                const toolResultsForApi: Anthropic.ToolResultBlockParam[] = [];

                for (const toolUse of toolUseBlocks) {
                    console.log(`[WidgetAra] Executing tool: ${toolUse.name}`, toolUse.input);

                    const toolResult = await this.executeTool(
                        toolUse.name,
                        toolUse.input as Record<string, any>,
                        { ...context, auditCollector }
                    );

                    toolResultsForApi.push({
                        type: 'tool_result',
                        tool_use_id: toolUse.id,
                        content: JSON.stringify(toolResult)
                    });

                    toolResults.push({ toolUseId: toolUse.id, result: toolResult });
                }

                // Continue conversation with tool results
                const updatedMessages: Anthropic.MessageParam[] = [
                    ...messages,
                    { role: 'assistant', content: response.content },
                    { role: 'user', content: toolResultsForApi }
                ];

                response = await anthropic.messages.create({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 1024,
                    system: systemPrompt,
                    tools: ToolRegistry.getInstance().getAnthropicTools(WIDGET_TOOL_NAMES),
                    messages: updatedMessages
                });
            }

        } catch (error: any) {
            console.error('[WidgetAra] Claude API error:', error);

            // Return fallback response
            const fallbackContent = 'Lo siento, estoy teniendo problemas técnicos. Por favor intenta de nuevo o escribe a soporte@extractoseum.com';

            const { data: araMsg } = await supabase
                .from('crm_messages')
                .insert({
                    conversation_id: context.conversationId,
                    direction: 'outbound',
                    role: 'assistant',
                    message_type: 'text',
                    content: fallbackContent,
                    status: 'sent',
                    channel: 'WIDGET',
                    raw_payload: { source: 'widget_chat', error: error.message }
                })
                .select('id, created_at')
                .single();

            return {
                userMessage: {
                    id: userMsg?.id || 'temp-user',
                    content: message,
                    role: 'user',
                    createdAt: userMsg?.created_at || new Date().toISOString()
                },
                araResponse: {
                    id: araMsg?.id || 'temp-ara',
                    content: fallbackContent,
                    role: 'assistant',
                    createdAt: araMsg?.created_at || new Date().toISOString()
                }
            };
        }

        // 5. Extract text response
        const textBlocks = response.content.filter(
            (block): block is Anthropic.TextBlock => block.type === 'text'
        );

        const rawAraContent = textBlocks.map((b: any) => b.text).join('\n').trim() ||
            'Gracias por tu mensaje. ¿Hay algo más en lo que pueda ayudarte?';

        // Extract confidence from content if present: [[CONFIDENCE:HIGH]]
        let confidence: 'high' | 'medium' | 'low' | undefined;
        let araContent = rawAraContent;

        const confidenceMatch = rawAraContent.match(/\[\[CONFIDENCE:(HIGH|MEDIUM|LOW)\]\]/i);
        if (confidenceMatch) {
            confidence = confidenceMatch[1].toLowerCase() as any;
            // Clean up content for display (remove tag)
            araContent = rawAraContent.replace(/\[\[CONFIDENCE:(HIGH|MEDIUM|LOW)\]\]/i, '').trim();
        }

        // 6. Sync with Local Analytics (Phase 5/7)
        try {
            const { AIConversationService } = require('./aiConversationService');
            const convService = AIConversationService.getInstance();
            // Try to get or create local conversation to match Supabase
            let localConv = convService.getConversation(context.conversationId);
            if (!localConv) {
                // Initial sync mirror
                localConv = convService.createConversation('widget_client', 'claude-sonnet-4-20250514');
                // Force ID match for consistency if possible, or just let them diverge but linked
            }
            // Add messages to local storage for Dashboard
            convService.addMessage(context.conversationId, 'user', message);
            convService.addMessage(context.conversationId, 'assistant', araContent, confidence);
            // Record agent and snaps
            const relevantSnaps = IntelligenceService.getInstance().findRelevantSnaps(
                path.join(__dirname, '../../data/ai_knowledge_base', 'agents_public', agentId),
                message
            );
            convService.updateAgentContext(context.conversationId, agentId, relevantSnaps.map(s => s.fileName));
        } catch (analyticsErr: any) {
            console.warn(`[WidgetAra] Failed to sync with local analytics:`, analyticsErr.message);
        }

        // 7. Store Ara response in Supabase
        const { data: araMsg, error: araMsgError } = await supabase
            .from('crm_messages')
            .insert({
                conversation_id: context.conversationId,
                direction: 'outbound',
                role: 'assistant',
                message_type: 'text',
                content: araContent,
                status: 'sent',
                channel: 'WIDGET',
                raw_payload: {
                    source: 'widget_chat',
                    model: 'claude-sonnet-4-20250514',
                    confidence,
                    tools_used: toolResults.map(t => t.toolUseId),
                    duration_ms: Date.now() - startTime,
                    iterations,
                    audit_trail: auditCollector.getTrail()
                }
            })
            .select('id, created_at')
            .single();

        if (araMsgError) {
            console.error('[WidgetAra] Error storing Ara response:', araMsgError);
        }

        // 7. Update conversation last_message_at
        await supabase
            .from('conversations')
            .update({
                last_message_at: new Date().toISOString(),
                last_outbound_at: new Date().toISOString()
            })
            .eq('id', context.conversationId);

        console.log(`[WidgetAra] Chat completed in ${Date.now() - startTime}ms, ${iterations} tool iterations`);

        return {
            userMessage: {
                id: userMsg?.id || 'temp-user',
                content: message,
                role: 'user',
                createdAt: userMsg?.created_at || new Date().toISOString()
            },
            araResponse: {
                id: araMsg?.id || 'temp-ara',
                content: araContent,
                role: 'assistant',
                createdAt: araMsg?.created_at || new Date().toISOString()
            }
        };
    }

    /**
     * Execute a tool call
     */
    private async executeTool(
        toolName: string,
        args: Record<string, any>,
        context: WidgetChatContext
    ): Promise<any> {
        const toolContext = {
            conversationId: context.conversationId,
            correlationId: context.correlationId,
            clientId: context.clientId,
            customerPhone: context.customerPhone,
            customerEmail: context.customerEmail,
            agentId: context.agentId,
            channel: 'WIDGET' as const,  // Add channel context for smart routing
            auditCollector: (context as any).auditCollector
        };

        return ToolDispatcher.execute(toolName, args, toolContext);
    }
    /**
     * Loads agent identity and relevant knowledge snaps
     */
    private async loadAgentKnowledge(agentId: string, userMessage: string, collector?: AuditCollector): Promise<string> {
        const KNOWLEDGE_BASE_DIR = path.join(__dirname, '../../data/ai_knowledge_base');
        const categories = ['agents_god_mode', 'agents_public', 'agents_internal'];

        // Find agent folder
        let agentFolderPath = '';
        for (const cat of categories) {
            const checkPath = path.join(KNOWLEDGE_BASE_DIR, cat, agentId);
            if (fs.existsSync(checkPath) && fs.lstatSync(checkPath).isDirectory()) {
                agentFolderPath = checkPath;
                break;
            }
        }

        if (!agentFolderPath) {
            console.warn(`[WidgetAra] Agent folder not found: ${agentId}`);
            return '';
        }

        // Load identity/instructivo
        let knowledge = '';
        const identityPath = path.join(agentFolderPath, 'identity.md');
        if (fs.existsSync(identityPath)) {
            knowledge = fs.readFileSync(identityPath, 'utf-8') + '\n\n';
        }

        const instructivoPath = path.join(agentFolderPath, 'instructivo.md');
        if (fs.existsSync(instructivoPath)) {
            knowledge += fs.readFileSync(instructivoPath, 'utf-8') + '\n\n';
        }

        // Use IntelligenceService for knowledge snaps (like AIService does)
        try {
            const intelligenceService = IntelligenceService.getInstance();
            const relevantSnaps = intelligenceService.findRelevantSnaps(agentFolderPath, userMessage);

            // Inject relevant knowledge content
            for (const snap of relevantSnaps) {
                try {
                    // Snap content is in the file, not the object. We assume file is in agent root.
                    const snapPath = path.join(agentFolderPath, snap.fileName);
                    if (fs.existsSync(snapPath)) {
                        const content = fs.readFileSync(snapPath, 'utf-8');
                        knowledge += `\n\n--- ${snap.fileName} ---\n${content}`;

                        if (collector) {
                            collector.addStep({
                                type: 'knowledge_load',
                                name: snap.fileName,
                                input: { userMessage },
                                output: {
                                    preview: content.substring(0, 100) + '...',
                                    relevance: snap.score
                                },
                                reason: `Found relevant knowledge snap: ${snap.fileName}`
                            });
                        }
                    }
                } catch (readErr) {
                    console.error(`[WidgetAra] Error reading snap content ${snap.fileName}:`, readErr);
                }
            }
        } catch (e) {
            console.error(`[WidgetAra] Error loading knowledge snaps:`, e);
        }

        // Append Widget Logic Rules (Platform specific)
        knowledge += `\n\n
PLATAFORMA: WIDGET DE CHAT (WEB)
Estas operando en el widget de chat de la pagina web.
1. Tus respuestas deben ser breves y concisas.
2. Si el cliente pregunta por "mi pedido" y está autenticado, usa lookup_order sin parametros.
3. Puedes usar emojis pero mantén profesionalismo.
`;

        return knowledge;
    }
}
