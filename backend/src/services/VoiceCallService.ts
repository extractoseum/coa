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
import Anthropic from '@anthropic-ai/sdk';

// Twilio config
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE_NUMBER = process.env.TWILIO_PHONE_NUMBER;

// ElevenLabs config
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'; // Default: Sarah
const ELEVENLABS_MODEL = 'eleven_turbo_v2_5'; // Fast for real-time

// Claude config
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Backend URL for webhooks
const BACKEND_URL = process.env.BACKEND_URL || 'https://coa-api-production.up.railway.app';

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
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
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
        console.log(`[VoiceCall] Incoming call ${callSid} from ${from}`);

        // Look up customer context
        const context = await this.getCustomerContext(from);

        // Create session
        const session: CallSession = {
            callSid,
            customerPhone: from,
            conversationId: context.conversationId,
            clientId: context.clientId,
            messages: [],
            createdAt: new Date()
        };
        activeCalls.set(callSid, session);

        // Log call in database
        await supabase.from('voice_calls').insert({
            vapi_call_id: callSid,
            conversation_id: context.conversationId,
            direction: 'inbound',
            phone_number: from,
            status: 'in-progress',
            started_at: new Date().toISOString()
        });

        // Generate personalized greeting
        const greeting = context.clientName
            ? `¡Hola ${context.clientName.split(' ')[0]}! Soy Ara de Extractos EUM.`
            : '¡Hola! Soy Ara de Extractos EUM. ¿Con quién tengo el gusto?';

        return this.generateGreetingTwiML(greeting, callSid);
    }

    /**
     * Handle speech input from Twilio Gather
     */
    async handleSpeechInput(callSid: string, speechResult: string): Promise<string> {
        console.log(`[VoiceCall] Speech from ${callSid}: "${speechResult}"`);

        const session = activeCalls.get(callSid);
        if (!session) {
            console.error(`[VoiceCall] No session for ${callSid}`);
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
            console.error(`[VoiceCall] Error processing speech:`, error.message);
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

        // Build context message
        let contextInfo = '';
        if (session.clientId) {
            contextInfo = `[Contexto: Cliente ID ${session.clientId}, Teléfono: ${session.customerPhone}]`;
        }

        const messages: Anthropic.MessageParam[] = [
            ...session.messages.slice(-10).map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content
            }))
        ];

        // Add context to system if available
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
                console.log(`[VoiceCall] Tool call: ${block.name}`, block.input);

                const toolResult = await handleToolCall(
                    block.name,
                    block.input as Record<string, any>,
                    {
                        conversationId: session.conversationId,
                        clientId: session.clientId,
                        customerPhone: session.customerPhone
                    }
                );

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
     * Get customer context from database
     */
    private async getCustomerContext(phone: string): Promise<{
        clientId?: string;
        clientName?: string;
        conversationId?: string;
    }> {
        try {
            // Clean phone for lookup
            const cleanPhone = phone.replace(/\D/g, '').slice(-10);

            // Find client
            const { data: client } = await supabase
                .from('clients')
                .select('id, name')
                .ilike('phone', `%${cleanPhone}%`)
                .limit(1)
                .maybeSingle();

            if (!client) {
                return {};
            }

            // Find or create conversation
            const { data: conversation } = await supabase
                .from('conversations')
                .select('id')
                .eq('client_id', client.id)
                .eq('is_archived', false)
                .order('updated_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            let conversationId = conversation?.id;

            if (!conversationId) {
                // Create new conversation for voice
                const { data: newConv } = await supabase
                    .from('conversations')
                    .insert({
                        client_id: client.id,
                        channel: 'voice',
                        is_archived: false
                    })
                    .select('id')
                    .single();
                conversationId = newConv?.id;
            }

            return {
                clientId: client.id,
                clientName: client.name,
                conversationId
            };

        } catch (error: any) {
            console.error('[VoiceCall] Error getting context:', error.message);
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

            console.log(`[VoiceCall] Outbound call initiated: ${call.sid}`);

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
            console.error('[VoiceCall] Outbound call error:', error.message);
            return { success: false, error: error.message };
        }
    }

    /**
     * Handle call status updates
     */
    async handleStatusCallback(callSid: string, status: string): Promise<void> {
        console.log(`[VoiceCall] Status update for ${callSid}: ${status}`);

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
            console.error(`[VoiceCall] Error ending call ${callSid}:`, error.message);
        }
    }

    /**
     * Get active call count
     */
    getActiveCallCount(): number {
        return activeCalls.size;
    }
}

// Export singleton
export const voiceCallService = new VoiceCallService();
