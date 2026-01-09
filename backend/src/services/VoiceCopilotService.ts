/**
 * VoiceCopilotService - Real-time AI assistant for VAPI voice calls
 *
 * This service monitors voice calls in real-time and can:
 * 1. Detect when tools should be called but weren't
 * 2. Execute compensatory actions (send WhatsApp, search products)
 * 3. Track customer sentiment and suggest escalation
 * 4. Inject additional context mid-call
 * 5. Learn from call patterns to improve future calls
 *
 * Architecture:
 * - Receives transcript events from VapiService
 * - Maintains call state in memory (with DB persistence)
 * - Uses Claude to analyze conversation and decide interventions
 * - Can execute tools directly or queue suggestions
 */

import Anthropic from '@anthropic-ai/sdk';
import { supabase } from '../config/supabase';
import { handleToolCall } from './VapiToolHandlers';
import { vapiEventLogger } from './VapiEventLogger';

// Initialize Anthropic client
const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
});

// Types
interface TranscriptEntry {
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: number;
    isFinal: boolean;
}

interface PendingAction {
    type: 'send_whatsapp' | 'search_products' | 'escalate' | 'inject_context';
    priority: 'critical' | 'high' | 'medium' | 'low';
    params: Record<string, any>;
    reason: string;
    detectedAt: number;
    executedAt?: number;
}

interface CallState {
    callId: string;
    conversationId?: string;
    clientId?: string;
    customerPhone?: string;
    customerName?: string;

    // Transcript accumulator
    transcripts: TranscriptEntry[];
    fullTranscript: string;

    // Tool tracking
    toolsCalled: string[];
    toolsExpected: string[];
    toolsMissed: string[];

    // Sentiment tracking
    sentimentScore: number; // -1 to 1
    sentimentHistory: number[];
    frustrationIndicators: string[];

    // Pending actions queue
    pendingActions: PendingAction[];
    executedActions: PendingAction[];

    // State flags
    isActive: boolean;
    needsEscalation: boolean;
    lastAnalysisAt: number;
    analysisCount: number;

    // Timing
    startedAt: number;
    lastActivityAt: number;
}

// In-memory call state store
const activeCallStates = new Map<string, CallState>();

// Analysis configuration
const ANALYSIS_INTERVAL_MS = 5000; // Analyze every 5 seconds of new content
const MIN_TRANSCRIPT_LENGTH = 50; // Minimum chars before first analysis
const FRUSTRATION_THRESHOLD = -0.5; // Sentiment below this triggers escalation suggestion

/**
 * Copilot system prompt for analyzing calls
 */
const COPILOT_SYSTEM_PROMPT = `Eres un copiloto de IA que monitorea llamadas de voz en tiempo real para el asistente "Ara" de Extractos EUM.

Tu trabajo es:
1. Detectar cuando Ara debió usar una herramienta pero no lo hizo
2. Identificar frustración del cliente
3. Sugerir acciones correctivas

HERRAMIENTAS DISPONIBLES que Ara puede/debe usar:
- search_products: Buscar productos (gomitas, tinturas, etc.)
- send_whatsapp: Enviar info por WhatsApp (CRÍTICO cuando cliente lo pide)
- get_coa: Buscar Certificados de Análisis
- lookup_order: Consultar pedidos
- escalate_to_human: Escalar a supervisor

SEÑALES DE QUE FALTA UNA ACCIÓN:
- Cliente dice "mándame por WhatsApp" pero no hay tool call de send_whatsapp
- Cliente pide información de productos pero búsqueda falló o no se hizo
- Cliente menciona pedido pero no se consultó lookup_order
- Cliente muy frustrado pero no se ofreció escalate_to_human

INDICADORES DE FRUSTRACIÓN:
- Repetir la misma pregunta múltiples veces
- Tono impaciente: "ya te dije", "¿me escuchaste?", "no me ayudas"
- Amenaza de colgar o irse
- Quejas sobre el servicio

Responde SOLO en JSON con este formato:
{
  "sentiment": <número de -1 (muy frustrado) a 1 (muy satisfecho)>,
  "frustrationIndicators": ["indicador1", "indicador2"],
  "missedActions": [
    {
      "type": "send_whatsapp|search_products|escalate|inject_context",
      "priority": "critical|high|medium|low",
      "reason": "explicación corta",
      "params": { /* parámetros para ejecutar */ }
    }
  ],
  "shouldEscalate": <boolean>,
  "escalationReason": "razón si shouldEscalate es true",
  "summary": "resumen de 1 línea del estado de la llamada"
}`;

/**
 * Voice Copilot Service
 */
class VoiceCopilotService {

    /**
     * Initialize tracking for a new call
     */
    initializeCall(params: {
        callId: string;
        conversationId?: string;
        clientId?: string;
        customerPhone?: string;
        customerName?: string;
    }): CallState {
        const state: CallState = {
            callId: params.callId,
            conversationId: params.conversationId,
            clientId: params.clientId,
            customerPhone: params.customerPhone,
            customerName: params.customerName,

            transcripts: [],
            fullTranscript: '',

            toolsCalled: [],
            toolsExpected: [],
            toolsMissed: [],

            sentimentScore: 0,
            sentimentHistory: [],
            frustrationIndicators: [],

            pendingActions: [],
            executedActions: [],

            isActive: true,
            needsEscalation: false,
            lastAnalysisAt: 0,
            analysisCount: 0,

            startedAt: Date.now(),
            lastActivityAt: Date.now()
        };

        activeCallStates.set(params.callId, state);
        console.log(`[VoiceCopilot] Initialized tracking for call ${params.callId}`);

        return state;
    }

    /**
     * Process incoming transcript event
     */
    async processTranscript(params: {
        callId: string;
        role: 'user' | 'assistant';
        content: string;
        isFinal: boolean;
        metadata?: Record<string, any>;
    }): Promise<void> {
        let state = activeCallStates.get(params.callId);

        // Auto-initialize if not exists
        if (!state) {
            state = this.initializeCall({
                callId: params.callId,
                conversationId: params.metadata?.conversationId,
                clientId: params.metadata?.clientId,
                customerPhone: params.metadata?.customerPhone
            });
        }

        // Add transcript entry
        const entry: TranscriptEntry = {
            role: params.role,
            content: params.content,
            timestamp: Date.now(),
            isFinal: params.isFinal
        };

        state.transcripts.push(entry);
        state.lastActivityAt = Date.now();

        // Update full transcript (only final transcripts)
        if (params.isFinal) {
            const speaker = params.role === 'assistant' ? 'Ara' : 'Cliente';
            state.fullTranscript += `\n${speaker}: ${params.content}`;
        }

        // Check if we should analyze
        const timeSinceLastAnalysis = Date.now() - state.lastAnalysisAt;
        const hasEnoughContent = state.fullTranscript.length >= MIN_TRANSCRIPT_LENGTH;

        if (hasEnoughContent && timeSinceLastAnalysis >= ANALYSIS_INTERVAL_MS && params.isFinal) {
            // Run analysis in background (don't block webhook response)
            this.analyzeCallState(state).catch(err => {
                console.error(`[VoiceCopilot] Analysis error for ${params.callId}:`, err.message);
            });
        }
    }

    /**
     * Record that a tool was called
     */
    recordToolCall(callId: string, toolName: string): void {
        const state = activeCallStates.get(callId);
        if (state) {
            state.toolsCalled.push(toolName);
            state.lastActivityAt = Date.now();

            // Remove from missed if it was there
            state.toolsMissed = state.toolsMissed.filter(t => t !== toolName);

            console.log(`[VoiceCopilot] Recorded tool call: ${toolName} for call ${callId}`);
        }
    }

    /**
     * Analyze call state with Claude
     */
    private async analyzeCallState(state: CallState): Promise<void> {
        if (!state.isActive) return;

        state.lastAnalysisAt = Date.now();
        state.analysisCount++;

        console.log(`[VoiceCopilot] Analyzing call ${state.callId} (analysis #${state.analysisCount})`);

        try {
            const analysisPrompt = `
TRANSCRIPCIÓN DE LA LLAMADA:
${state.fullTranscript}

HERRAMIENTAS YA USADAS:
${state.toolsCalled.length > 0 ? state.toolsCalled.join(', ') : 'Ninguna'}

CONTEXTO:
- Cliente: ${state.customerName || 'Desconocido'}
- Teléfono: ${state.customerPhone || 'Desconocido'}
- Duración: ${Math.round((Date.now() - state.startedAt) / 1000)}s

Analiza la llamada y detecta acciones faltantes o problemas.`;

            const response = await anthropic.messages.create({
                model: 'claude-3-5-haiku-20241022',
                max_tokens: 1024,
                system: COPILOT_SYSTEM_PROMPT,
                messages: [
                    { role: 'user', content: analysisPrompt }
                ]
            });

            // Parse response
            const content = response.content[0];
            if (content.type !== 'text') return;

            let analysis: any;
            try {
                // Extract JSON from response (handle markdown code blocks)
                let jsonStr = content.text;
                const jsonMatch = jsonStr.match(/```json\s*([\s\S]*?)\s*```/) || jsonStr.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    jsonStr = jsonMatch[1] || jsonMatch[0];
                }
                analysis = JSON.parse(jsonStr);
            } catch (e) {
                console.error(`[VoiceCopilot] Failed to parse analysis JSON:`, content.text.substring(0, 200));
                return;
            }

            // Update state with analysis results
            state.sentimentScore = analysis.sentiment || 0;
            state.sentimentHistory.push(state.sentimentScore);
            state.frustrationIndicators = analysis.frustrationIndicators || [];
            state.needsEscalation = analysis.shouldEscalate || false;

            // Process missed actions
            if (analysis.missedActions && analysis.missedActions.length > 0) {
                for (const action of analysis.missedActions) {
                    // Check if we haven't already queued this action
                    const alreadyQueued = state.pendingActions.some(
                        a => a.type === action.type && JSON.stringify(a.params) === JSON.stringify(action.params)
                    );

                    if (!alreadyQueued) {
                        const pendingAction: PendingAction = {
                            type: action.type,
                            priority: action.priority,
                            params: action.params || {},
                            reason: action.reason,
                            detectedAt: Date.now()
                        };

                        state.pendingActions.push(pendingAction);
                        state.toolsMissed.push(action.type);

                        console.log(`[VoiceCopilot] Detected missed action: ${action.type} (${action.priority}) - ${action.reason}`);

                        // Execute critical actions immediately
                        if (action.priority === 'critical') {
                            await this.executeAction(state, pendingAction);
                        }
                    }
                }
            }

            // Log analysis to database
            await this.logAnalysis(state, analysis);

            console.log(`[VoiceCopilot] Analysis complete: sentiment=${analysis.sentiment}, missed=${analysis.missedActions?.length || 0}, escalate=${analysis.shouldEscalate}`);

        } catch (error: any) {
            console.error(`[VoiceCopilot] Analysis error:`, error.message);
        }
    }

    /**
     * Execute a pending action
     */
    private async executeAction(state: CallState, action: PendingAction): Promise<void> {
        console.log(`[VoiceCopilot] Executing action: ${action.type}`);

        try {
            const context = {
                conversationId: state.conversationId,
                clientId: state.clientId,
                customerPhone: state.customerPhone
            };

            switch (action.type) {
                case 'send_whatsapp':
                    if (state.customerPhone && action.params.message) {
                        const result = await handleToolCall('send_whatsapp', {
                            message: action.params.message,
                            media_url: action.params.media_url
                        }, context);

                        console.log(`[VoiceCopilot] WhatsApp sent: ${result.success}`);
                    }
                    break;

                case 'search_products':
                    if (action.params.query) {
                        const result = await handleToolCall('search_products', {
                            query: action.params.query,
                            category: action.params.category
                        }, context);

                        // Store result for potential injection
                        action.params.searchResult = result;
                        console.log(`[VoiceCopilot] Product search executed: ${result.success}`);
                    }
                    break;

                case 'escalate':
                    // Log escalation need - actual escalation happens through normal flow
                    await vapiEventLogger.logEvent({
                        vapi_call_id: state.callId,
                        conversation_id: state.conversationId,
                        event_type: 'copilot-escalation-suggested',
                        event_data: {
                            reason: action.reason,
                            sentiment: state.sentimentScore,
                            frustrationIndicators: state.frustrationIndicators
                        }
                    });
                    break;
            }

            action.executedAt = Date.now();
            state.executedActions.push(action);
            state.pendingActions = state.pendingActions.filter(a => a !== action);

        } catch (error: any) {
            console.error(`[VoiceCopilot] Action execution error:`, error.message);
        }
    }

    /**
     * Log analysis results to database
     */
    private async logAnalysis(state: CallState, analysis: any): Promise<void> {
        try {
            await supabase.from('vapi_call_events').insert({
                vapi_call_id: state.callId,
                conversation_id: state.conversationId,
                event_type: 'copilot-analysis',
                event_data: {
                    analysisNumber: state.analysisCount,
                    sentiment: analysis.sentiment,
                    frustrationIndicators: analysis.frustrationIndicators,
                    missedActions: analysis.missedActions,
                    shouldEscalate: analysis.shouldEscalate,
                    escalationReason: analysis.escalationReason,
                    summary: analysis.summary,
                    toolsCalled: state.toolsCalled,
                    callDurationSeconds: Math.round((Date.now() - state.startedAt) / 1000)
                }
            });
        } catch (error: any) {
            console.error(`[VoiceCopilot] Failed to log analysis:`, error.message);
        }
    }

    /**
     * End call tracking and generate final report
     */
    async endCall(callId: string): Promise<{
        summary: string;
        sentiment: number;
        actionsExecuted: number;
        actionsMissed: number;
        recommendations: string[];
    } | null> {
        const state = activeCallStates.get(callId);
        if (!state) return null;

        state.isActive = false;

        console.log(`[VoiceCopilot] Ending tracking for call ${callId}`);

        // Execute any remaining high-priority actions
        for (const action of state.pendingActions) {
            if (action.priority === 'critical' || action.priority === 'high') {
                await this.executeAction(state, action);
            }
        }

        // Generate final report
        const report = {
            summary: `Call tracked for ${Math.round((Date.now() - state.startedAt) / 1000)}s with ${state.analysisCount} analyses`,
            sentiment: state.sentimentScore,
            actionsExecuted: state.executedActions.length,
            actionsMissed: state.toolsMissed.length,
            recommendations: [] as string[]
        };

        // Add recommendations based on call analysis
        if (state.sentimentScore < FRUSTRATION_THRESHOLD) {
            report.recommendations.push('Cliente mostró alta frustración - considerar follow-up proactivo');
        }
        if (state.toolsMissed.includes('send_whatsapp')) {
            report.recommendations.push('WhatsApp no enviado cuando se solicitó - revisar prompt del asistente');
        }
        if (state.toolsMissed.includes('search_products')) {
            report.recommendations.push('Búsqueda de productos fallida - revisar mappings de términos');
        }

        // Log final report
        await supabase.from('vapi_call_events').insert({
            vapi_call_id: callId,
            conversation_id: state.conversationId,
            event_type: 'copilot-final-report',
            event_data: {
                ...report,
                fullTranscriptLength: state.fullTranscript.length,
                totalToolsCalled: state.toolsCalled,
                totalToolsMissed: state.toolsMissed,
                sentimentHistory: state.sentimentHistory,
                frustrationIndicators: state.frustrationIndicators,
                executedActions: state.executedActions.map(a => ({
                    type: a.type,
                    reason: a.reason,
                    executedAt: a.executedAt
                }))
            }
        });

        // Clean up
        activeCallStates.delete(callId);

        return report;
    }

    /**
     * Get current state for a call (for debugging/monitoring)
     */
    getCallState(callId: string): CallState | undefined {
        return activeCallStates.get(callId);
    }

    /**
     * Get all active calls
     */
    getActiveCalls(): string[] {
        return Array.from(activeCallStates.keys());
    }
}

// Export singleton instance
export const voiceCopilotService = new VoiceCopilotService();
