import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { ADMIN_TOOLS, TOOL_HANDLERS } from './aiTools';
import { AIUsageService } from './aiUsageService';
import { ModelRouter, RouterInput, AutoGoal, TaskType, RouterOutput } from './ModelRouter';
import { IntelligenceService } from './intelligenceService';

dotenv.config();

// Configuration
const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.ARA_MODEL || 'gpt-4o';

if (!API_KEY) {
    console.warn('[AIService] ⚠️ OPENAI_API_KEY is missing. AI features will fail.');
}

const openai = new OpenAI({
    apiKey: API_KEY,
});

export type ConfidenceLevel = 'high' | 'medium' | 'low' | null;

interface AIResponse {
    content: string | null;
    usage: OpenAI.Completions.CompletionUsage | undefined;
    confidence?: ConfidenceLevel;
}

/**
 * Parse and extract confidence level from AI response
 * Looks for [[CONFIDENCE:HIGH]], [[CONFIDENCE:MEDIUM]], or [[CONFIDENCE:LOW]]
 */
function parseConfidence(content: string | null): { cleanContent: string; confidence: ConfidenceLevel } {
    if (!content) return { cleanContent: '', confidence: null };

    const confidenceRegex = /\[\[CONFIDENCE:(HIGH|MEDIUM|LOW)\]\]/i;
    const match = content.match(confidenceRegex);

    if (match) {
        const confidence = match[1].toLowerCase() as ConfidenceLevel;
        // Remove the confidence tag from the content
        const cleanContent = content.replace(confidenceRegex, '').trim();
        return { cleanContent, confidence };
    }

    return { cleanContent: content, confidence: null };
}

/**
 * Customer context injected into AI conversations for personalization
 */
export interface CustomerContext {
    name?: string;
    phone?: string;
    email?: string;
    ltv?: number;
    pendingOrders?: Array<{
        order_number: string;
        total: string;
        status: string;
        fulfillment_status: string | null;
        tracking_number?: string;
        tracking_url?: string;
        created_at: string;
        items: string[];
    }>;
    recentOrders?: Array<{
        order_number: string;
        total: string;
        created_at: string;
    }>;
    tags?: string[];
}

export class AIService {
    private static instance: AIService;

    private anthropic: Anthropic;
    private googleAI: GoogleGenerativeAI;
    private router: ModelRouter;

    private constructor() {
        this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        this.googleAI = new GoogleGenerativeAI(process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY || '');
        this.router = new ModelRouter();
    }

    public static getInstance(): AIService {
        if (!AIService.instance) {
            AIService.instance = new AIService();
        }
        return AIService.instance;
    }

    /**
     * Auto-routed generation based on task logic
     */
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

        console.log(`[AIService] 🔀 Routed: ${taskType} -> ${routerOutput.selectedModel} (${routerOutput.reasoning})`);

        // 2. Execute with selected model
        // Note: For complex tasks requiring tools, we might need to use generateChatWithTools instead.
        // For now, this wraps generateText standard.
        // If ModelRouter suggests enabling tools, we should consider that (not implemented in standard generateText yet)

        return this.generateText(
            systemPrompt,
            userPrompt,
            routerOutput.selectedModel
        );
    }

    /**
     * Standard completion
     */
    public async generateText(
        systemPrompt: string,
        userPrompt: string,
        modelOverride?: string
    ): Promise<AIResponse> {
        const model = modelOverride || MODEL;
        let content = '';
        let inputTokens = 0;
        let outputTokens = 0;

        try {
            if (model.startsWith('claude')) {
                if (!process.env.ANTHROPIC_API_KEY) {
                    throw new Error('ANTHROPIC_API_KEY is missing in server environment.');
                }
                // Anthropic
                const msg = await this.anthropic.messages.create({
                    model: model,
                    max_tokens: 4096,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userPrompt }]
                });
                content = (msg.content[0] as any).text;
                inputTokens = msg.usage.input_tokens;
                outputTokens = msg.usage.output_tokens;

            } else if (model.startsWith('gemini')) {
                if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY && !process.env.GEMINI_API_KEY) {
                    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY / GEMINI_API_KEY is missing in server environment.');
                }
                // Google Gemini (Native System Instruction support)
                const genModel = this.googleAI.getGenerativeModel({
                    model: model,
                    systemInstruction: systemPrompt
                });
                const chat = genModel.startChat();
                const result = await chat.sendMessage(userPrompt);
                const response = result.response;
                content = response.text();

                inputTokens = (userPrompt.length + systemPrompt.length) / 4;
                outputTokens = content.length / 4;

            } else {
                // OpenAI (Fallback)
                if (!API_KEY) {
                    throw new Error('OPENAI_API_KEY is missing in server environment.');
                }

                let messages: any[] = [];
                let options: any = { model: model };

                if (model.startsWith('o1')) {
                    // o1 models: No system role, no temperature
                    messages.push({ role: 'user', content: `[SYSTEM INSTRUCTION]: ${systemPrompt}\n\n${userPrompt}` });
                    // options.temperature is undefined by default
                } else {
                    // Standard models
                    messages.push({ role: 'system', content: systemPrompt });
                    messages.push({ role: 'user', content: userPrompt });
                    options.temperature = 0.3;
                }

                options.messages = messages;

                const completion = await openai.chat.completions.create(options);
                content = completion.choices[0].message.content || '';
                inputTokens = completion.usage?.prompt_tokens || 0;
                outputTokens = completion.usage?.completion_tokens || 0;
            }

            // Log Usage
            AIUsageService.getInstance().logUsage(model, inputTokens, outputTokens, { type: 'text' });

            // Parse confidence from response
            const { cleanContent, confidence } = parseConfidence(content);

            return {
                content: cleanContent,
                usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens },
                confidence
            };

        } catch (error: any) {
            console.error(`[AIService] generateText failed (${model}):`, error.message);
            throw error;
        }
    }

    /**
     * Minimal check to see if a model is reachable and key is valid
     */
    public async checkModelAvailability(modelId: string): Promise<{ status: 'online' | 'offline'; error?: string }> {
        try {
            if (modelId.startsWith('claude')) {
                // Minimal Anthropic check
                await this.anthropic.messages.create({
                    model: modelId,
                    max_tokens: 1,
                    messages: [{ role: 'user', content: 'hi' }]
                });
            } else if (modelId.startsWith('gemini')) {
                // Minimal Gemini check (countTokens is free/cheap)
                const genModel = this.googleAI.getGenerativeModel({ model: modelId });
                await genModel.countTokens("health check");
            } else {
                // Minimal OpenAI check
                await openai.models.retrieve(modelId);
            }
            return { status: 'online' };
        } catch (err: any) {
            return { status: 'offline', error: err.message };
        }
    }

    /**
     * Chat with a specific persona (agent) including its identity.md and other knowledge files.
     */
    public async chatWithPersona(
        persona: string,
        message: string,
        history: any[] = [],
        modelOverride?: string,
        options: { toolsWhitelist?: string[], objectives?: string | null, customerContext?: CustomerContext } = {}
    ): Promise<AIResponse> {
        // 1. Resolve Persona Context
        const KNOWLEDGE_BASE_DIR = path.join(__dirname, '../../data/ai_knowledge_base');
        const safeFolder = path.basename(persona);
        const categories = ['agents_god_mode', 'agents_public', 'agents_internal'];

        let agentFolderPath = '';
        for (const cat of categories) {
            const checkPath = path.join(KNOWLEDGE_BASE_DIR, cat, safeFolder);
            if (fs.existsSync(checkPath) && fs.lstatSync(checkPath).isDirectory()) {
                agentFolderPath = checkPath;
                break;
            }
        }

        // Fallback for legacy
        if (!agentFolderPath) {
            const legacyPath = path.join(KNOWLEDGE_BASE_DIR, 'agents', safeFolder);
            if (fs.existsSync(legacyPath)) agentFolderPath = legacyPath;
        }

        let systemPrompt = 'Act as Ara, the COA Viewer Assistant.';
        if (agentFolderPath) {
            // Priority 1: Check metadata.json for custom instructivePath
            // Priority 2: Fallback to identity.md
            let instructiveFileName = 'identity.md';
            const metadataPath = path.join(agentFolderPath, 'metadata.json');
            if (fs.existsSync(metadataPath)) {
                try {
                    const meta = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
                    if (meta.instructivePath) instructiveFileName = meta.instructivePath;
                } catch (e: any) {
                    console.warn(`[AIService] Failed to parse metadata at ${metadataPath}:`, e.message);
                }
            }

            const identityPath = path.join(agentFolderPath, instructiveFileName);
            if (fs.existsSync(identityPath)) {
                systemPrompt = fs.readFileSync(identityPath, 'utf8') + '\n\n';
            }

            // ═══════════════════════════════════════════════════════════════════════════
            // KNOWLEDGE SNAPS NAVIGATION SYSTEM
            // The agent sees its instructivo with all snaps embedded as a navigation map.
            // This works like vector search - snaps guide the agent to relevant knowledge.
            // ═══════════════════════════════════════════════════════════════════════════
            try {
                const intelligenceService = IntelligenceService.getInstance();
                const metadata = intelligenceService.getMetadata(agentFolderPath);
                const snaps = metadata.knowledgeSnaps || [];

                // Find relevant snaps based on the user's message (vector-like trigger matching)
                const relevantSnaps = intelligenceService.findRelevantSnaps(agentFolderPath, message);

                // Build KNOWLEDGE NAVIGATION MAP - embedded in instructivo
                if (snaps.length > 0) {
                    // Separate LOCAL (agent-specific) from GLOBAL snaps
                    const localSnaps = snaps.filter(s => !s.isGlobal);
                    const globalSnaps = snaps.filter(s => s.isGlobal);

                    systemPrompt += `\n\n╔═══════════════════════════════════════════════════════════════════╗
║               🗺️ MAPA DE NAVEGACIÓN DE CONOCIMIENTO                ║
║  Usa este mapa para encontrar la información que necesitas.        ║
║  Los TRIGGERS te indican cuándo consultar cada fuente.            ║
╚═══════════════════════════════════════════════════════════════════╝\n`;

                    // ─────── AGENT LOCAL KNOWLEDGE ───────
                    if (localSnaps.length > 0) {
                        systemPrompt += `\n### 📁 CONOCIMIENTO LOCAL DEL AGENTE (${localSnaps.length} archivos):\n`;
                        const sortedLocal = [...localSnaps].sort((a, b) => (b.priority || 5) - (a.priority || 5));

                        for (const snap of sortedLocal) {
                            const priorityBadge = snap.priority >= 8 ? '🔴' : snap.priority >= 5 ? '🟡' : '⚪';
                            const categoryEmoji = {
                                product: '📦', policy: '📋', faq: '❓', procedure: '📝',
                                reference: '📚', pricing: '💰', general: '📄'
                            }[snap.category] || '📄';

                            systemPrompt += `\n${priorityBadge} **${snap.fileName}** ${categoryEmoji}\n`;
                            systemPrompt += `   → ${snap.summary}\n`;
                            systemPrompt += `   🎯 USO: ${snap.usage}\n`;
                            if (snap.triggers && snap.triggers.length > 0) {
                                systemPrompt += `   🔑 TRIGGERS: ${snap.triggers.join(', ')}\n`;
                            }
                        }
                    }

                    // ─────── GLOBAL KNOWLEDGE SECTIONS ───────
                    const globalCategories = [
                        { prefix: '[GLOBAL:INSTRUCCIONES]', label: '📜 INSTRUCCIONES GLOBALES', icon: '🌐' },
                        { prefix: '[GLOBAL:BASE_DATOS]', label: '🗄️ BASE DE DATOS (CONTEXTO)', icon: '🌐' },
                        { prefix: '[GLOBAL:PRODUCTOS]', label: '🛒 PRODUCTOS (CATÁLOGO)', icon: '🌐' },
                        { prefix: '[GLOBAL:CORE]', label: '⚙️ CORE (SISTEMA)', icon: '🌐' }
                    ];

                    for (const cat of globalCategories) {
                        const categorySnaps = globalSnaps.filter(s => s.fileName.startsWith(cat.prefix));
                        if (categorySnaps.length > 0) {
                            systemPrompt += `\n### ${cat.icon} ${cat.label} (${categorySnaps.length} archivos):\n`;

                            const sortedCategory = [...categorySnaps].sort((a, b) => (b.priority || 5) - (a.priority || 5));

                            for (const snap of sortedCategory) {
                                const cleanName = snap.fileName.replace(cat.prefix + ' ', '');
                                const priorityBadge = snap.priority >= 8 ? '🔴' : snap.priority >= 5 ? '🟡' : '⚪';

                                systemPrompt += `\n${priorityBadge} **${cleanName}**\n`;
                                systemPrompt += `   → ${snap.summary}\n`;
                                if (snap.triggers && snap.triggers.length > 0) {
                                    systemPrompt += `   🔑 TRIGGERS: ${snap.triggers.join(', ')}\n`;
                                }
                            }
                        }
                    }

                    systemPrompt += `\n═══════════════════════════════════════════════════════════════════\n`;
                }

                // ─────── AUTO-LOAD RELEVANT KNOWLEDGE ───────
                // Based on trigger matching (vector-like search), load the most relevant files
                if (relevantSnaps.length > 0) {
                    systemPrompt += `\n╔═══════════════════════════════════════════════════════════════════╗
║           🎯 CONOCIMIENTO RELEVANTE CARGADO AUTOMÁTICAMENTE        ║
║  Basado en el mensaje del cliente, se cargó esta información:     ║
╚═══════════════════════════════════════════════════════════════════╝\n`;

                    const loadedFiles: string[] = [];

                    for (const snap of relevantSnaps.slice(0, 3)) { // Limit to top 3 most relevant
                        // Determine the actual file path based on whether it's global or local
                        let filePath = '';
                        if (snap.isGlobal && snap.fileName.startsWith('[GLOBAL:')) {
                            // Parse global path: "[GLOBAL:INSTRUCCIONES] filename.md" -> "instructions/filename.md"
                            const match = snap.fileName.match(/\[GLOBAL:(\w+)\] (.+)/);
                            if (match) {
                                const folderMap: Record<string, string> = {
                                    'INSTRUCCIONES': 'instructions',
                                    'BASE_DATOS': 'information',
                                    'PRODUCTOS': 'products',
                                    'CORE': 'core'
                                };
                                const globalFolder = folderMap[match[1]] || 'information';
                                filePath = path.join(path.dirname(agentFolderPath), '..', globalFolder, match[2]);
                            }
                        } else {
                            filePath = path.join(agentFolderPath, snap.fileName);
                        }

                        if (filePath && fs.existsSync(filePath)) {
                            try {
                                const content = fs.readFileSync(filePath, 'utf8');
                                const displayName = snap.fileName.replace(/\[GLOBAL:\w+\] /, '');
                                const sourceLabel = snap.isGlobal ? '🌐 GLOBAL' : '📁 LOCAL';

                                systemPrompt += `\n┌─────────────────────────────────────────────────────────────────┐
│ ${sourceLabel}: ${displayName}
└─────────────────────────────────────────────────────────────────┘
${content}
───────────────────────────────────────────────────────────────────\n`;

                                loadedFiles.push(snap.fileName);
                            } catch (readErr) {
                                console.warn(`[AIService] Failed to read relevant file ${snap.fileName}:`, readErr);
                            }
                        }
                    }

                    // Track usage for analytics (fire and forget)
                    if (loadedFiles.length > 0) {
                        intelligenceService.recordSnapUsage(agentFolderPath, loadedFiles).catch(() => {});
                    }
                }

            } catch (e) { console.error('[AIService] Knowledge Snaps load failed:', e); }
        }

        // 2. Append Structural Objectives (Omnichannel Orchestrator Phase 3)
        if (options.objectives) {
            systemPrompt += `\n\n### CURRENT OPERATIONAL OBJECTIVES (COLUMN OVERRIDE):\n${options.objectives}\n`;
        }

        // 3. Inject Customer Context (Personalization Layer)
        if (options.customerContext) {
            const ctx = options.customerContext;
            systemPrompt += `\n\n### 👤 CONTEXTO DEL CLIENTE ACTUAL:\n`;

            if (ctx.name) systemPrompt += `- **Nombre:** ${ctx.name}\n`;
            if (ctx.phone) systemPrompt += `- **Teléfono:** ${ctx.phone}\n`;
            if (ctx.email) systemPrompt += `- **Email:** ${ctx.email}\n`;
            if (ctx.ltv !== undefined) systemPrompt += `- **LTV (Valor Total):** $${ctx.ltv} MXN\n`;
            if (ctx.tags && ctx.tags.length > 0) systemPrompt += `- **Tags:** ${ctx.tags.join(', ')}\n`;

            // Pending Orders - CRITICAL for "¿Cómo va mi pedido?"
            if (ctx.pendingOrders && ctx.pendingOrders.length > 0) {
                systemPrompt += `\n#### 📦 PEDIDOS PENDIENTES (En Tránsito):\n`;
                systemPrompt += `**IMPORTANTE:** Si el cliente pregunta por su pedido, usa esta información directamente SIN pedir el número de orden.\n\n`;

                for (const order of ctx.pendingOrders) {
                    systemPrompt += `- **${order.order_number}** - $${order.total} MXN\n`;
                    systemPrompt += `  - Estado: ${order.fulfillment_status || 'Procesando'}\n`;
                    systemPrompt += `  - Fecha: ${new Date(order.created_at).toLocaleDateString('es-MX')}\n`;
                    systemPrompt += `  - Productos: ${order.items.join(', ')}\n`;
                    if (order.tracking_number) {
                        systemPrompt += `  - Guía: ${order.tracking_number}\n`;
                        if (order.tracking_url) systemPrompt += `  - Rastreo: ${order.tracking_url}\n`;
                    }
                    systemPrompt += `\n`;
                }
            } else {
                systemPrompt += `\n#### 📦 PEDIDOS PENDIENTES: Ninguno en tránsito.\n`;
            }

            // Recent completed orders
            if (ctx.recentOrders && ctx.recentOrders.length > 0) {
                systemPrompt += `\n#### 🛍️ ÚLTIMOS PEDIDOS COMPLETADOS:\n`;
                for (const order of ctx.recentOrders.slice(0, 3)) {
                    systemPrompt += `- ${order.order_number} - $${order.total} MXN (${new Date(order.created_at).toLocaleDateString('es-MX')})\n`;
                }
            }

            systemPrompt += `\n`;
        }

        // 4. Prepare Messages for chat
        const messages = [...history, { role: 'user', content: message }];

        // 4. Call Chat with tools and whitelist
        return this.generateChatWithTools(systemPrompt, messages, modelOverride, options.toolsWhitelist);
    }

    /**
     * Advanced chat with tool support (recursive tool calling)
     */
    public async generateChatWithTools(
        systemPrompt: string,
        messages: any[], // Full history
        modelOverride?: string, // Allow changing model
        toolsWhitelist?: string[] // Optional: filter tools available for this call
    ): Promise<AIResponse> {
        const model = modelOverride || MODEL;

        // Filter tools if whitelist provided
        let availableTools = ADMIN_TOOLS;
        if (toolsWhitelist && toolsWhitelist.length > 0) {
            availableTools = ADMIN_TOOLS.filter(t => toolsWhitelist.includes(t.function.name));
            console.log(`[AIService] Tools whitelisted for this call (${model}): ${toolsWhitelist.join(', ')}`);
        }

        if (model.startsWith('gemini')) {
            return this.generateGeminiChatWithTools(systemPrompt, messages, model, availableTools);
        }

        // OpenAI Tool Logic (Existing)
        if (!model.startsWith('gpt')) {
            console.warn(`[AIService] Tools not supported for model ${model}. Falling back to standard chat.`);
            const lastMessage = messages[messages.length - 1].content;
            const historyText = messages.slice(0, -1).map(m => `${m.role}: ${m.content}`).join('\n');
            const fullPrompt = `Previous History:\n${historyText}\n\nLast User Message: ${lastMessage}`;
            return this.generateText(systemPrompt, fullPrompt, model);
        }

        const safeMessages = messages.filter(m => !m.content?.startsWith('Error:'));

        const conversation: any[] = [
            { role: 'system', content: systemPrompt },
            ...safeMessages
        ];

        try {
            let response = await openai.chat.completions.create({
                model: model,
                messages: conversation,
                tools: availableTools && availableTools.length > 0 ? (availableTools as any) : undefined,
                tool_choice: availableTools && availableTools.length > 0 ? 'auto' : undefined,
            });

            let responseMessage = response.choices[0].message;

            // Handle tool calls
            if (responseMessage.tool_calls) {
                conversation.push(responseMessage);

                for (const toolCall of responseMessage.tool_calls) {
                    const functionName = (toolCall as any).function.name;
                    const functionArgs = JSON.parse((toolCall as any).function.arguments);

                    console.log(`[AIService] 🛠️ Executing tool (OpenAI): ${functionName}`, functionArgs);

                    const handler = TOOL_HANDLERS[functionName];
                    let functionResponse = 'Tool not found';

                    if (handler) {
                        try {
                            const result = await handler(functionArgs);
                            functionResponse = JSON.stringify(result);
                        } catch (err: any) {
                            functionResponse = `Error: ${err.message}`;
                        }
                    }

                    conversation.push({
                        tool_call_id: toolCall.id,
                        role: 'tool',
                        name: functionName,
                        content: functionResponse,
                    });
                }

                // Get final response from AI using tool results
                const secondResponse = await openai.chat.completions.create({
                    model: model,
                    messages: conversation,
                    tools: availableTools && availableTools.length > 0 ? (availableTools as any) : undefined,
                    tool_choice: availableTools && availableTools.length > 0 ? 'auto' : undefined,
                });

                if (secondResponse.usage) {
                    AIUsageService.getInstance().logUsage(
                        model,
                        secondResponse.usage.prompt_tokens,
                        secondResponse.usage.completion_tokens,
                        { type: 'chat_tools_step_2' }
                    );
                }

                // Parse confidence from tool response
                const { cleanContent: toolCleanContent, confidence: toolConfidence } = parseConfidence(secondResponse.choices[0].message.content);

                return {
                    content: toolCleanContent,
                    usage: secondResponse.usage,
                    confidence: toolConfidence
                };
            }

            if (response.usage) {
                AIUsageService.getInstance().logUsage(
                    model,
                    response.usage.prompt_tokens,
                    response.usage.completion_tokens,
                    { type: 'chat_tools_step_1' }
                );
            }

            // Parse confidence from direct response
            const { cleanContent: directCleanContent, confidence: directConfidence } = parseConfidence(responseMessage.content);

            return {
                content: directCleanContent,
                usage: response.usage,
                confidence: directConfidence
            };

        } catch (error: any) {
            console.error('[AIService] generateChatWithTools (OpenAI) failed:', error.message);
            throw error;
        }
    }

    /**
     * Google Gemini Tool Calling Implementation
     */
    private async generateGeminiChatWithTools(
        systemPrompt: string,
        messages: any[],
        model: string,
        overrideTools?: any[]
    ): Promise<AIResponse> {
        try {
            // Recursive helper for Gemini parameters
            const mapProperties = (props: any): any => {
                const mapped: any = {};
                for (const [key, val] of Object.entries(props)) {
                    const mappedVal: any = {
                        type: (val as any).type.toUpperCase(),
                        description: (val as any).description
                    };

                    if ((val as any).type === 'array' && (val as any).items) {
                        mappedVal.items = mapProperties({ item: (val as any).items }).item;
                    } else if ((val as any).type === 'object' && (val as any).properties) {
                        mappedVal.properties = mapProperties((val as any).properties);
                        mappedVal.required = (val as any).required;
                    }

                    mapped[key] = mappedVal;
                }
                return mapped;
            };

            // Map format tools to Gemini format (use overrideTools if provided)
            const sourceTools = overrideTools || ADMIN_TOOLS;
            const geminiTools = [
                {
                    functionDeclarations: sourceTools.map((t: any) => ({
                        name: t.function.name,
                        description: t.function.description,
                        parameters: {
                            type: "OBJECT",
                            properties: mapProperties(t.function.parameters.properties),
                            required: t.function.parameters.required
                        }
                    }))
                }
            ];

            const genModel = this.googleAI.getGenerativeModel({
                model: model,
                systemInstruction: systemPrompt,
                tools: geminiTools as any
            });

            // Map history to Gemini format (filtering out errors)
            const history = messages.slice(0, -1)
                .filter(m => !m.content?.startsWith('Error:'))
                .map(m => ({
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: m.content }]
                }));

            const chat = genModel.startChat({ history });
            const lastMessage = messages[messages.length - 1].content;

            let result = await chat.sendMessage(lastMessage);
            let response = result.response;

            const MAX_TOOL_STEPS = 5;
            let toolStepCount = 0;

            while (response && response.functionCalls && (response.functionCalls() || []).length > 0 && toolStepCount < MAX_TOOL_STEPS) {
                toolStepCount++;
                const calls = response.functionCalls() || [];
                const toolResults = [];

                for (const call of calls) {
                    console.log(`[AIService] 🛠️ Executing tool (Gemini) [Step ${toolStepCount}]: ${call.name}`, call.args);
                    const handler = TOOL_HANDLERS[call.name];
                    let functionResponse;

                    if (handler) {
                        try {
                            const data = await handler(call.args);
                            functionResponse = data;
                        } catch (err: any) {
                            functionResponse = { error: err.message };
                        }
                    } else {
                        functionResponse = { error: 'Tool not found' };
                    }

                    toolResults.push({
                        functionResponse: {
                            name: call.name,
                            response: { content: functionResponse }
                        }
                    });
                }

                // Send tool results back to get final text
                const secondResult = await chat.sendMessage(toolResults);
                const secondResponse = secondResult.response;

                // Update response for the next iteration of the loop
                response = secondResponse;
            }

            const finalContent = response.text();
            console.log(`[AIService] Gemini Final Content (length): ${finalContent.length}`);

            // Parse confidence from Gemini response
            const { cleanContent: geminiCleanContent, confidence: geminiConfidence } = parseConfidence(finalContent);

            return {
                content: geminiCleanContent || 'Lo siento, obtuve los datos pero no pude generar un resumen detallado. ¿Deseas que intente algo específico?',
                usage: undefined,
                confidence: geminiConfidence
            };

        } catch (error: any) {
            console.error('[AIService] generateGeminiChatWithTools failed:', error.message);
            throw error;
        }
    }

    /**
     * JSON classification
     */
    public async classify(context: string, text: string): Promise<any> {
        const completion = await openai.chat.completions.create({
            messages: [
                { role: 'system', content: `JSON ONLY. ${context}` },
                { role: 'user', content: text },
            ],
            model: MODEL,
            response_format: { type: 'json_object' },
            temperature: 0,
        });
        return JSON.parse(completion.choices[0].message.content || '{}');
    }

    /**
     * Analyze image using Gemini (Multimodal)
     */
    public async analyzeImage(prompt: string, imageBuffer: Buffer, mimeType: string): Promise<string> {
        try {
            const model = this.googleAI.getGenerativeModel({ model: "gemini-1.5-flash" });

            const result = await model.generateContent([
                prompt,
                {
                    inlineData: {
                        data: imageBuffer.toString('base64'),
                        mimeType
                    }
                }
            ]);

            const response = result.response;
            return response.text();
        } catch (error: any) {
            console.error('[AIService] analyzeImage failed:', error.message);
            throw error;
        }
    }

    /**
     * Generate Embeddings
     * Uses OpenAI text-embedding-3-small by default
     */
    public async generateEmbedding(text: string): Promise<number[]> {
        try {
            const response = await openai.embeddings.create({
                model: 'text-embedding-3-small',
                input: text,
                encoding_format: 'float',
            });

            return response.data[0].embedding;
        } catch (error: any) {
            console.error('[AIService] generateEmbedding failed:', error.message);
            throw error;
        }
    }
}
