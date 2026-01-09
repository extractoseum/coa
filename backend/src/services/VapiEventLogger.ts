/**
 * VapiEventLogger - Centralized logging service for VAPI voice calls
 *
 * Handles:
 * - Real-time event logging to vapi_call_events
 * - Tool call logging to vapi_tool_logs
 * - Search mapping updates
 * - Performance metrics
 *
 * Uses buffered writes for performance, with immediate flush for critical events
 */

import { supabase } from '../config/supabase';

// Types
interface CallEvent {
    vapi_call_id: string;
    conversation_id?: string;
    event_type: string;
    event_subtype?: string;
    event_data: Record<string, any>;
    speaker?: 'assistant' | 'user' | 'system';
    transcript_text?: string;
    is_final?: boolean;
    tool_name?: string;
    tool_call_id?: string;
    seconds_from_start?: number;
}

interface ToolLog {
    vapi_call_id: string;
    conversation_id?: string;
    client_id?: string;
    tool_name: string;
    tool_call_id?: string;
    arguments: Record<string, any>;
    arguments_raw?: string;
    success: boolean;
    result?: Record<string, any>;
    result_message?: string;
    error_message?: string;
    error_stack?: string;
    duration_ms?: number;
    customer_phone?: string;
    call_seconds_elapsed?: number;
}

interface SearchMappingUpdate {
    search_term: string;
    was_successful: boolean;
}

class VapiEventLogger {
    private eventBuffer: CallEvent[] = [];
    private toolLogBuffer: ToolLog[] = [];
    private flushInterval: NodeJS.Timeout | null = null;
    private readonly BUFFER_SIZE = 10;
    private readonly FLUSH_INTERVAL_MS = 5000; // 5 seconds

    constructor() {
        // Start auto-flush interval
        this.startAutoFlush();
    }

    /**
     * Start periodic buffer flush
     */
    private startAutoFlush(): void {
        if (this.flushInterval) return;

        this.flushInterval = setInterval(() => {
            this.flushAll();
        }, this.FLUSH_INTERVAL_MS);
    }

    /**
     * Stop auto-flush (for cleanup)
     */
    public stopAutoFlush(): void {
        if (this.flushInterval) {
            clearInterval(this.flushInterval);
            this.flushInterval = null;
        }
    }

    /**
     * Log a call event (transcript, status, etc.)
     */
    async logEvent(event: CallEvent): Promise<void> {
        this.eventBuffer.push({
            ...event,
            event_data: event.event_data || {}
        });

        // Immediate flush for important events
        const immediateFlushTypes = ['status-update', 'end-of-call-report', 'error'];
        if (immediateFlushTypes.includes(event.event_type) || this.eventBuffer.length >= this.BUFFER_SIZE) {
            await this.flushEvents();
        }
    }

    /**
     * Log a transcript event (convenience method)
     */
    async logTranscript(params: {
        vapi_call_id: string;
        conversation_id?: string;
        speaker: 'assistant' | 'user';
        text: string;
        is_final: boolean;
        seconds_from_start?: number;
        raw_data?: Record<string, any>;
    }): Promise<void> {
        await this.logEvent({
            vapi_call_id: params.vapi_call_id,
            conversation_id: params.conversation_id,
            event_type: 'transcript',
            event_subtype: params.is_final ? 'final' : 'partial',
            event_data: params.raw_data || {},
            speaker: params.speaker,
            transcript_text: params.text,
            is_final: params.is_final,
            seconds_from_start: params.seconds_from_start
        });
    }

    /**
     * Log a status update event
     */
    async logStatusUpdate(params: {
        vapi_call_id: string;
        conversation_id?: string;
        status: string;
        raw_data?: Record<string, any>;
    }): Promise<void> {
        await this.logEvent({
            vapi_call_id: params.vapi_call_id,
            conversation_id: params.conversation_id,
            event_type: 'status-update',
            event_subtype: params.status,
            event_data: params.raw_data || {}
        });
    }

    /**
     * Log a tool call with its result
     */
    async logToolCall(log: ToolLog): Promise<string | null> {
        const startTime = Date.now();

        try {
            // Insert directly (tools are important, no buffering)
            const { data, error } = await supabase
                .from('vapi_tool_logs')
                .insert({
                    vapi_call_id: log.vapi_call_id,
                    conversation_id: log.conversation_id,
                    client_id: log.client_id,
                    tool_name: log.tool_name,
                    tool_call_id: log.tool_call_id,
                    arguments: log.arguments,
                    arguments_raw: log.arguments_raw,
                    success: log.success,
                    result: log.result,
                    result_message: log.result_message,
                    error_message: log.error_message,
                    error_stack: log.error_stack,
                    duration_ms: log.duration_ms,
                    customer_phone: log.customer_phone,
                    call_seconds_elapsed: log.call_seconds_elapsed,
                    started_at: new Date().toISOString(),
                    completed_at: new Date().toISOString()
                })
                .select('id')
                .single();

            if (error) {
                console.error('[VapiEventLogger] Error logging tool call:', error.message);
                return null;
            }

            console.log(`[VapiEventLogger] Tool logged: ${log.tool_name} (${log.success ? 'success' : 'failed'}) in ${Date.now() - startTime}ms`);
            return data?.id || null;

        } catch (e: any) {
            console.error('[VapiEventLogger] Exception logging tool:', e.message);
            return null;
        }
    }

    /**
     * Log tool call start (before execution)
     * Returns a function to call when tool completes
     */
    logToolStart(params: {
        vapi_call_id: string;
        conversation_id?: string;
        client_id?: string;
        tool_name: string;
        tool_call_id?: string;
        arguments: Record<string, any>;
        arguments_raw?: string;
        customer_phone?: string;
        call_seconds_elapsed?: number;
    }): (result: { success: boolean; result?: any; error?: string }) => Promise<string | null> {
        const startTime = Date.now();

        return async (outcome) => {
            const duration_ms = Date.now() - startTime;

            return this.logToolCall({
                ...params,
                success: outcome.success,
                result: typeof outcome.result === 'object' ? outcome.result : { value: outcome.result },
                result_message: outcome.result?.message,
                error_message: outcome.error,
                duration_ms
            });
        };
    }

    /**
     * Update search mapping statistics
     */
    async updateSearchMappingStats(update: SearchMappingUpdate): Promise<void> {
        try {
            // Call the database function
            await supabase.rpc('update_mapping_stats', {
                p_search_term: update.search_term,
                p_was_successful: update.was_successful
            });

            console.log(`[VapiEventLogger] Updated mapping stats for "${update.search_term}" (success: ${update.was_successful})`);
        } catch (e: any) {
            console.error('[VapiEventLogger] Error updating mapping stats:', e.message);
        }
    }

    /**
     * Get active search mappings from database
     */
    async getSearchMappings(): Promise<Record<string, string[]>> {
        try {
            const { data, error } = await supabase
                .from('active_search_mappings')
                .select('search_term, mapped_terms');

            if (error) {
                console.error('[VapiEventLogger] Error fetching mappings:', error.message);
                return {};
            }

            // Convert to lookup object
            const mappings: Record<string, string[]> = {};
            for (const row of data || []) {
                mappings[row.search_term.toLowerCase()] = row.mapped_terms;
            }

            console.log(`[VapiEventLogger] Loaded ${Object.keys(mappings).length} search mappings`);
            return mappings;

        } catch (e: any) {
            console.error('[VapiEventLogger] Exception fetching mappings:', e.message);
            return {};
        }
    }

    /**
     * Create a new learned mapping
     */
    async createLearnedMapping(params: {
        search_term: string;
        mapped_terms: string[];
        call_id: string;
        tool_log_id?: string;
    }): Promise<string | null> {
        try {
            const { data, error } = await supabase.rpc('create_learned_mapping', {
                p_search_term: params.search_term,
                p_mapped_terms: params.mapped_terms,
                p_call_id: params.call_id,
                p_tool_log_id: params.tool_log_id
            });

            if (error) {
                console.error('[VapiEventLogger] Error creating mapping:', error.message);
                return null;
            }

            console.log(`[VapiEventLogger] Created learned mapping for "${params.search_term}"`);
            return data;

        } catch (e: any) {
            console.error('[VapiEventLogger] Exception creating mapping:', e.message);
            return null;
        }
    }

    /**
     * Flush event buffer to database
     */
    private async flushEvents(): Promise<void> {
        if (this.eventBuffer.length === 0) return;

        const events = [...this.eventBuffer];
        this.eventBuffer = [];

        try {
            const { error } = await supabase
                .from('vapi_call_events')
                .insert(events.map(e => ({
                    vapi_call_id: e.vapi_call_id,
                    conversation_id: e.conversation_id,
                    event_type: e.event_type,
                    event_subtype: e.event_subtype,
                    event_data: e.event_data,
                    speaker: e.speaker,
                    transcript_text: e.transcript_text,
                    is_final: e.is_final,
                    tool_name: e.tool_name,
                    tool_call_id: e.tool_call_id,
                    seconds_from_start: e.seconds_from_start,
                    event_time: new Date().toISOString()
                })));

            if (error) {
                console.error('[VapiEventLogger] Error flushing events:', error.message);
                // Put events back in buffer for retry
                this.eventBuffer = [...events, ...this.eventBuffer];
            } else {
                console.log(`[VapiEventLogger] Flushed ${events.length} events`);
            }
        } catch (e: any) {
            console.error('[VapiEventLogger] Exception flushing events:', e.message);
            this.eventBuffer = [...events, ...this.eventBuffer];
        }
    }

    /**
     * Flush all buffers
     */
    async flushAll(): Promise<void> {
        await this.flushEvents();
    }

    /**
     * Log end of call report with full analysis
     */
    async logEndOfCallReport(params: {
        vapi_call_id: string;
        conversation_id?: string;
        transcript: string;
        summary: string;
        duration_seconds: number;
        ended_reason: string;
        messages: any[];
        cost?: number;
        analysis?: any;
    }): Promise<void> {
        // Log the event
        await this.logEvent({
            vapi_call_id: params.vapi_call_id,
            conversation_id: params.conversation_id,
            event_type: 'end-of-call-report',
            event_data: {
                summary: params.summary,
                duration_seconds: params.duration_seconds,
                ended_reason: params.ended_reason,
                message_count: params.messages?.length || 0,
                cost: params.cost,
                analysis: params.analysis
            }
        });

        // Update voice_calls with final data
        try {
            await supabase
                .from('voice_calls')
                .update({
                    status: 'ended',
                    ended_at: new Date().toISOString(),
                    duration_seconds: params.duration_seconds,
                    transcript: params.transcript,
                    summary: params.summary,
                    ended_reason: params.ended_reason,
                    cost: params.cost,
                    messages_json: params.messages
                })
                .eq('vapi_call_id', params.vapi_call_id);

            console.log(`[VapiEventLogger] Updated voice_calls for ${params.vapi_call_id}`);
        } catch (e: any) {
            console.error('[VapiEventLogger] Error updating voice_calls:', e.message);
        }
    }

    /**
     * Get tool performance metrics
     */
    async getToolPerformance(): Promise<any[]> {
        try {
            const { data, error } = await supabase
                .from('vapi_tool_performance')
                .select('*');

            if (error) {
                console.error('[VapiEventLogger] Error fetching tool performance:', error.message);
                return [];
            }

            return data || [];
        } catch (e: any) {
            console.error('[VapiEventLogger] Exception fetching tool performance:', e.message);
            return [];
        }
    }

    /**
     * Get recent tool failures for analysis
     */
    async getRecentFailures(limit: number = 50): Promise<any[]> {
        try {
            const { data, error } = await supabase
                .from('vapi_tool_failures')
                .select('*')
                .limit(limit);

            if (error) {
                console.error('[VapiEventLogger] Error fetching failures:', error.message);
                return [];
            }

            return data || [];
        } catch (e: any) {
            console.error('[VapiEventLogger] Exception fetching failures:', e.message);
            return [];
        }
    }
}

// Export singleton instance
export const vapiEventLogger = new VapiEventLogger();

// Export class for testing
export { VapiEventLogger };
