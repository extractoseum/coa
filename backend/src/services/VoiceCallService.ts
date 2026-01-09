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
        logger.info(`Incoming call started`, { correlation_id: callSid, from, to, service: 'VoiceCallService' });


        try {
            // Look up customer context (with fallback)
            let context: { clientId?: string; clientName?: string; conversationId?: string } = {};
            try {
                context = await this.getCustomerContext(from);
                logger.info(`Customer context recovered`, { correlation_id: callSid, clientId: context.clientId, clientName: context.clientName });
            } catch (ctxError: any) {
                logger.warn('Failed to get context', ctxError, { correlation_id: callSid });
            }

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

            // Log call in database (non-blocking, don't await)
            (async () => {
                try {
                    await supabase.from('voice_calls').insert({
                        vapi_call_id: callSid,
                        conversation_id: context.conversationId,
                        direction: 'inbound',
                        phone_number: from,
                        status: 'in-progress',
                        started_at: new Date().toISOString()
                    });
                    logger.debug('Call logged to DB', { correlation_id: callSid });
                } catch (dbError: any) {
                    logger.error('Failed to log call to DB', dbError, { correlation_id: callSid });
                }
            })();

            // Streaming Mode: Connect immediately to WebSocket
            // Generate personalized greeting is handled by the initial AI response in the stream
            return this.generateIncomingCallTwiML(callSid);
        } catch (error: any) {
            logger.error('handleIncomingCall fatal error', error, { correlation_id: callSid });
            // Return a simple greeting anyway
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
     * Get customer context from database
     */
    private async getCustomerContext(phone: string): Promise<{
        clientId?: string;
        clientName?: string;
        conversationId?: string;
    }> {
        try {
            // Clean phone for lookup - try multiple formats
            const cleanPhone = phone.replace(/\D/g, '').slice(-10);
            logger.info(`[getCustomerContext] Looking up phone: ${phone} -> cleaned: ${cleanPhone}`);

            // Try exact match on cleaned phone
            let { data: client, error } = await supabase
                .from('clients')
                .select('id, name, phone')
                .ilike('phone', `%${cleanPhone}%`)
                .limit(1)
                .maybeSingle();

            if (error) {
                logger.error(`[getCustomerContext] DB error:`, error);
            }

            // If not found, try with country code variations
            if (!client && cleanPhone.length === 10) {
                // Try with 52 prefix (Mexico)
                const { data: client2 } = await supabase
                    .from('clients')
                    .select('id, name, phone')
                    .or(`phone.ilike.%${cleanPhone}%,phone.ilike.%52${cleanPhone}%`)
                    .limit(1)
                    .maybeSingle();
                client = client2;
            }

            if (!client) {
                logger.warn(`[getCustomerContext] No client found for phone: ${cleanPhone}`);
                return {};
            }

            logger.info(`[getCustomerContext] Found client: ${client.name} (${client.id}), phone in DB: ${client.phone}`);

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

                // Append to history
                session.messages.push({ role: 'user', content: fullText });

                // Get AI Response
                const aiResponseText = await this.getClaudeResponse(session, fullText);

                // Add to history
                session.messages.push({ role: 'assistant', content: aiResponseText });

                logger.info(`[VoiceStreaming] AI Response: "${aiResponseText}"`, { correlation_id: callSid });

                // TTS via ElevenLabs (Streaming)
                // NOTE: ElevenLabsService needs a stream method. 
                // For now, we'll generate the full audio and send it as a media event.
                // Ideally, we pipe the stream.

                // Generate Audio Buffer
                const audioBuffer = await elevenLabs.generateAudioAdvanced(aiResponseText, ELEVENLABS_VOICE_ID, {
                    model_id: ELEVENLABS_MODEL as any,
                    output_format: 'mp3_44100_128',
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



