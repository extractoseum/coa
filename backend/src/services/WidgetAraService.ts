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
import {
    handleSearchProducts,
    handleLookupOrder,
    handleGetCOA,
    handleSendWhatsApp,
    handleEscalateToHuman
} from './VapiToolHandlers';

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// Tool definitions for Claude
const WIDGET_TOOLS: Anthropic.Tool[] = [
    {
        name: 'search_products',
        description: 'Busca productos en el catálogo de Extractos EUM. Usa para encontrar gomitas, tinturas, tópicos, etc.',
        input_schema: {
            type: 'object' as const,
            properties: {
                query: {
                    type: 'string',
                    description: 'Término de búsqueda (ej: "gomitas", "aceite cbd", "crema")'
                },
                category: {
                    type: 'string',
                    description: 'Categoría opcional (comestibles, tinturas, topicos)'
                }
            },
            required: ['query']
        }
    },
    {
        name: 'lookup_order',
        description: 'Busca pedidos del cliente. Si el cliente está autenticado, puedes llamar esta herramienta SIN parámetros y automáticamente buscará todos sus pedidos. También puedes buscar por número de orden específico.',
        input_schema: {
            type: 'object' as const,
            properties: {
                order_number: {
                    type: 'string',
                    description: 'Número de orden específico (ej: "EUM_1234_SHOP"). Opcional si el cliente está autenticado.'
                }
            },
            required: []
        }
    },
    {
        name: 'get_coa',
        description: 'Obtiene el Certificado de Análisis (COA) de un producto por número de lote o nombre.',
        input_schema: {
            type: 'object' as const,
            properties: {
                batch_number: {
                    type: 'string',
                    description: 'Número de lote del producto'
                },
                product_name: {
                    type: 'string',
                    description: 'Nombre del producto para buscar su COA'
                }
            },
            required: []
        }
    },
    {
        name: 'send_whatsapp',
        description: 'Envía información al WhatsApp del cliente (links, COAs, detalles de productos).',
        input_schema: {
            type: 'object' as const,
            properties: {
                message: {
                    type: 'string',
                    description: 'Mensaje a enviar al cliente'
                },
                media_url: {
                    type: 'string',
                    description: 'URL de imagen o documento para adjuntar (opcional)'
                }
            },
            required: ['message']
        }
    },
    {
        name: 'escalate_to_human',
        description: 'Solicita que un agente humano contacte al cliente. Usa cuando no puedas resolver el problema.',
        input_schema: {
            type: 'object' as const,
            properties: {
                reason: {
                    type: 'string',
                    description: 'Razón de la escalación'
                },
                urgency: {
                    type: 'string',
                    enum: ['low', 'medium', 'high'],
                    description: 'Urgencia de la escalación'
                }
            },
            required: ['reason']
        }
    }
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
    customerPhone?: string;
    customerEmail?: string;
    customerName?: string;
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
     * Process a chat message and generate AI response
     */
    async chat(message: string, context: WidgetChatContext): Promise<ChatResult> {
        const startTime = Date.now();

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

        // 3. Build context-aware system prompt
        let systemPrompt = WIDGET_SYSTEM_PROMPT;

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
                tools: WIDGET_TOOLS,
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
                        context
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
                    tools: WIDGET_TOOLS,
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

        const araContent = textBlocks.map(b => b.text).join('\n').trim() ||
            'Gracias por tu mensaje. ¿Hay algo más en lo que pueda ayudarte?';

        // 6. Store Ara response
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
                    tools_used: toolResults.map(t => t.toolUseId),
                    duration_ms: Date.now() - startTime,
                    iterations
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
            clientId: context.clientId,
            customerPhone: context.customerPhone,
            customerEmail: context.customerEmail
        };

        try {
            switch (toolName) {
                case 'search_products':
                    return await handleSearchProducts(args as { query: string; category?: string }, toolContext);

                case 'lookup_order':
                    // If no order_number provided but we have customer phone, use it
                    const orderArgs = {
                        order_number: args.order_number,
                        phone: args.phone || context.customerPhone
                    };
                    return await handleLookupOrder(orderArgs, toolContext);

                case 'get_coa':
                    return await handleGetCOA(args as { batch_number?: string; product_name?: string }, toolContext);

                case 'send_whatsapp':
                    return await handleSendWhatsApp(args as { message: string; media_url?: string }, toolContext);

                case 'escalate_to_human':
                    return await handleEscalateToHuman(args as { reason: string; urgency?: string }, toolContext);

                default:
                    console.warn(`[WidgetAra] Unknown tool: ${toolName}`);
                    return { success: false, error: `Unknown tool: ${toolName}` };
            }
        } catch (error: any) {
            console.error(`[WidgetAra] Tool execution error (${toolName}):`, error);
            return { success: false, error: error.message };
        }
    }
}
