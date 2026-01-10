/**
 * VoiceCallService - Direct Twilio + ElevenLabs + Claude Integration
 *
 * Replaces VAPI with a fully controlled voice pipeline:
 * 1. Twilio handles telephony (inbound/outbound calls)
 * 2. Deepgram/Whisper handles speech-to-text
 * 3. Claude handles conversation logic with tools
 * 4. ElevenLabs handles text-to-speech
 *
 * This gives us 100% control over the conversation flow.
 */

import twilio from 'twilio';
import WebSocket from 'ws';
import { ElevenLabsService } from './ElevenLabsService';
import { supabase } from '../config/supabase';
import { handleToolCall } from './VapiToolHandlers';
import { logger } from '../utils/Logger';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { Buffer } from 'buffer';
import { ChannelRouter } from './channelRouter';

// Twilio config - support both naming conventions
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || process.env.ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// ElevenLabs config
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Default: Sarah
const ELEVENLABS_MODEL = 'eleven_turbo_v2_5'; // Fast for real-time

// Claude config
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Backend URL for webhooks
const BACKEND_URL = process.env.BACKEND_URL || 'https://coa.extractoseum.com';

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

// Initialize services
const twilioClient = (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN)
    ? twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    : null;

const elevenLabs = new ElevenLabsService();
const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;

// Active call sessions
interface CallSession {
    callSid: string;
    streamSid?: string;
    customerPhone: string;
    conversationId?: string;
    clientId?: string;
    clientName?: string;
    clientTags?: string[];
    clientType?: string; // Gold_member, Club_partner, etc.
    channelChipId?: string; // Voice channel chip ID for CRM routing
    messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp?: Date }>;
    ws?: WebSocket;
    createdAt: Date;
}

const activeCalls = new Map<string, CallSession>();

// Tools available to Claude for voice calls
const VOICE_TOOLS: Anthropic.Tool[] = [
    {
        name: 'search_products',
        description: 'Busca productos en el catálogo. Usa esto cuando el cliente pregunte por productos, gomitas, tinturas, etc.',
        input_schema: {
            type: 'object' as const,
            properties: {
                query: { type: 'string', description: 'Término de búsqueda (ej: gomitas, tintura, energizante)' },
                category: { type: 'string', description: 'Categoría opcional (comestibles, tinturas, topicos)' }
            },
            required: ['query']
        }
    },
    {
        name: 'lookup_order',
        description: 'Busca información de un pedido. Usa cuando pregunten por estado de envío o pedido.',
        input_schema: {
            type: 'object' as const,
            properties: {
                order_number: { type: 'string', description: 'Número de orden (opcional si tenemos contexto del cliente)' }
            }
        }
    },
    {
        name: 'get_coa',
        description: 'Obtiene el Certificado de Análisis (COA) de un producto o lote.',
        input_schema: {
            type: 'object' as const,
            properties: {
                batch_number: { type: 'string', description: 'Número de lote' },
                product_name: { type: 'string', description: 'Nombre del producto' }
            }
        }
    },
    {
        name: 'send_whatsapp',
        description: 'Envía información por WhatsApp al cliente.',
        input_schema: {
            type: 'object' as const,
            properties: {
                message: { type: 'string', description: 'Mensaje a enviar' }
            },
            required: ['message']
        }
    },
    {
        name: 'escalate_to_human',
        description: 'Registra solicitud de atención humana.',
        input_schema: {
            type: 'object' as const,
            properties: {
                reason: { type: 'string', description: 'Razón de la escalación' },
                wants_callback: { type: 'boolean', description: 'Si quiere que le devuelvan la llamada' }
            },
            required: ['reason']
        }
    }
];

// System prompt for Ara
const ARA_SYSTEM_PROMPT = `Eres Ara, la asistente de ventas de Extractos EUM. Tu personalidad es cálida, profesional y conocedora.

REGLAS IMPORTANTES:
1. Responde de forma BREVE y CONVERSACIONAL - esto es una llamada telefónica, no un chat.
2. USA TUS HERRAMIENTAS. Cuando pregunten por productos, usa search_products. Cuando pregunten por pedidos, usa lookup_order.
3. NUNCA inventes información de productos, precios o disponibilidad. Siempre consulta.
4. Si no encuentras algo, admítelo honestamente y ofrece alternativas.
5. Sé empática pero eficiente - el tiempo del cliente es valioso.

PRODUCTOS PRINCIPALES:
- Gomitas (Sour Extreme Gummies, Hot Bites, Cream Candy)
- Tinturas de CBD/HHC
- Tópicos (cremas, sticks)
- Materias primas (aislados, destilados)

FLUJO DE VENTA:
1. Saluda y pregunta cómo puedes ayudar
2. Identifica la necesidad (¿qué busca? ¿para qué lo necesita?)
3. Busca productos relevantes con search_products
4. Presenta opciones con precios
5. Ofrece enviar información por WhatsApp
6. Cierra la venta o agenda seguimiento`;

export class VoiceCallService {

    /**
     * Generate TwiML for incoming calls - connects to WebSocket for streaming
     */
    generateIncomingCallTwiML(callSid: string): string {
        const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');

        // Start call recording via Twilio API (non-blocking)
        // This is more reliable than TwiML <Record> for streaming calls
        if (twilioClient) {
            (async () => {
                try {
                    await twilioClient.calls(callSid).recordings.create({
                        recordingStatusCallback: `${BACKEND_URL}/api/voice/recording-status`,
                        recordingStatusCallbackEvent: ['completed']
                    });
                    logger.info(`[VoiceCallService] Recording started for call ${callSid}`);
                } catch (recErr: any) {
                    logger.error(`[VoiceCallService] Failed to start recording for ${callSid}:`, recErr);
                }
            })();
        }

        // Connect to WebSocket stream for real-time audio processing
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <Stream url="${wsUrl}/api/voice/stream/${callSid}">
            <Parameter name="callSid" value="${callSid}"/>
        </Stream>
    </Connect>
</Response>`;
    }

    /**
     * Generate TwiML with initial greeting (simpler approach without WebSocket)
     */
    generateGreetingTwiML(greeting: string, callSid: string): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Mia-Neural" language="es-MX">${greeting}</Say>
    <Gather input="speech" timeout="3" speechTimeout="auto" action="${BACKEND_URL}/api/voice/gather/${callSid}" method="POST" language="es-MX">
        <Say voice="Polly.Mia-Neural" language="es-MX">¿En qué puedo ayudarte?</Say>
    </Gather>
    <Say voice="Polly.Mia-Neural" language="es-MX">No te escuché. Por favor llama de nuevo.</Say>
</Response>`;
    }

    /**
     * Handle incoming call webhook from Twilio
     */
    async handleIncomingCall(callSid: string, from: string, to: string): Promise<string> {
        logger.info(`Incoming call started`, { correlation_id: callSid, from, to, service: 'VoiceCallService' });


        try {
            // Look up customer context with full profile and channel chip routing
            let context: {
                clientId?: string;
                clientName?: string;
                clientTags?: string[];
                clientType?: string;
                conversationId?: string;
                channelChipId?: string;
                columnId?: string;
                recentOrders?: any[];
                totalSpent?: number;
            } = {};
            try {
                // Pass both caller phone (from) and Twilio number (to) for chip resolution
                context = await this.getCustomerContext(from, to);
                logger.info(`Customer context recovered`, {
                    correlation_id: callSid,
                    clientId: context.clientId,
                    clientName: context.clientName,
                    clientType: context.clientType,
                    tags: context.clientTags,
                    channelChipId: context.channelChipId,
                    conversationId: context.conversationId
                });
            } catch (ctxError: any) {
                logger.warn('Failed to get context', ctxError, { correlation_id: callSid });
            }

            // Create session with full context including chip
            const session: CallSession = {
                callSid,
                customerPhone: from,
                conversationId: context.conversationId,
                clientId: context.clientId,
                clientName: context.clientName,
                clientTags: context.clientTags,
                clientType: context.clientType,
                channelChipId: context.channelChipId,
                messages: [],
                createdAt: new Date()
            };
            activeCalls.set(callSid, session);

            // Log call in database with client context and chip (non-blocking)
            (async () => {
                try {
                    await supabase.from('voice_calls').insert({
                        vapi_call_id: callSid,
                        conversation_id: context.conversationId,
                        client_id: context.clientId,
                        channel_chip_id: context.channelChipId,
                        direction: 'inbound',
                        phone_number: from,
                        status: 'in-progress',
                        started_at: new Date().toISOString(),
                        context_injected: !!(context.clientId || context.clientName),
                        context_data: {
                            clientName: context.clientName,
                            clientType: context.clientType,
                            clientTags: context.clientTags,
                            totalSpent: context.totalSpent,
                            recentOrders: context.recentOrders,
                            columnId: context.columnId
                        }
                    });
                    logger.debug('Call logged to DB with context and chip', { correlation_id: callSid });
                } catch (dbError: any) {
                    logger.error('Failed to log call to DB', dbError, { correlation_id: callSid });
                }
            })();

            // Streaming Mode: Connect immediately to WebSocket
            return this.generateIncomingCallTwiML(callSid);
        } catch (error: any) {
            logger.error('handleIncomingCall fatal error', error, { correlation_id: callSid });
            return this.generateGreetingTwiML('¡Hola! Soy Ara de Extractos EUM. ¿En qué puedo ayudarte?', callSid);
        }
    }

    /**
     * Handle speech input from Twilio Gather
     */
    async handleSpeechInput(callSid: string, speechResult: string): Promise<string> {
        logger.info(`Received speech input`, { correlation_id: callSid, speech: speechResult });

        const session = activeCalls.get(callSid);
        if (!session) {
            logger.error(`No active session found for call`, null, { correlation_id: callSid });
            return this.generateErrorTwiML();
        }

        // Add user message to history
        session.messages.push({ role: 'user', content: speechResult });

        try {
            // Get AI response
            const response = await this.getClaudeResponse(session, speechResult);

            // Add assistant message to history
            session.messages.push({ role: 'assistant', content: response });

            // Generate TwiML with response and continue listening
            return this.generateResponseTwiML(response, callSid);

        } catch (error: any) {
            logger.error('Error processing speech', error, { correlation_id: callSid });
            return this.generateResponseTwiML(
                'Disculpa, tuve un problema técnico. ¿Podrías repetir tu pregunta?',
                callSid
            );
        }
    }

    /**
     * Get response from Claude with tool use
     */
    private async getClaudeResponse(session: CallSession, userInput: string): Promise<string> {
        if (!anthropic) {
            throw new Error('Anthropic client not configured');
        }

        // Build rich context from client profile
        // Use context if we have clientId OR clientName (for clients found via conversations)
        let contextInfo = '';
        if (session.clientId || session.clientName) {
            const greetingName = session.clientName ? session.clientName.split(' ')[0] : '';
            const clientTypeLabel = {
                'gold': 'Cliente Gold - trato VIP',
                'partner': 'Partner del Club - descuentos especiales',
                'club': 'Miembro del Club',
                'vip': 'Cliente VIP - alta intención de compra',
                'returning': 'Cliente recurrente',
                'new': 'Cliente nuevo'
            }[session.clientType || 'new'] || 'Cliente';

            contextInfo = `
[CONTEXTO DEL CLIENTE - USA ESTA INFORMACIÓN PARA PERSONALIZAR]
- Nombre: ${session.clientName || 'Desconocido'} (salúdalo como "${greetingName || 'amigo'}")
- Tipo: ${clientTypeLabel}
- Tags: ${(session.clientTags || []).join(', ') || 'ninguno'}
- Teléfono: ${session.customerPhone}
${session.clientId ? `- ID Cliente: ${session.clientId}` : '- Cliente identificado por conversación previa'}

INSTRUCCIONES DE PERSONALIZACIÓN:
- IMPORTANTE: Saluda al cliente por su nombre "${greetingName}" en tu primera respuesta
- Si es Gold/VIP/Partner: Trato especial, menciona beneficios exclusivos
- Si es cliente recurrente/VIP: Pregunta si quiere reordenar lo de siempre
- Si es nuevo: Sé más explicativo sobre productos
- SIEMPRE usa el nombre del cliente en la conversación`;
        }

        const messages: Anthropic.MessageParam[] = [
            ...session.messages.slice(-10).map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content
            }))
        ];

        // Add rich context to system prompt
        const systemPrompt = contextInfo
            ? `${ARA_SYSTEM_PROMPT}\n\n${contextInfo}`
            : ARA_SYSTEM_PROMPT;

        // Call Claude with tools
        const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 300, // Short for voice
            system: systemPrompt,
            messages,
            tools: VOICE_TOOLS
        });

        // Process response - handle tool calls
        let finalResponse = '';

        for (const block of response.content) {
            if (block.type === 'text') {
                finalResponse += block.text;
            } else if (block.type === 'tool_use') {
                // Execute tool
                logger.info(`Executing tool: ${block.name}`, { correlation_id: session.callSid, input: block.input });

                const toolResult = await handleToolCall(
                    block.name,
                    block.input as Record<string, any>,
                    {
                        conversationId: session.conversationId,
                        clientId: session.clientId,
                        customerPhone: session.customerPhone
                    }
                );

                logger.debug(`Tool execution result`, { correlation_id: session.callSid, tool: block.name, result: toolResult });

                // Get follow-up response from Claude with tool result
                const followUp = await anthropic.messages.create({
                    model: 'claude-sonnet-4-20250514',
                    max_tokens: 300,
                    system: systemPrompt,
                    messages: [
                        ...messages,
                        { role: 'assistant', content: response.content },
                        {
                            role: 'user',
                            content: [{
                                type: 'tool_result',
                                tool_use_id: block.id,
                                content: JSON.stringify(toolResult)
                            }]
                        }
                    ],
                    tools: VOICE_TOOLS
                });

                // Extract text from follow-up
                for (const followUpBlock of followUp.content) {
                    if (followUpBlock.type === 'text') {
                        finalResponse += followUpBlock.text;
                    }
                }
            }
        }

        return finalResponse || 'Disculpa, no pude procesar tu solicitud.';
    }

    /**
     * Generate TwiML response with speech and continue gathering
     */
    private generateResponseTwiML(text: string, callSid: string): string {
        // Escape XML special characters
        const escapedText = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');

        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Mia-Neural" language="es-MX">${escapedText}</Say>
    <Gather input="speech" timeout="5" speechTimeout="auto" action="${BACKEND_URL}/api/voice/gather/${callSid}" method="POST" language="es-MX">
    </Gather>
    <Say voice="Polly.Mia-Neural" language="es-MX">¿Hay algo más en lo que pueda ayudarte?</Say>
    <Gather input="speech" timeout="3" speechTimeout="auto" action="${BACKEND_URL}/api/voice/gather/${callSid}" method="POST" language="es-MX">
    </Gather>
    <Say voice="Polly.Mia-Neural" language="es-MX">Gracias por llamar a Extractos EUM. ¡Hasta pronto!</Say>
</Response>`;
    }

    /**
     * Generate error TwiML
     */
    private generateErrorTwiML(): string {
        return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Mia-Neural" language="es-MX">Lo siento, estamos experimentando dificultades técnicas. Por favor intenta más tarde.</Say>
    <Hangup/>
</Response>`;
    }

    /**
     * Get customer context from database with full profile
     * Searches in both clients table AND conversations table by contact_handle
     * Also resolves the Voice channel chip for CRM routing
     */
    private async getCustomerContext(phone: string, twilioNumber?: string): Promise<{
        clientId?: string;
        clientName?: string;
        clientTags?: string[];
        clientType?: string;
        conversationId?: string;
        channelChipId?: string;
        columnId?: string;
        recentOrders?: any[];
        totalSpent?: number;
    }> {
        try {
            // Clean phone for lookup - try multiple formats
            const cleanPhone = phone.replace(/\D/g, '').slice(-10);
            logger.info(`[getCustomerContext] Looking up phone: ${phone} -> cleaned: ${cleanPhone}`);

            // === RESOLVE VOICE CHANNEL CHIP ===
            const channelRouter = ChannelRouter.getInstance();
            const routing = await channelRouter.getRouting('VOICE', twilioNumber || '');
            const channelChipId = routing.channel_chip_id || undefined;
            const columnId = routing.column_id || undefined;

            if (channelChipId) {
                logger.info(`[getCustomerContext] Resolved Voice chip: ${channelChipId}, column: ${columnId}`);
            }

            // === STRATEGY 1: Search in clients table ===
            let { data: client, error } = await supabase
                .from('clients')
                .select('id, name, phone, email, tags, total_spent, order_count, notes')
                .ilike('phone', `%${cleanPhone}%`)
                .limit(1)
                .maybeSingle();

            if (error) {
                logger.error(`[getCustomerContext] DB error:`, error);
            }

            // If not found, try with country code variations
            if (!client && cleanPhone.length === 10) {
                const { data: client2 } = await supabase
                    .from('clients')
                    .select('id, name, phone, email, tags, total_spent, order_count, notes')
                    .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%52${cleanPhone}%`)
                    .limit(1)
                    .maybeSingle();
                client = client2;
            }

            // === STRATEGY 2: Search in conversations by contact_handle ===
            // This catches cases where the phone number exists in CRM but not in clients table
            const { data: existingConversation } = await supabase
                .from('conversations')
                .select('id, contact_handle, facts, column_id, tags')
                .ilike('contact_handle', `%${cleanPhone}%`)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            // If we found a conversation but no client, extract context from conversation facts
            if (!client && existingConversation) {
                const facts = existingConversation.facts as any || {};
                logger.info(`[getCustomerContext] Found conversation for phone: ${cleanPhone}, name from facts: ${facts.user_name}`);

                // Determine client type from conversation context
                let clientType = 'returning'; // Has conversation = returning customer
                if (facts.intent_score && facts.intent_score >= 80) {
                    clientType = 'vip'; // High intent = treat as VIP
                }

                // Try to find orders by phone number since we don't have client_id
                let recentOrders: any[] = [];
                let totalSpent = 0;
                try {
                    const { data: ordersByPhone } = await supabase
                        .from('orders')
                        .select('id, order_number, status, total_amount, financial_status, fulfillment_status, created_at')
                        .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%52${cleanPhone}%`)
                        .order('created_at', { ascending: false })
                        .limit(5);

                    if (ordersByPhone && ordersByPhone.length > 0) {
                        recentOrders = ordersByPhone;
                        totalSpent = ordersByPhone.reduce((sum, o) => sum + (parseFloat(o.total_amount) || 0), 0);
                        logger.info(`[getCustomerContext] Found ${ordersByPhone.length} orders by phone, totalSpent: ${totalSpent}`);
                    }
                } catch (orderErr) {
                    logger.warn(`[getCustomerContext] Error fetching orders by phone:`, orderErr);
                }

                return {
                    clientName: facts.user_name || undefined,
                    clientTags: existingConversation.tags || [],
                    clientType,
                    conversationId: existingConversation.id,
                    channelChipId,
                    columnId,
                    recentOrders,
                    totalSpent
                };
            }

            if (!client) {
                logger.warn(`[getCustomerContext] No client or conversation found for phone: ${cleanPhone}`);

                // Still try to use existing conversation if found
                if (existingConversation) {
                    return {
                        conversationId: existingConversation.id,
                        channelChipId,
                        columnId
                    };
                }
                return { channelChipId, columnId };
            }

            // Parse tags to determine client type
            const tags = client.tags || [];
            let clientType = 'new';
            if (tags.includes('Gold_member')) clientType = 'gold';
            else if (tags.includes('Club_partner')) clientType = 'partner';
            else if (tags.includes('Club_user')) clientType = 'club';
            else if (tags.includes('VIP Minorista')) clientType = 'vip';
            else if ((client.order_count || 0) > 0) clientType = 'returning';

            logger.info(`[getCustomerContext] Found client: ${client.name} (${client.id}), type: ${clientType}, tags: ${tags.join(', ')}`);

            // Get recent orders for context
            const { data: recentOrders } = await supabase
                .from('orders')
                .select('id, order_number, status, total, created_at')
                .eq('client_id', client.id)
                .order('created_at', { ascending: false })
                .limit(3);

            // Use existing conversation if found, or find by contact_handle
            let conversationId = existingConversation?.id;

            if (!conversationId) {
                // Try to find conversation by contact_handle matching client phone
                const { data: convByHandle } = await supabase
                    .from('conversations')
                    .select('id')
                    .ilike('contact_handle', `%${cleanPhone}%`)
                    .order('updated_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                conversationId = convByHandle?.id;
            }

            // If still no conversation, create one with chip routing
            if (!conversationId) {
                const { data: newConv } = await supabase
                    .from('conversations')
                    .insert({
                        contact_handle: cleanPhone,
                        channel: 'VOICE',
                        channel_chip_id: channelChipId,
                        column_id: columnId,
                        facts: {
                            user_name: client.name
                        }
                    })
                    .select('id')
                    .single();
                conversationId = newConv?.id;
                logger.info(`[getCustomerContext] Created new conversation: ${conversationId} with chip: ${channelChipId}`);
            }

            return {
                clientId: client.id,
                clientName: client.name,
                clientTags: tags,
                clientType,
                conversationId,
                channelChipId,
                columnId,
                recentOrders: recentOrders || [],
                totalSpent: client.total_spent || 0
            };

        } catch (error: any) {
            logger.error('Error getting context', error);
            return {};
        }
    }

    /**
     * Make outbound call
     */
    async makeOutboundCall(params: {
        phoneNumber: string;
        customerName?: string;
        conversationId?: string;
    }): Promise<{ success: boolean; callSid?: string; error?: string }> {
        if (!twilioClient || !TWILIO_PHONE_NUMBER) {
            return { success: false, error: 'Twilio not configured' };
        }

        try {
            const greeting = params.customerName
                ? `Hola ${params.customerName.split(' ')[0]}, soy Ara de Extractos EUM.`
                : 'Hola, soy Ara de Extractos EUM.';

            const call = await twilioClient.calls.create({
                to: params.phoneNumber,
                from: TWILIO_PHONE_NUMBER,
                url: `${BACKEND_URL}/api/voice/outbound-connect`,
                statusCallback: `${BACKEND_URL}/api/voice/status`,
                statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
            });

            logger.info(`Outbound call initiated`, { correlation_id: call.sid, to: params.phoneNumber });

            // Create session
            const session: CallSession = {
                callSid: call.sid,
                customerPhone: params.phoneNumber,
                conversationId: params.conversationId,
                messages: [],
                createdAt: new Date()
            };
            activeCalls.set(call.sid, session);

            // Log in database
            await supabase.from('voice_calls').insert({
                vapi_call_id: call.sid,
                conversation_id: params.conversationId,
                direction: 'outbound',
                phone_number: params.phoneNumber,
                status: 'initiated',
                started_at: new Date().toISOString()
            });

            return { success: true, callSid: call.sid };

        } catch (error: any) {
            logger.error('Outbound call failed', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle call status updates
     */
    async handleStatusCallback(callSid: string, status: string): Promise<void> {
        logger.info(`Call status update: ${status}`, { correlation_id: callSid });

        // Update database
        await supabase
            .from('voice_calls')
            .update({
                status,
                ...(status === 'completed' ? { ended_at: new Date().toISOString() } : {})
            })
            .eq('vapi_call_id', callSid);

        // Clean up session if call ended
        if (['completed', 'busy', 'failed', 'no-answer', 'canceled'].includes(status)) {
            activeCalls.delete(callSid);
        }
    }

    /**
     * End a call
     */
    async endCall(callSid: string): Promise<void> {
        if (!twilioClient) return;

        try {
            await twilioClient.calls(callSid).update({ status: 'completed' });
            activeCalls.delete(callSid);
        } catch (error: any) {
            logger.error(`Error ending call`, error, { correlation_id: callSid });
        }
    }

    /**
     * Get active call count
     */
    getActiveCallCount(): number {
        return activeCalls.size;
    }

    /**
     * Save transcript message to database and conversation
     */
    private async saveTranscript(
        session: CallSession,
        role: 'user' | 'assistant',
        content: string
    ): Promise<void> {
        try {
            // Get existing call record
            const { data: existingCall, error: fetchError } = await supabase
                .from('voice_calls')
                .select('transcript, messages_json')
                .eq('vapi_call_id', session.callSid)
                .single();

            if (fetchError) {
                logger.warn(`Could not fetch existing call for transcript`, {
                    correlation_id: session.callSid,
                    error: fetchError.message
                });
            }

            // Build new transcript entry
            const newEntry = {
                role,
                content,
                timestamp: new Date().toISOString()
            };

            // Append to messages_json array
            const messagesJson = existingCall?.messages_json || [];
            messagesJson.push(newEntry);

            // Append to transcript text (human-readable format)
            const roleLabel = role === 'user' ? 'Cliente' : 'Ara';
            const existingTranscript = existingCall?.transcript || '';
            const newTranscript = existingTranscript
                ? `${existingTranscript}\n[${roleLabel}]: ${content}`
                : `[${roleLabel}]: ${content}`;

            // Update the voice_calls record
            const { error: updateError } = await supabase
                .from('voice_calls')
                .update({
                    transcript: newTranscript,
                    messages_json: messagesJson
                })
                .eq('vapi_call_id', session.callSid);

            if (updateError) {
                logger.error(`Failed to update transcript`, {
                    correlation_id: session.callSid,
                    error: updateError.message
                });
            }

            // Also save to conversation messages if we have a conversation
            if (session.conversationId) {
                await supabase.from('messages').insert({
                    conversation_id: session.conversationId,
                    content,
                    from_customer: role === 'user',
                    channel: 'voice'
                });
            }

            logger.debug(`Transcript saved: ${role}`, { correlation_id: session.callSid });
        } catch (error: any) {
            logger.error('Failed to save transcript', error, { correlation_id: session.callSid });
        }
    }

    /**
     * Handle WebSocket connection for Audio Streaming
     * Twilio <Stream> -> Deepgram -> Claude -> ElevenLabs -> Twilio
     */
    async handleStreamConnection(ws: WebSocket): Promise<void> {
        logger.info('[VoiceStreaming] New WebSocket connection established');

        let callSid = '';
        let streamSid = '';
        let deepgram: any = null;
        let isAiProcessing = false;

        // Message buffer for user speech
        let transcriptBuffer: { text: string, timestamp: number }[] = [];
        let transcriptTimer: NodeJS.Timeout | null = null;

        // Initialize Deepgram
        if (DEEPGRAM_API_KEY) {
            const dgClient = createClient(DEEPGRAM_API_KEY);
            deepgram = dgClient.listen.live({
                model: 'nova-2',
                language: 'es',
                smart_format: true,
                encoding: 'mulaw',
                sample_rate: 8000,
                channels: 1,
            });

            // Deepgram Open
            deepgram.on(LiveTranscriptionEvents.Open, () => {
                logger.info('[Deepgram] Connection opened', { correlation_id: callSid });
            });

            // Deepgram Close
            deepgram.on(LiveTranscriptionEvents.Close, () => {
                logger.info('[Deepgram] Connection closed', { correlation_id: callSid });
            });

            // Deepgram Transcription
            deepgram.on(LiveTranscriptionEvents.Transcript, (data: any) => {
                const transcript = data.channel?.alternatives?.[0]?.transcript;
                if (transcript && transcript.trim().length > 0) {
                    const isFinal = data.is_final;
                    logger.debug(`[Deepgram] Transcript`, { text: transcript, isFinal, correlation_id: callSid });

                    if (isFinal) {
                        // Add to buffer
                        transcriptBuffer.push({ text: transcript, timestamp: Date.now() });

                        // Reset timer to process buffer if silence follows
                        if (transcriptTimer) clearTimeout(transcriptTimer);

                        transcriptTimer = setTimeout(() => {
                            processTranscriptBuffer();
                        }, 800); // 800ms silence threshold to assume turn end
                    }
                }
            });

            // Deepgram Error
            deepgram.on(LiveTranscriptionEvents.Error, (err: any) => {
                logger.error('[Deepgram] Error', err, { correlation_id: callSid });
            });
        } else {
            logger.error('[VoiceStreaming] Deepgram API Key missing!');
        }

        const processTranscriptBuffer = async () => {
            if (transcriptBuffer.length === 0 || isAiProcessing) return;

            const fullText = transcriptBuffer.map(t => t.text).join(' ').trim();
            transcriptBuffer = []; // Clear buffer

            if (fullText.length < 2) return; // Ignore noise

            logger.info(`[VoiceStreaming] Processing user input: "${fullText}"`, { correlation_id: callSid });
            isAiProcessing = true;

            try {
                // Get Session
                const session = activeCalls.get(callSid);
                if (!session) {
                    logger.warn('Session not found for streaming call', { correlation_id: callSid });
                    return;
                }

                // Append to history with timestamp
                const userMessage = { role: 'user' as const, content: fullText, timestamp: new Date() };
                session.messages.push(userMessage);

                // Save user transcript to DB
                this.saveTranscript(session, 'user', fullText);

                // Get AI Response
                const aiResponseText = await this.getClaudeResponse(session, fullText);

                // Add to history with timestamp
                const assistantMessage = { role: 'assistant' as const, content: aiResponseText, timestamp: new Date() };
                session.messages.push(assistantMessage);

                // Save assistant response to DB
                this.saveTranscript(session, 'assistant', aiResponseText);

                logger.info(`[VoiceStreaming] AI Response: "${aiResponseText}"`, { correlation_id: callSid });

                // TTS via ElevenLabs (Streaming)
                // NOTE: ElevenLabsService needs a stream method. 
                // For now, we'll generate the full audio and send it as a media event.
                // Ideally, we pipe the stream.

                // Generate Audio Buffer - use ulaw_8000 for Twilio compatibility
                const audioBuffer = await elevenLabs.generateAudioAdvanced(aiResponseText, ELEVENLABS_VOICE_ID, {
                    model_id: ELEVENLABS_MODEL as any,
                    output_format: 'ulaw_8000',
                    voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                });

                // Send to Twilio
                const payload = audioBuffer.toString('base64');

                const mediaMessage = {
                    event: 'media',
                    streamSid: streamSid,
                    media: {
                        payload
                    }
                };

                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify(mediaMessage));

                    // Send mark to track completion
                    const markMessage = {
                        event: 'mark',
                        streamSid: streamSid,
                        mark: { name: 'response_complete' }
                    };
                    ws.send(JSON.stringify(markMessage));
                }

            } catch (err: any) {
                logger.error('[VoiceStreaming] Error processing turn', err, { correlation_id: callSid });
            } finally {
                isAiProcessing = false;
            }
        };

        // Twilio WebSocket Events
        ws.on('message', (message: string) => {
            try {
                const msg = JSON.parse(message);

                switch (msg.event) {
                    case 'start':
                        callSid = msg.start.callSid;
                        streamSid = msg.start.streamSid;
                        logger.info(`[TwilioStream] Stream started`, { callSid, streamSid });

                        // Recover session context if exists
                        const session = activeCalls.get(callSid);
                        if (session) {
                            session.ws = ws;
                            session.streamSid = streamSid;

                            // Send personalized initial greeting
                            (async () => {
                                try {
                                    // Build personalized greeting
                                    let greeting = '¡Hola! Soy Ara de Extractos EUM. ¿En qué puedo ayudarte hoy?';

                                    if (session.clientName) {
                                        const firstName = session.clientName.split(' ')[0];
                                        const typeGreeting = {
                                            'gold': `¡Hola ${firstName}! Soy Ara de Extractos EUM. Es un gusto atenderte, miembro Gold. ¿En qué puedo ayudarte hoy?`,
                                            'vip': `¡Hola ${firstName}! Soy Ara de Extractos EUM. Me alegra escucharte de nuevo. ¿En qué te puedo apoyar?`,
                                            'partner': `¡Hola ${firstName}! Soy Ara de Extractos EUM. Bienvenido, partner. ¿En qué te ayudo?`,
                                            'returning': `¡Hola ${firstName}! Soy Ara de Extractos EUM. Qué gusto escucharte de nuevo. ¿En qué te puedo ayudar?`,
                                            'club': `¡Hola ${firstName}! Soy Ara de Extractos EUM. ¿En qué puedo ayudarte hoy?`
                                        }[session.clientType || 'returning'] || `¡Hola ${firstName}! Soy Ara de Extractos EUM. ¿En qué puedo ayudarte hoy?`;
                                        greeting = typeGreeting;
                                    }

                                    logger.info(`[VoiceStreaming] Sending personalized greeting`, {
                                        correlation_id: callSid,
                                        clientName: session.clientName,
                                        clientType: session.clientType,
                                        greeting
                                    });

                                    // Add greeting to conversation history
                                    session.messages.push({ role: 'assistant', content: greeting, timestamp: new Date() });

                                    // Save greeting to transcript
                                    this.saveTranscript(session, 'assistant', greeting);

                                    // Generate TTS audio
                                    const audioBuffer = await elevenLabs.generateAudioAdvanced(greeting, ELEVENLABS_VOICE_ID, {
                                        model_id: ELEVENLABS_MODEL as any,
                                        output_format: 'ulaw_8000',
                                        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
                                    });

                                    // Send audio to Twilio
                                    const mediaMessage = {
                                        event: 'media',
                                        streamSid: streamSid,
                                        media: { payload: audioBuffer.toString('base64') }
                                    };

                                    if (ws.readyState === WebSocket.OPEN) {
                                        ws.send(JSON.stringify(mediaMessage));
                                        ws.send(JSON.stringify({
                                            event: 'mark',
                                            streamSid: streamSid,
                                            mark: { name: 'greeting_complete' }
                                        }));
                                    }

                                } catch (greetErr: any) {
                                    logger.error('[VoiceStreaming] Error sending greeting', greetErr, { correlation_id: callSid });
                                }
                            })();
                        }
                        break;

                    case 'media':
                        // Send audio to Deepgram
                        if (deepgram && deepgram.getReadyState() === 1) { // 1 = OPEN
                            const payload = Buffer.from(msg.media.payload, 'base64');
                            deepgram.send(payload);
                        }
                        break;

                    case 'stop':
                        logger.info(`[TwilioStream] Stream stopped`, { callSid });
                        if (deepgram) deepgram.finish();
                        break;
                }
            } catch (e) {
                // Ignore parse errors
            }
        });

        ws.on('close', () => {
            logger.info('[VoiceStreaming] WebSocket closed');
            if (deepgram) deepgram.finish();
        });
    }
}

// Export singleton
export const voiceCallService = new VoiceCallService();



