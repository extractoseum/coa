
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
    correlationId?: string; // Phase 31: Logging
}

import { logger } from '../utils/Logger';

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

export interface RouterPolicy {
    cost: { model: string; budget: number };
    balanced: { model: string; budget: number };
    quality: { model: string; budget: number };
}

export class ModelRouter {

    private policies!: Map<TaskType, RouterPolicy>;

    constructor() {
        this.initializePolicies();
    }

    public route(input: RouterInput): RouterOutput {
        // 1. Si hay forceModel, bypass todo
        if (input.forceModel) {
            return this.createOutput(input.forceModel, 4000, 'forced by input');
        }

        // 2. Evaluar complejidad
        const complexity = this.evaluateComplexity(input);

        // 3. Evaluar riesgo
        const risk = this.evaluateRisk(input);

        // 4. Aplicar política según goal
        const policy = this.policies.get(input.taskType);

        if (!policy) {
            // Default fallback (Fix #15: Avoid expensive gpt-4o default, use mini)
            return this.createOutput('gpt-4o-mini', 1000, 'unknown task type fallback (default)');
        }

        // 5. Seleccionar modelo
        return this.selectModel(input, complexity, risk, policy);
    }

    private createOutput(model: string, budget: number, reasoning: string): RouterOutput {
        const output = {
            selectedModel: model,
            tokenBudget: budget,
            temperature: 0.7,
            enableTools: true,
            reasoning
        };

        logger.info(`[ModelRouter] FORCE override: ${model}`, {
            model,
            reasoning
        });

        return output;
    }

    private selectModel(
        input: RouterInput,
        complexity: 'low' | 'medium' | 'high',
        risk: 'low' | 'medium' | 'high',
        policy: RouterPolicy
    ): RouterOutput {
        let goal = input.goal || 'balanced';

        // Override goal based on Risk/Complexity
        if (risk === 'high' || complexity === 'high') {
            goal = 'quality'; // Force quality on high risk/complexity
        }

        const selected = policy[goal];

        const output = {
            selectedModel: selected.model,
            tokenBudget: selected.budget,
            temperature: risk === 'high' ? 0.3 : 0.7, // Low temp for high risk
            enableTools: true,
            reasoning: `Goal: ${goal}, Risk: ${risk}, Complexity: ${complexity}`
        };

        logger.info(`[ModelRouter] Selected ${selected.model} for ${input.taskType}`, {
            correlation_id: input.correlationId,
            model: selected.model,
            task: input.taskType,
            goal,
            risk,
            complexity,
            budget: selected.budget
        });

        return output;
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
                balanced: { model: 'gpt-4o', budget: 3000 },
                quality: { model: 'gpt-4o', budget: 4000 }
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
