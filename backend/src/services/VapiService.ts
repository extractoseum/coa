import axios from 'axios';
import { supabase } from '../config/supabase';
import { normalizePhone } from '../utils/phoneUtils';
import { vapiContextService } from './VapiContextService';
import { handleToolCall } from './VapiToolHandlers';
import { vapiEventLogger } from './VapiEventLogger';

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
        if (params.conversationId) {
            contextData = await vapiContextService.buildContextForConversation(params.conversationId);
        } else {
            contextData = await vapiContextService.buildContextForPhone(params.phoneNumber);
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
                    await this.handleStatusUpdate(call);
                    break;

                case 'end-of-call-report':
                    await this.handleEndOfCall(message);
                    break;

                case 'transcript':
                    await this.handleTranscript(message);
                    break;

                case 'user-interrupted':
                    await this.handleUserInterrupted(message);
                    break;

                case 'hang':
                    await this.handleHang(message);
                    break;
            }
        } catch (e: any) {
            console.error(`[VapiService] Error handling ${type}:`, e.message);
            // Log error event
            if (call?.id) {
                await vapiEventLogger.logEvent({
                    vapi_call_id: call.id,
                    event_type: 'error',
                    event_data: { error: e.message, webhook_type: type }
                });
            }
        }

        return { success: true };
    }

    /**
     * Dynamic assistant selection for inbound calls with context injection
     */
    private async handleAssistantRequest(call: any) {
        const phoneNumber = call.customer?.number;
        const phoneNumberId = call.phoneNumberId;

        console.log(`[VapiService] Assistant Request for ${phoneNumber} via phone ${phoneNumberId?.substring(0, 8)}...`);

        // Build context for the caller
        const contextData = await vapiContextService.buildContextForPhone(phoneNumber);

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

        console.log(`[VapiService] Returning assistant ${assistantId} with ${contextData.contextMessage ? 'context' : 'no context'}`);
        return response;
    }

    /**
     * Execute tool calls using VapiToolHandlers
     *
     * IMPORTANT: VAPI requires specific response format:
     * - HTTP 200 always (even for errors)
     * - results array with toolCallId and result (string, no line breaks)
     * - toolCallId must match exactly
     */
    private async handleToolCalls(message: any) {
        const results = [];
        const call = message.call;

        // Log the full payload for debugging
        console.log(`[VapiService] Tool-calls payload:`, JSON.stringify({
            toolWithToolCallList: message.toolWithToolCallList?.length,
            toolCallList: message.toolCallList?.length,
            call: { id: call?.id, customer: call?.customer }
        }));

        // Extract context from call metadata
        const context = {
            conversationId: call?.metadata?.conversationId,
            clientId: call?.metadata?.clientId,
            customerPhone: call?.customer?.number
        };

        // VAPI sends tool calls in toolWithToolCallList
        // Each item has: { type, function: { name, arguments }, id } OR { toolCall: { id }, function: {...} }
        const toolCalls = message.toolWithToolCallList || message.toolCallList || [];

        for (const toolCall of toolCalls) {
            // Extract the tool call ID - can be in different places depending on VAPI version
            const toolCallId = toolCall.id || toolCall.toolCall?.id;
            const functionName = toolCall.function?.name || toolCall.name;
            const functionArgs = toolCall.function?.arguments || toolCall.parameters || '{}';

            console.log(`[VapiService] Executing Tool: ${functionName} (ID: ${toolCallId})`);

            // Start timing for logging
            const startTime = Date.now();
            let parsedArgs: Record<string, any> = {};

            try {
                parsedArgs = typeof functionArgs === 'string'
                    ? JSON.parse(functionArgs)
                    : functionArgs || {};

                console.log(`[VapiService] Tool args:`, parsedArgs);
                console.log(`[VapiService] Context:`, context);

                // Use centralized tool handler
                const result = await handleToolCall(functionName, parsedArgs, context);
                const duration = Date.now() - startTime;

                console.log(`[VapiService] Tool result (${duration}ms):`, result);

                // Log successful tool call
                await vapiEventLogger.logToolCall({
                    vapi_call_id: call?.id,
                    conversation_id: context.conversationId,
                    client_id: context.clientId,
                    tool_name: functionName,
                    tool_call_id: toolCallId,
                    arguments: parsedArgs,
                    arguments_raw: typeof functionArgs === 'string' ? functionArgs : undefined,
                    success: result.success !== false,
                    result: result,
                    result_message: result.message,
                    duration_ms: duration,
                    customer_phone: context.customerPhone
                });

                // CRITICAL: Result must be a single-line string with no line breaks
                // Line breaks cause VAPI to fail parsing and return "No result returned"
                const resultString = JSON.stringify(result).replace(/\n/g, ' ').replace(/\r/g, '');

                results.push({
                    toolCallId: toolCallId,
                    result: resultString
                });
            } catch (e: any) {
                const duration = Date.now() - startTime;
                console.error(`[VapiService] Tool error for ${functionName}:`, e.message, e.stack);

                // Log failed tool call
                await vapiEventLogger.logToolCall({
                    vapi_call_id: call?.id,
                    conversation_id: context.conversationId,
                    client_id: context.clientId,
                    tool_name: functionName,
                    tool_call_id: toolCallId,
                    arguments: parsedArgs,
                    arguments_raw: typeof functionArgs === 'string' ? functionArgs : undefined,
                    success: false,
                    error_message: e.message,
                    error_stack: e.stack,
                    duration_ms: duration,
                    customer_phone: context.customerPhone
                });

                results.push({
                    toolCallId: toolCallId,
                    error: e.message.replace(/\n/g, ' ')
                });
            }
        }

        console.log(`[VapiService] Returning ${results.length} tool results`);
        return { results };
    }

    /**
     * Handle status update events
     */
    private async handleStatusUpdate(call: any) {
        if (!call?.id) return;

        // Log the event
        await vapiEventLogger.logStatusUpdate({
            vapi_call_id: call.id,
            conversation_id: call.metadata?.conversationId,
            status: call.status,
            raw_data: call
        });

        // Update database
        await supabase.from('voice_calls').update({
            status: call.status,
            started_at: call.startedAt,
            ended_at: call.endedAt
        }).eq('vapi_call_id', call.id);
    }

    /**
     * Handle real-time transcript events
     */
    private async handleTranscript(message: any) {
        const call = message.call;
        if (!call?.id) return;

        // Extract transcript data
        const role = message.role; // 'assistant' or 'user'
        const transcript = message.transcript;
        const isFinal = message.transcriptType === 'final';

        console.log(`[VapiService] Transcript (${isFinal ? 'final' : 'partial'}): [${role}] ${transcript?.substring(0, 50)}...`);

        // Log to events table for realtime sync
        await vapiEventLogger.logTranscript({
            vapi_call_id: call.id,
            conversation_id: call.metadata?.conversationId,
            speaker: role === 'assistant' ? 'assistant' : 'user',
            text: transcript || '',
            is_final: isFinal,
            seconds_from_start: message.timestamp ? (message.timestamp - call.startedAt) / 1000 : undefined,
            raw_data: message
        });
    }

    /**
     * Handle user interruption events
     */
    private async handleUserInterrupted(message: any) {
        const call = message.call;
        if (!call?.id) return;

        console.log(`[VapiService] User interrupted assistant`);

        await vapiEventLogger.logEvent({
            vapi_call_id: call.id,
            conversation_id: call.metadata?.conversationId,
            event_type: 'user-interrupted',
            event_data: message
        });

        // Update interruption count using raw SQL increment
        try {
            const { data: currentCall } = await supabase
                .from('voice_calls')
                .select('interruption_count')
                .eq('vapi_call_id', call.id)
                .single();

            await supabase
                .from('voice_calls')
                .update({ interruption_count: (currentCall?.interruption_count || 0) + 1 })
                .eq('vapi_call_id', call.id);
        } catch (e) {
            console.error('[VapiService] Error updating interruption count:', e);
        }
    }

    /**
     * Handle hang/delay events (latency warnings)
     */
    private async handleHang(message: any) {
        const call = message.call;
        if (!call?.id) return;

        console.warn(`[VapiService] Hang/delay detected in call ${call.id}`);

        await vapiEventLogger.logEvent({
            vapi_call_id: call.id,
            conversation_id: call.metadata?.conversationId,
            event_type: 'hang',
            event_data: {
                duration: message.duration,
                reason: message.reason,
                ...message
            }
        });
    }

    /**
     * Sync completed call to CRM conversation
     */
    private async handleEndOfCall(message: any) {
        const call = message.call;
        const report = message;

        // Log end of call report
        await vapiEventLogger.logEndOfCallReport({
            vapi_call_id: call.id,
            conversation_id: call.metadata?.conversationId,
            transcript: report.transcript || '',
            summary: report.summary || '',
            duration_seconds: report.durationSeconds || 0,
            ended_reason: report.endedReason || 'unknown',
            messages: report.messages || [],
            cost: report.cost,
            analysis: report.analysis
        });

        // Get voice call to find conversation
        const { data: voiceCall } = await supabase
            .from('voice_calls')
            .select('conversation_id')
            .eq('vapi_call_id', call.id)
            .single();

        // Create CRM message with call summary
        if (voiceCall?.conversation_id) {
            await supabase.from('crm_messages').insert({
                conversation_id: voiceCall.conversation_id,
                direction: 'inbound',
                role: 'system',
                message_type: 'call_summary',
                content: `📞 **Llamada finalizada** (${Math.round(report.durationSeconds || 0)}s)\n\n**Resumen:** ${report.summary || 'N/A'}\n\n**Razón:** ${report.endedReason}\n\n[🎧 Escuchar Grabación](${report.recordingUrl})`,
                status: 'delivered',
                raw_payload: report
            });
        }
    }
}
