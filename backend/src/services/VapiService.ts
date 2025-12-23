import axios from 'axios';
import { supabase } from '../config/supabase';
import { normalizePhone } from '../utils/phoneUtils';

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = 'https://api.vapi.ai';

const vapiApi = axios.create({
    baseURL: VAPI_BASE_URL,
    headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
    }
});

export class VapiService {

    /**
     * Initiate outbound call to customer
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

        console.log(`[VapiService] Initiating call to ${normalizedPhone} (Conv: ${params.conversationId})`);

        const response = await vapiApi.post('/call', {
            phoneNumberId: process.env.VAPI_PHONE_NUMBER_ID,
            customer: {
                number: normalizedPhone,
                name: params.customerName
            },
            assistantId: params.assistantId || process.env.VAPI_DEFAULT_ASSISTANT_ID,
            metadata: {
                conversationId: params.conversationId,
                ...params.metadata
            }
        });

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
     * Dynamic assistant selection for inbound calls
     */
    private async handleAssistantRequest(call: any) {
        // Look up by phone number → channel chip → column → assistant
        const phoneNumber = call.customer?.number;
        console.log(`[VapiService] Assistant Request for ${phoneNumber}`);

        if (phoneNumber) {
            // Try to finding matching chip by phone (account_reference) or other logic
            // This logic assumes we have chips mapped to phone numbers for INBOUND routing
            // For now, simpler logic: check if client exists and has a preferred agent?

            // Simpler V1: Check if there's an active conversation for this number and use its column's assistant
            // Normalized search
            // ...
        }

        // Default fallback
        return { assistantId: process.env.VAPI_DEFAULT_ASSISTANT_ID };
    }

    /**
     * Execute tool calls (CRM lookups, COA queries, etc.)
     */
    private async handleToolCalls(message: any) {
        const results = [];

        for (const toolCall of message.toolWithToolCallList || []) {
            let result;
            console.log(`[VapiService] Executing Tool: ${toolCall.function?.name}`);

            try {
                const args = typeof toolCall.function?.arguments === 'string'
                    ? JSON.parse(toolCall.function.arguments)
                    : toolCall.function?.arguments;

                switch (toolCall.function?.name) {
                    case 'lookup_client':
                        result = await this.lookupClient(args);
                        break;
                    case 'get_coa_status':
                        // start placeholder
                        result = { status: 'found', batch: args.batch_number, url: 'https://example.com/coa.pdf' };
                        break;
                    case 'escalate_to_human':
                        result = { escalated: true, message: 'Agent notified' };
                        break;
                    default:
                        result = { error: 'Unknown tool' };
                }
            } catch (e: any) {
                result = { error: e.message };
            }

            results.push({
                toolCallId: toolCall.id,
                result: JSON.stringify(result) // Vapi expects a stringified result often, depending on doc version. 
                // Vapi docs say: "result": "..." (string) usually.
            });
        }

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

    // Helper functions
    private async lookupClient(args: { phone?: string; email?: string }) {
        const query = supabase.from('clients').select('*');
        if (args.phone) query.ilike('phone', `%${normalizePhone(args.phone, 'whapi').slice(-10)}%`); // Fuzzy match using last 10
        if (args.email) query.eq('email', args.email);
        const { data } = await query.maybeSingle();
        return data || { found: false };
    }
}
