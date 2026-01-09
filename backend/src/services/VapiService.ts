import axios from 'axios';
import { supabase } from '../config/supabase';
import { normalizePhone } from '../utils/phoneUtils';
import { vapiContextService } from './VapiContextService';
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
                    await this.updateCallStatus(call);
                    break;

                case 'end-of-call-report':
                    await this.handleEndOfCall(message);
                    break;

                case 'transcript':
                    // Optional: real-time transcript updates
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

            try {
                const args = typeof functionArgs === 'string'
                    ? JSON.parse(functionArgs)
                    : functionArgs || {};

                console.log(`[VapiService] Tool args:`, args);
                console.log(`[VapiService] Context:`, context);

                // Use centralized tool handler
                const result = await handleToolCall(functionName, args, context);

                console.log(`[VapiService] Tool result:`, result);

                // CRITICAL: Result must be a single-line string with no line breaks
                // Line breaks cause VAPI to fail parsing and return "No result returned"
                const resultString = JSON.stringify(result).replace(/\n/g, ' ').replace(/\r/g, '');

                results.push({
                    toolCallId: toolCallId,
                    result: resultString
                });
            } catch (e: any) {
                console.error(`[VapiService] Tool error for ${functionName}:`, e.message, e.stack);
                results.push({
                    toolCallId: toolCallId,
                    error: e.message.replace(/\n/g, ' ')
                });
            }
        }

        console.log(`[VapiService] Returning ${results.length} tool results`);
        return { results };
    }

    private async updateCallStatus(call: any) {
        if (!call?.id) return;
        await supabase.from('voice_calls').update({
            status: call.status,
            started_at: call.startedAt,
            ended_at: call.endedAt
        }).eq('vapi_call_id', call.id);
    }

    /**
     * Sync completed call to CRM conversation
     */
    private async handleEndOfCall(report: any) {
        const call = report.call;

        // Update voice_calls record
        await supabase.from('voice_calls').update({
            status: 'ended',
            ended_at: new Date().toISOString(),
            duration_seconds: report.durationSeconds,
            transcript: report.transcript,
            summary: report.summary,
            recording_url: report.recordingUrl,
            ended_reason: report.endedReason
        }).eq('vapi_call_id', call.id);

        // Create CRM message with call summary
        const { data: voiceCall } = await supabase
            .from('voice_calls')
            .select('conversation_id')
            .eq('vapi_call_id', call.id)
            .single();

        if (voiceCall?.conversation_id) {
            await supabase.from('crm_messages').insert({
                conversation_id: voiceCall.conversation_id,
                direction: 'inbound',
                role: 'system',
                message_type: 'text', // Using text for now, or 'call_summary' if frontend supports it
                content: `📞 **Llamada finalizada** (${Math.round(report.durationSeconds || 0)}s)\n\n**Resumen:** ${report.summary || 'N/A'}\n\n**Razón:** ${report.endedReason}\n\n[🎧 Escuchar Grabación](${report.recordingUrl})`,
                status: 'delivered',
                raw_payload: report
            });
        }
    }
}
