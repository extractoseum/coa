# Plan de Optimización: Voice Pipeline + Model Router + Token Efficiency

> **Estado**: Plan (No ejecutado)
> **Fecha**: 2025-12-21
> **Versión**: 1.0

---

## Resumen Ejecutivo

Este plan optimiza el sistema en 3 ejes principales:
1. **Voice Pipeline** - Integración de voz con detección de emociones
2. **Model Router (AUTO mode)** - Selección inteligente de modelo por contexto
3. **Token Efficiency** - Reducción de costos manteniendo calidad

---

## Estado Actual del Sistema

### Infraestructura Existente

| Componente | Estado | Archivo |
|------------|--------|---------|
| Multi-provider AI | ✅ | `aiService.ts` (OpenAI, Anthropic, Gemini) |
| Cost Tracking | ✅ | `aiUsageService.ts` (JSONL logs) |
| WhatsApp Integration | ✅ | `whapiService.ts` (WHAPI) |
| CRM Service | ✅ | `CRMService.ts` (conversaciones, snapshots) |
| Model Selection UI | ✅ | `AdminAIKnowledge.tsx` (manual) |
| AI Tools | ✅ | `aiTools.ts` (11 herramientas) |

### Precios Actuales Configurados

```typescript
// aiUsageService.ts
const PRICING = {
    'gpt-4o': { input: 5.00, output: 15.00 },      // Por 1M tokens
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
    'gemini-1.5-pro': { input: 3.50, output: 10.50 },
};
```

---

## PARTE 1: Model Router (AUTO Mode)

### 1.1 Arquitectura del Router

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         MODEL ROUTER (Policy Engine)                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  INPUT                          ROUTER                        OUTPUT    │
│  ┌──────────────┐              ┌──────────────┐             ┌────────┐ │
│  │ • prompt     │              │ Evaluate:    │             │model   │ │
│  │ • task_type  │───────────▶  │ • complexity │──────────▶  │budget  │ │
│  │ • context    │              │ • risk       │             │tools   │ │
│  │ • goal       │              │ • urgency    │             │fallback│ │
│  └──────────────┘              └──────────────┘             └────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Nuevo Archivo: `backend/src/services/modelRouter.ts`

```typescript
// Estructura propuesta

export type AutoGoal = 'cost' | 'balanced' | 'quality';

export interface RouterInput {
    prompt: string;
    systemPrompt?: string;
    taskType: TaskType;
    context?: {
        clientTier?: 'B2C' | 'B2B' | 'VIP';
        channel?: 'WA' | 'EMAIL' | 'WEB';
        conversationHistory?: number; // message count
        hasAttachments?: boolean;
    };
    goal?: AutoGoal;
    forceModel?: string; // Override para bypass
}

export interface RouterOutput {
    selectedModel: string;
    tokenBudget: number;
    temperature: number;
    enableTools: boolean;
    toolsWhitelist?: string[];
    fallbackModel?: string;
    reasoning: string; // Para auditoría
}

export type TaskType =
    | 'classification'      // Intent, sentiment, triage
    | 'extraction'          // Datos estructurados de texto
    | 'generation_simple'   // Respuestas cortas, FAQ
    | 'generation_complex'  // Negociación, objeciones
    | 'legal_compliance'    // Reclamos, PROFECO, devoluciones
    | 'sales_b2b'           // Propuestas, seguimiento enterprise
    | 'summarization'       // Resúmenes de conversación
    | 'translation'         // Multilingüe
    | 'voice_analysis';     // Análisis de transcripción de voz

export class ModelRouter {

    private policies: Map<TaskType, RouterPolicy>;

    constructor() {
        this.initializePolicies();
    }

    public route(input: RouterInput): RouterOutput {
        // 1. Si hay forceModel, bypass todo
        if (input.forceModel) {
            return this.createOutput(input.forceModel, 'forced');
        }

        // 2. Evaluar complejidad
        const complexity = this.evaluateComplexity(input);

        // 3. Evaluar riesgo
        const risk = this.evaluateRisk(input);

        // 4. Aplicar política según goal
        const policy = this.policies.get(input.taskType);

        // 5. Seleccionar modelo
        return this.selectModel(input, complexity, risk, policy);
    }

    private evaluateComplexity(input: RouterInput): 'low' | 'medium' | 'high' {
        const promptLength = input.prompt.length;
        const hasMultipleQuestions = (input.prompt.match(/\?/g) || []).length > 2;
        const hasCodeOrTechnical = /```|function|error|bug|api/i.test(input.prompt);
        const historyDepth = input.context?.conversationHistory || 0;

        let score = 0;
        if (promptLength > 500) score++;
        if (promptLength > 1500) score++;
        if (hasMultipleQuestions) score++;
        if (hasCodeOrTechnical) score++;
        if (historyDepth > 10) score++;

        if (score >= 3) return 'high';
        if (score >= 1) return 'medium';
        return 'low';
    }

    private evaluateRisk(input: RouterInput): 'low' | 'medium' | 'high' {
        const riskKeywords = [
            'profeco', 'cofepris', 'demanda', 'fraude', 'legal',
            'devolucion', 'reembolso', 'abogado', 'denuncia',
            'ine', 'factura', 'sat', 'cancelar'
        ];

        const lowerPrompt = input.prompt.toLowerCase();
        const matches = riskKeywords.filter(k => lowerPrompt.includes(k));

        if (matches.length >= 2) return 'high';
        if (matches.length === 1) return 'medium';
        if (input.context?.clientTier === 'VIP') return 'medium';
        return 'low';
    }

    private initializePolicies(): void {
        this.policies = new Map([
            ['classification', {
                cost: { model: 'gpt-4o-mini', budget: 500 },
                balanced: { model: 'gpt-4o-mini', budget: 800 },
                quality: { model: 'gpt-4o', budget: 1000 }
            }],
            ['extraction', {
                cost: { model: 'gpt-4o-mini', budget: 800 },
                balanced: { model: 'gpt-4o-mini', budget: 1000 },
                quality: { model: 'gpt-4o', budget: 1500 }
            }],
            ['generation_simple', {
                cost: { model: 'gpt-4o-mini', budget: 500 },
                balanced: { model: 'gpt-4o', budget: 800 },
                quality: { model: 'gpt-4o', budget: 1200 }
            }],
            ['generation_complex', {
                cost: { model: 'gpt-4o', budget: 1500 },
                balanced: { model: 'gpt-4o', budget: 2000 },
                quality: { model: 'claude-3-5-sonnet-20241022', budget: 3000 }
            }],
            ['legal_compliance', {
                cost: { model: 'gpt-4o', budget: 2000 },
                balanced: { model: 'claude-3-5-sonnet-20241022', budget: 3000 },
                quality: { model: 'claude-3-5-sonnet-20241022', budget: 4000 }
            }],
            ['sales_b2b', {
                cost: { model: 'gpt-4o-mini', budget: 1000 },
                balanced: { model: 'gpt-4o', budget: 1500 },
                quality: { model: 'gpt-4o', budget: 2000 }
            }],
            ['summarization', {
                cost: { model: 'gpt-4o-mini', budget: 1000 },
                balanced: { model: 'gpt-4o-mini', budget: 1500 },
                quality: { model: 'gpt-4o', budget: 2000 }
            }],
            ['voice_analysis', {
                cost: { model: 'gpt-4o-mini', budget: 800 },
                balanced: { model: 'gpt-4o', budget: 1200 },
                quality: { model: 'gpt-4o', budget: 1500 }
            }]
        ]);
    }
}
```

### 1.3 Integración en aiService.ts

```typescript
// Modificación propuesta a aiService.ts

import { ModelRouter, RouterInput, AutoGoal } from './modelRouter';

class AIService {
    private router: ModelRouter;

    constructor() {
        // ... existing code ...
        this.router = new ModelRouter();
    }

    public async generateTextAuto(
        systemPrompt: string,
        userPrompt: string,
        taskType: TaskType,
        goal: AutoGoal = 'balanced',
        context?: any
    ): Promise<AIResponse> {

        // 1. Route to optimal model
        const routerOutput = this.router.route({
            prompt: userPrompt,
            systemPrompt,
            taskType,
            context,
            goal
        });

        // 2. Log routing decision
        logger.info('MODEL_ROUTED', {
            taskType,
            goal,
            selectedModel: routerOutput.selectedModel,
            tokenBudget: routerOutput.tokenBudget,
            reasoning: routerOutput.reasoning
        });

        // 3. Execute with selected model
        return this.generateText(
            systemPrompt,
            userPrompt,
            routerOutput.selectedModel,
            { maxTokens: routerOutput.tokenBudget }
        );
    }
}
```

### 1.4 UI: Selector AUTO en AdminAIKnowledge.tsx

```typescript
// Agregar a la lista de modelos existente

const MODELS = [
    // AUTO modes (nuevos)
    { value: 'auto:cost', label: 'AUTO: Cost Optimized', description: 'Minimiza tokens, calidad aceptable' },
    { value: 'auto:balanced', label: 'AUTO: Balanced (Recommended)', description: 'Balance costo/calidad' },
    { value: 'auto:quality', label: 'AUTO: Quality First', description: 'Mejor modelo disponible' },

    // Divider
    { value: 'divider', label: '── Manual Selection ──', disabled: true },

    // Existing models...
    { value: 'gpt-4o', label: 'GPT-4o (Stable)' },
    // ...
];
```

---

## PARTE 2: Voice Pipeline

### 2.1 Nueva Tabla: `voice_interactions`

```sql
-- Migración propuesta

CREATE TABLE voice_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    trace_id VARCHAR(64) NOT NULL,
    client_id UUID REFERENCES clients(id),
    conversation_id UUID REFERENCES crm_conversations(id),

    -- Audio
    audio_url TEXT NOT NULL,
    audio_duration_seconds DECIMAL(10,2),
    channel VARCHAR(20) NOT NULL, -- 'whatsapp', 'call', 'web'

    -- Transcripción
    transcript TEXT,
    transcript_confidence DECIMAL(3,2),
    language VARCHAR(10),

    -- Análisis de Texto
    summary TEXT,
    intent VARCHAR(50),
    intent_confidence DECIMAL(3,2),

    -- Análisis de Emoción (NUEVO - fusion score)
    emotion_text_primary VARCHAR(30),
    emotion_text_score DECIMAL(3,2),
    emotion_audio_energy DECIMAL(5,2),
    emotion_audio_pitch_variance DECIMAL(5,2),
    emotion_audio_speaking_rate DECIMAL(5,2),
    emotion_fusion_primary VARCHAR(30),
    emotion_fusion_score DECIMAL(3,2),
    sentiment_score DECIMAL(3,2), -- -1.0 a +1.0

    -- Evidencias (NUEVO - para auditoría)
    evidence_quotes JSONB, -- ["frase 1", "frase 2"]
    confidence_reason TEXT,

    -- Risk Flags (NUEVO - híbrido regex + LLM)
    risk_flags_deterministic TEXT[], -- Detectados por regex
    risk_flags_llm TEXT[], -- Detectados por LLM
    risk_flags_combined TEXT[], -- Unión de ambos

    -- Predicción
    predicted_action VARCHAR(50),
    action_taken VARCHAR(50),
    escalated BOOLEAN DEFAULT FALSE,
    escalation_reason TEXT,

    -- Respuesta
    response_text TEXT,
    response_audio_url TEXT,
    response_latency_ms INTEGER,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ, -- Para compliance (90 días)

    -- Indexes
    CONSTRAINT voice_interactions_trace_id_idx UNIQUE (trace_id)
);

CREATE INDEX idx_voice_client ON voice_interactions(client_id);
CREATE INDEX idx_voice_conversation ON voice_interactions(conversation_id);
CREATE INDEX idx_voice_created ON voice_interactions(created_at DESC);
CREATE INDEX idx_voice_expires ON voice_interactions(expires_at);
```

### 2.2 Nuevo Servicio: `backend/src/services/voiceService.ts`

```typescript
// Estructura propuesta

import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { ModelRouter } from './modelRouter';
import { logger } from './loggerService';
import { getTraceId } from '../telemetry/trace';

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

    // Emotion (fusion)
    emotionTextPrimary: string;
    emotionTextScore: number;
    emotionFusionPrimary: string;
    emotionFusionScore: number;
    sentimentScore: number;

    // Evidence
    evidenceQuotes: string[];
    confidenceReason: string;

    // Risk
    riskFlagsDeterministic: string[];
    riskFlagsLLM: string[];
    riskFlagsCombined: string[];

    // Action
    predictedAction: string;
    shouldEscalate: boolean;
    escalationReason?: string;
}

export class VoiceService {
    private openai: OpenAI;
    private router: ModelRouter;
    private supabase: any;

    constructor() {
        this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        this.router = new ModelRouter();
        this.supabase = createClient(
            process.env.SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
    }

    /**
     * PASO 1: Transcribir audio con Whisper
     */
    async transcribe(audioBuffer: Buffer, mimeType: string): Promise<{
        transcript: string;
        confidence: number;
        language: string;
    }> {
        const file = new File([audioBuffer], 'audio.ogg', { type: mimeType });

        const response = await this.openai.audio.transcriptions.create({
            file,
            model: 'whisper-1',
            response_format: 'verbose_json',
            language: 'es' // Default español, auto-detect si omitido
        });

        return {
            transcript: response.text,
            confidence: response.segments?.[0]?.avg_logprob
                ? Math.exp(response.segments[0].avg_logprob)
                : 0.9,
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
            for (const keyword of keywords) {
                if (lowerTranscript.includes(keyword)) {
                    flags.push(`${category}:${keyword}`);
                }
            }
        }

        return [...new Set(flags)]; // Dedupe
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

  "emotion_primary": "frustrado|confundido|satisfecho|enojado|ansioso|neutral|preocupado",
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

        // Usar router para seleccionar modelo óptimo
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

        // Combinar flags determinísticos + LLM
        const combinedFlags = [...new Set([
            ...deterministicFlags,
            ...(analysis.risk_flags_llm || [])
        ])];

        return {
            summary: analysis.summary,
            intent: analysis.intent,
            intentConfidence: analysis.intent_confidence,
            emotionTextPrimary: analysis.emotion_primary,
            emotionTextScore: analysis.emotion_score,
            emotionFusionPrimary: analysis.emotion_primary, // TODO: Agregar análisis de audio
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

    /**
     * PASO 4: Generar respuesta TTS
     */
    async generateAudioResponse(text: string): Promise<Buffer> {
        const response = await this.openai.audio.speech.create({
            model: 'tts-1',
            voice: 'nova', // Voz femenina para ARA
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
        conversationId?: string
    ): Promise<VoiceAnalysisResult & { responseAudioBuffer?: Buffer }> {

        const traceId = getTraceId();

        logger.info('VOICE_RECEIVED', { traceId, clientId, conversationId });

        // 1. Transcribir
        const transcription = await this.transcribe(audioBuffer, mimeType);
        logger.info('VOICE_TRANSCRIBED', {
            traceId,
            language: transcription.language,
            wordCount: transcription.transcript.split(' ').length
        });

        // 2. Obtener contexto del cliente
        let clientContext = null;
        if (clientId) {
            const { data } = await this.supabase
                .from('crm_contact_snapshots')
                .select('*')
                .eq('client_id', clientId)
                .single();
            clientContext = data;
        }

        // 3. Analizar
        const analysis = await this.analyzeTranscript(
            transcription.transcript,
            clientContext
        );

        logger.info('VOICE_ANALYZED', {
            traceId,
            intent: analysis.intent,
            emotion: analysis.emotionFusionPrimary,
            sentiment: analysis.sentimentScore,
            riskFlags: analysis.riskFlagsCombined
        });

        // 4. Escalate si necesario
        if (analysis.shouldEscalate) {
            logger.warn('VOICE_ESCALATED', {
                traceId,
                reason: analysis.escalationReason,
                riskFlags: analysis.riskFlagsCombined
            });
        }

        return {
            ...transcription,
            ...analysis
        };
    }
}
```

### 2.3 Webhook para WhatsApp Voice Notes

```typescript
// Agregar a crmController.ts

// POST /api/v1/crm/inbound
// Modificar para detectar mensajes de audio

if (message.type === 'audio' || message.type === 'voice') {
    // Descargar audio de WHAPI
    const audioUrl = message.audio?.link || message.voice?.link;

    if (audioUrl) {
        // Procesar en background (fire-and-forget)
        voiceService.processVoiceMessage(
            await downloadAudio(audioUrl),
            'audio/ogg',
            clientId,
            conversationId
        ).then(result => {
            // Guardar en voice_interactions
            // Actualizar conversación
            // Enviar respuesta si es auto_respond
        }).catch(err => {
            logger.error('VOICE_PROCESSING_FAILED', { error: err.message });
        });
    }
}
```

---

## PARTE 3: Token Efficiency

### 3.1 Estrategia de 2 Pasos

```
┌─────────────────────────────────────────────────────────────────┐
│  PASO 1: Clasificador Barato (gpt-4o-mini)                      │
│  ├── Intent detection                                           │
│  ├── Urgency level                                              │
│  ├── Risk flags (determinísticos)                               │
│  └── Decisión: ¿Necesita modelo pesado?                         │
│                     │                                           │
│         ┌───────────┴───────────┐                               │
│         ▼                       ▼                               │
│  ┌─────────────────┐   ┌─────────────────┐                     │
│  │ PASO 2A: Rápido │   │ PASO 2B: Pesado │                     │
│  │ • gpt-4o-mini   │   │ • gpt-4o        │                     │
│  │ • Templates     │   │ • claude-sonnet │                     │
│  │ • Sin tools     │   │ • Con tools     │                     │
│  └─────────────────┘   └─────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Prompt de Clasificación (Ultra-Eficiente)

```typescript
// Nuevo: classifier.ts

const CLASSIFIER_PROMPT = `Clasifica este mensaje en JSON:
M: {message}

{"i":"intent","u":"1-5","r":["flags"],"c":true/false}

i: soporte|coa|pedido|reclamo|factura|otro
u: urgencia 1-5
r: risk flags (legal|churn|urgency)
c: necesita modelo complejo
`;

// ~50 tokens input, ~30 tokens output
// vs ~500 tokens para análisis completo
```

### 3.3 Cache de Respuestas Comunes

```typescript
// Nuevo: responseCache.ts

interface CachedResponse {
    pattern: RegExp;
    response: string;
    ttl: number;
}

const FAQ_CACHE: CachedResponse[] = [
    {
        pattern: /donde.*rastrear|tracking|seguimiento.*pedido/i,
        response: 'Puedes rastrear tu pedido en: {tracking_url}',
        ttl: 3600
    },
    {
        pattern: /horario.*atencion|cuando.*abren/i,
        response: 'Nuestro horario es Lunes a Viernes 9am-6pm.',
        ttl: 86400
    },
    // ... más patrones
];

// Si hay match → respuesta instantánea (0 tokens)
```

### 3.4 Proyección de Ahorro

| Escenario | Antes (gpt-4o siempre) | Después (Router) | Ahorro |
|-----------|------------------------|------------------|--------|
| 1,000 clasificaciones | $50 | $5 (mini) | 90% |
| 500 respuestas FAQ | $25 | $0 (cache) | 100% |
| 300 análisis complejos | $45 | $45 | 0% |
| 200 voice notes | $30 | $20 | 33% |
| **Total mensual** | **$150** | **$70** | **53%** |

---

## PARTE 4: Compliance & Seguridad

### 4.1 Consentimiento WhatsApp

```typescript
// Mensaje automático al primer audio recibido

const CONSENT_MESSAGE = `
Al enviar mensajes de voz aceptas que sean procesados
para mejorar tu atención. Más info: {privacy_url}

Responde "NO AUDIO" para desactivar.
`;

// Guardar preferencia en clients.voice_consent
```

### 4.2 Expiración de Audio

```typescript
// Cron job: cleanup-voice.ts

// Ejecutar diariamente
const RETENTION_DAYS = 90;

await supabase
    .from('voice_interactions')
    .delete()
    .lt('expires_at', new Date().toISOString());

// También eliminar de S3
await s3.deleteObjects({
    Bucket: 'voice-recordings',
    Delete: {
        Objects: expiredRecords.map(r => ({ Key: r.audio_url }))
    }
});
```

### 4.3 Auditoría SWIS Watch

```typescript
// Eventos de voz en telemetry

const VOICE_EVENTS = {
    VOICE_RECEIVED: 'info',
    VOICE_TRANSCRIBED: 'info',
    VOICE_ANALYZED: 'info',
    VOICE_ESCALATED: 'warn',
    VOICE_RESPONSE_SENT: 'info',
    VOICE_CONSENT_REVOKED: 'info',
    VOICE_EXPIRED_DELETED: 'info',
    VOICE_ANALYSIS_FAILED: 'error'
};
```

---

## PARTE 5: Plan de Implementación

### Fase 1: Model Router (1 semana)

| Tarea | Archivo | Prioridad |
|-------|---------|-----------|
| Crear `modelRouter.ts` | backend/src/services/ | Alta |
| Integrar en `aiService.ts` | Modificar | Alta |
| Agregar UI AUTO modes | AdminAIKnowledge.tsx | Media |
| Tests unitarios | tests/modelRouter.test.ts | Media |
| Logging SWIS | Integrar trace_id | Alta |

### Fase 2: Token Efficiency (1 semana)

| Tarea | Archivo | Prioridad |
|-------|---------|-----------|
| Classifier prompt | backend/src/services/classifier.ts | Alta |
| Response cache | backend/src/services/responseCache.ts | Media |
| Actualizar pricing | aiUsageService.ts | Baja |
| Dashboard de costos | AdminTelemetry.tsx | Media |

### Fase 3: Voice Pipeline MVP (2 semanas)

| Tarea | Archivo | Prioridad |
|-------|---------|-----------|
| Migración SQL | voice_interactions table | Alta |
| `voiceService.ts` | backend/src/services/ | Alta |
| Webhook audio handler | crmController.ts | Alta |
| Risk detection híbrido | voiceService.ts | Alta |
| Emotion analysis prompt | voiceService.ts | Media |
| Consent flow | whapiService.ts | Alta |

### Fase 4: TTS + Respuestas (1 semana)

| Tarea | Archivo | Prioridad |
|-------|---------|-----------|
| OpenAI TTS integration | voiceService.ts | Media |
| Auto-respond logic | crmController.ts | Media |
| Audio upload S3 | storageService.ts | Media |
| Cleanup cron | scripts/cleanup-voice.ts | Baja |

### Fase 5: Dashboard & Polish (1 semana)

| Tarea | Archivo | Prioridad |
|-------|---------|-----------|
| Voice insights en CRM | AdminCRM.tsx | Media |
| Emotion timeline | AdminCRM.tsx | Baja |
| Cost dashboard | AdminTelemetry.tsx | Media |
| Documentación | docs/VOICE_INTEGRATION.md | Baja |

---

## Archivos a Crear

```
backend/src/services/
├── modelRouter.ts          # Policy engine para AUTO mode
├── voiceService.ts         # Pipeline STT → NLP → TTS
├── classifier.ts           # Clasificador ultra-eficiente
└── responseCache.ts        # Cache de respuestas FAQ

backend/src/migrations/
└── 20241221_voice_interactions.sql

scripts/
└── cleanup-voice.ts        # Cron de expiración

docs/
└── VOICE_INTEGRATION.md    # Documentación del sistema
```

## Archivos a Modificar

```
backend/src/services/
├── aiService.ts            # Agregar generateTextAuto()
├── aiUsageService.ts       # Actualizar pricing
└── CRMService.ts           # Integrar voice analysis

backend/src/controllers/
└── crmController.ts        # Webhook para audio

frontend/src/pages/
├── AdminAIKnowledge.tsx    # UI AUTO modes
├── AdminCRM.tsx            # Voice insights
└── AdminTelemetry.tsx      # Cost dashboard
```

---

## Métricas de Éxito

| Métrica | Baseline | Target |
|---------|----------|--------|
| Costo por interacción AI | $0.15 | $0.07 (-53%) |
| Latencia clasificación | - | <500ms |
| Latencia voice analysis | - | <3s |
| Accuracy intent detection | - | >90% |
| Emotion detection precision | - | >85% |
| Escalation false positives | - | <10% |

---

## Riesgos y Mitigaciones

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| Whisper falla en audio ruidoso | Media | Alto | Filtro de calidad pre-transcripción |
| Emociones mal clasificadas | Media | Medio | Evidence quotes + human review |
| Costos OpenAI suben | Baja | Alto | Fallback a modelos locales (Whisper local) |
| Compliance GDPR/LFPDPPP | Baja | Alto | TTL 90 días + consent flow |

---

**Plan creado**: 2025-12-21
**Próxima revisión**: Antes de ejecución
**Autor**: Claude Code + Usuario
