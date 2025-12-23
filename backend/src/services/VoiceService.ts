import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { ModelRouter } from './ModelRouter';
import { ElevenLabsService } from './ElevenLabsService';

// Placeholder for logger if not found
const logger = {
    info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta),
    warn: (msg: string, meta?: any) => console.warn(`[WARN] ${msg}`, meta),
    error: (msg: string, meta?: any) => console.error(`[ERROR] ${msg}`, meta),
};

const getTraceId = () => `trace-${Date.now()}-${Math.random().toString(36).substring(7)}`;

// Risk keywords para detección determinística (híbrido)
const RISK_KEYWORDS = {
    legal: ['profeco', 'cofepris', 'demanda', 'fraude', 'abogado', 'denuncia'],
    financial: ['reembolso', 'devolucion', 'cancelar', 'factura', 'sat'],
    identity: ['ine', 'curp', 'rfc', 'pasaporte'],
    churn: ['competencia', 'otro proveedor', 'mejor precio', 'no funciona'],
    urgency: ['urgente', 'inmediato', 'ahora mismo', 'emergencia']
};

export interface VoiceAnalysisResult {
    transcript: string;
    transcriptConfidence: number;
    language: string;
    summary: string;
    intent: string;
    intentConfidence: number;
    emotionTextPrimary: string; // From Text Analysis
    emotionTextScore: number;
    emotionFusionPrimary: string;
    emotionFusionScore: number;
    sentimentScore: number;
    evidenceQuotes: string[];
    confidenceReason: string;
    riskFlagsDeterministic: string[];
    riskFlagsLLM: string[];
    riskFlagsCombined: string[];
    predictedAction: string;
    shouldEscalate: boolean;
    escalationReason?: string;
}

interface VoiceProfileConfig {
    provider: 'openai' | 'elevenlabs';
    voice_id: string; // 'nova', '21m00...', etc.
    settings?: any; // stability, similarity, etc.
}

export class VoiceService {
    private openai: OpenAI;
    private router: ModelRouter;
    private supabase: any;
    private elevenLabs: ElevenLabsService;

    constructor() {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.router = new ModelRouter();
        this.supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        this.elevenLabs = new ElevenLabsService({ apiKey: process.env.ELEVENLABS_API_KEY });
    }

    // ... (Transcribe, DetectRisk, AnalyzeTranscript methods remain unchanged) ...

    /**
     * PASO 1: Transcribir audio con Whisper
     */
    async transcribe(audioBuffer: Buffer, mimeType: string): Promise<{
        transcript: string;
        confidence: number;
        language: string;
    }> {
        const file: any = await OpenAI.toFile(audioBuffer, 'audio.ogg', { type: mimeType });
        const response = await this.openai.audio.transcriptions.create({
            file,
            model: 'whisper-1',
            response_format: 'verbose_json',
            language: 'es'
        });
        return {
            transcript: response.text,
            confidence: response.segments?.[0]?.avg_logprob ? Math.exp(response.segments[0].avg_logprob) : 0.9,
            language: response.language || 'es'
        };
    }

    /**
    * PASO 2: Detección de riesgo determinística (regex)
    */
    detectRiskDeterministic(transcript: string): string[] {
        const lowerTranscript = transcript.toLowerCase();
        const flags: string[] = [];
        for (const [category, keywords] of Object.entries(RISK_KEYWORDS)) {
            for (const keyword of (keywords as string[])) {
                if (lowerTranscript.includes(keyword)) {
                    flags.push(`${category}:${keyword}`);
                }
            }
        }
        return [...new Set(flags)];
    }

    /**
     * PASO 3: Análisis completo con LLM (emoción + intent + risk)
     */
    async analyzeTranscript(
        transcript: string,
        clientContext?: any
    ): Promise<Omit<VoiceAnalysisResult, 'transcript' | 'transcriptConfidence' | 'language'>> {

        const deterministicFlags = this.detectRiskDeterministic(transcript);
        const prompt = `
Analiza el siguiente mensaje de voz transcrito de un cliente.

TRANSCRIPT:
${transcript}

CONTEXTO DEL CLIENTE:
${clientContext ? JSON.stringify(clientContext, null, 2) : 'No disponible'}

FLAGS DETECTADOS AUTOMÁTICAMENTE:
${deterministicFlags.length > 0 ? deterministicFlags.join(', ') : 'Ninguno'}

Responde SOLO en JSON válido:
{
  "summary": "Resumen de 1-2 oraciones",
  "intent": "soporte|consulta_coa|pedido|reclamo|facturacion|seguimiento|otro",
  "intent_confidence": 0.0-1.0,
  "emotion_primary": "frustrado|confundido|satisfecho|enojado|ansioso|neutral|preocupado|entusiasmado",
  "emotion_score": 0.0-1.0,
  "sentiment_score": -1.0 a +1.0,
  "evidence_quotes": ["frase exacta 1", "frase exacta 2"],
  "confidence_reason": "Por qué estoy seguro/inseguro de mi análisis",
  "risk_flags_llm": ["flag1", "flag2"],
  "predicted_action": "auto_respond|send_coa_link|create_ticket|escalate_human|schedule_callback|upsell_opportunity",
  "should_escalate": true|false,
  "escalation_reason": "..." o null,
  "suggested_response": "Respuesta empática sugerida"
}`;

        const routerOutput = this.router.route({
            prompt,
            taskType: 'voice_analysis',
            goal: deterministicFlags.length > 0 ? 'quality' : 'balanced'
        });

        const response = await this.openai.chat.completions.create({
            model: routerOutput.selectedModel,
            messages: [
                { role: 'system', content: 'Eres un experto en análisis de comunicación y detección de emociones.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: routerOutput.tokenBudget,
            temperature: 0.3,
            response_format: { type: 'json_object' }
        });

        const analysis = JSON.parse(response.choices[0].message.content || '{}');
        const combinedFlags = [...new Set([...deterministicFlags, ...(analysis.risk_flags_llm || [])])];

        return {
            summary: analysis.summary,
            intent: analysis.intent,
            intentConfidence: analysis.intent_confidence,
            emotionTextPrimary: analysis.emotion_primary,
            emotionTextScore: analysis.emotion_score,
            emotionFusionPrimary: analysis.emotion_primary,
            emotionFusionScore: analysis.emotion_score,
            sentimentScore: analysis.sentiment_score,
            evidenceQuotes: analysis.evidence_quotes || [],
            confidenceReason: analysis.confidence_reason,
            riskFlagsDeterministic: deterministicFlags,
            riskFlagsLLM: analysis.risk_flags_llm || [],
            riskFlagsCombined: combinedFlags,
            predictedAction: analysis.predicted_action,
            shouldEscalate: analysis.should_escalate,
            escalationReason: analysis.escalation_reason
        };
    }

    /* -----------------------------------------------------------
     *  PASO 4: Generar respuesta TTS (Dual Provider)
     * ----------------------------------------------------------- */
    async generateAudioResponse(
        text: string,
        configOrColumnId?: string | VoiceProfileConfig,
        detectedEmotion?: string
    ): Promise<Buffer> {
        let config: VoiceProfileConfig = { provider: 'openai', voice_id: 'nova' }; // Default

        // If string, assume it's a column_id to fetch config from DB
        if (typeof configOrColumnId === 'string') {
            const { data } = await this.supabase
                .from('crm_columns')
                .select('voice_profile')
                .eq('id', configOrColumnId)
                .single();
            if (data?.voice_profile) {
                // Handle legacy string vs new JSON
                if (typeof data.voice_profile === 'string') {
                    config.voice_id = data.voice_profile;
                } else {
                    config = data.voice_profile;
                }
            }
        } else if (configOrColumnId) {
            config = configOrColumnId;
        }

        // --- ELEVENLABS PROVIDER ---
        if (config.provider === 'elevenlabs') {
            const emotionSettings = detectedEmotion
                ? this.elevenLabs.mapEmotionToSettings(detectedEmotion)
                : {};

            const finalSettings = {
                stability: 0.5,
                similarity_boost: 0.75,
                style: 0.0,
                use_speaker_boost: true,
                speed: 1.0,
                ...emotionSettings,
                ...config.settings
            };

            logger.info('VOICE_GENERATING_11LABS', {
                voice: config.voice_id,
                emotion: detectedEmotion,
                settings: finalSettings
            });

            return await this.elevenLabs.generateAudio(text, config.voice_id, finalSettings);
        }

        // --- OPENAI PROVIDER (Default) ---
        return await this.generateOpenAIAudio(text, config.voice_id as any);
    }

    private async generateOpenAIAudio(text: string, voiceOverride?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'): Promise<Buffer> {
        const response = await this.openai.audio.speech.create({
            model: 'tts-1',
            voice: voiceOverride || 'nova',
            input: text,
            response_format: 'opus'
        });
        return Buffer.from(await response.arrayBuffer());
    }

    /**
     * Pipeline completo: Audio → Análisis → Respuesta
     */
    async processVoiceMessage(
        audioBuffer: Buffer,
        mimeType: string,
        clientId?: string,
        conversationId?: string,
        messageId?: string,
        originalAudioUrl?: string
    ): Promise<VoiceAnalysisResult & { responseAudioBuffer?: Buffer }> {

        const traceId = getTraceId();
        logger.info('VOICE_RECEIVED', { traceId, clientId, conversationId, messageId });

        // 1. Transcribe
        const transcription = await this.transcribe(audioBuffer, mimeType);

        // 1.5 Auto-lookup Client Context (Same logic as before)
        let resolvedClientId = clientId;
        if (!clientId && conversationId) {
            const { data: conv } = await this.supabase.from('conversations').select('contact_handle').eq('id', conversationId).single();
            if (conv) {
                const { data: client } = await this.supabase.from('clients').select('id')
                    .or(`phone.eq.${conv.contact_handle},email.eq.${conv.contact_handle}`).maybeSingle();
                resolvedClientId = client?.id;
            }
        }

        // 2. Client Context
        let clientContext = null;
        if (resolvedClientId) {
            const { data } = await this.supabase.from('crm_contact_snapshots').select('*').eq('client_id', resolvedClientId).single();
            clientContext = data;
        }

        // 3. Analyze
        const analysis = await this.analyzeTranscript(transcription.transcript, clientContext);

        logger.info('VOICE_ANALYZED', {
            traceId,
            intent: analysis.intent,
            emotion: analysis.emotionFusionPrimary,
            sentiment: analysis.sentimentScore
        });

        // 4. Store in DB
        const { error: insertError } = await this.supabase.from('voice_interactions').insert({
            trace_id: traceId,
            client_id: resolvedClientId,
            conversation_id: conversationId,
            audio_url: originalAudioUrl || 'pending_s3_upload',
            channel: 'whatsapp',
            transcript: transcription.transcript,
            transcript_confidence: transcription.confidence,
            language: transcription.language,
            summary: analysis.summary,
            intent: analysis.intent,
            intent_confidence: analysis.intentConfidence,
            emotion_text_primary: analysis.emotionTextPrimary,
            emotion_text_score: analysis.emotionTextScore,
            sentiment_score: analysis.sentimentScore,
            risk_flags_combined: analysis.riskFlagsCombined,
            predicted_action: analysis.predictedAction,
            escalated: analysis.shouldEscalate,
            escalation_reason: analysis.escalationReason
        });
        if (insertError) logger.error('VOICE_DB_ERROR', insertError);

        // 5. Update CRM Message
        if (messageId) {
            const enrichedContent = `\n\n> 🎙️ **Transcripción:** ${transcription.transcript}\n> 💡 **Resumen:** ${analysis.summary}\n> 🏷️ **Intención:** ${analysis.intent} (${analysis.emotionFusionPrimary || 'Neutral'})`;
            const { data: msg } = await this.supabase.from('crm_messages').select('content').eq('id', messageId).single();
            if (msg) {
                const newContent = (msg.content || '') + enrichedContent;
                await this.supabase.from('crm_messages').update({ content: newContent }).eq('id', messageId);
            }
        }

        return {
            ...analysis,
            transcript: transcription.transcript,
            transcriptConfidence: transcription.confidence,
            language: transcription.language
        };
    }
}
