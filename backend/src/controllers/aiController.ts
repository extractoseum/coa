
import { Request, Response } from 'express';
import { AIService } from '../services/aiService';
import { AIUsageService } from '../services/aiUsageService';
import { AIConversationService } from '../services/aiConversationService';
import { ARA_SYSTEM_PROMPT } from '../config/ara_persona';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/Logger';

export const classifyMessage = async (req: Request, res: Response): Promise<void> => {
    try {
        const { message, context } = req.body;

        if (!message) {
            res.status(400).json({ success: false, error: 'Message is required' });
            return;
        }

        const aiService = AIService.getInstance();

        // System prompt designed for classification
        // We instruct Ara to act as a Tier 2 Support agent classifier.
        const systemInstruction = `
            ${ARA_SYSTEM_PROMPT}

            Context about the user: ${JSON.stringify(context || {})}
        `;

        const result = await aiService.classify(systemInstruction, message);

        res.json({
            success: true,
            data: result
        });

    } catch (error: any) {
        logger.error('[AIController] Classification error:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'AI processing failed' });
    }
};

/**
 * Chat with Ara using a specific persona
 */

const AGENT_PATHS: Record<string, string> = {
    'admin_assistant': 'admin_sidekick',
    'ara_optimized': 'sales_ara',
    'sales_agent': 'sales_ara',
    'support_agent': 'support_rep',
    'campaign_advisor': 'marketing_advisor'
};

export const chatWithAra = async (req: Request, res: Response): Promise<void> => {
    try {
        const { message, persona, history, fullContext, conversationId, model } = req.body;

        if (!message) {
            res.status(400).json({ success: false, error: 'Message is required' });
            return;
        }

        const aiService = AIService.getInstance();
        const convService = AIConversationService.getInstance();

        // 1. If it's a follow-up, save the user message
        if (conversationId && history && history.length > 0) {
            const conversation = convService.getConversation(conversationId);
            if (conversation && conversation.messages.length > 0) {
                convService.addMessage(conversationId, 'user', message);
            }
        }

        // Determine System Prompt
        let systemInstruction = ARA_SYSTEM_PROMPT;

        // Force 'data' directory outside of 'dist' to survive deployments
        const KNOWLEDGE_BASE_DIR = path.join(__dirname, '../../data/ai_knowledge_base');

        // Resolve Persona -> Folder Name
        const requestedPersona = persona || 'sales_ara';
        const agentFolder = AGENT_PATHS[requestedPersona] || requestedPersona;

        // Security: Prevent path traversal
        const safeFolder = path.basename(agentFolder);

        // Path to specific agent folder
        const AGENT_CATEGORIES = ['agents_god_mode', 'agents_public', 'agents_internal'];
        let agentFolderPath = '';
        let foundCategory = '';

        for (const cat of AGENT_CATEGORIES) {
            const checkPath = path.join(KNOWLEDGE_BASE_DIR, cat, safeFolder);
            if (fs.existsSync(checkPath) && fs.lstatSync(checkPath).isDirectory()) {
                agentFolderPath = checkPath;
                foundCategory = cat;
                break;
            }
        }

        // Legacy fallback
        if (!agentFolderPath) {
            const legacyPath = path.join(KNOWLEDGE_BASE_DIR, 'agents', safeFolder);
            if (fs.existsSync(legacyPath)) {
                agentFolderPath = legacyPath;
            }
        }

        if (agentFolderPath) {
            // It is a folder! Read identity.md first
            const identityPath = path.join(agentFolderPath, 'identity.md');
            if (fs.existsSync(identityPath)) {
                systemInstruction = fs.readFileSync(identityPath, 'utf-8') + '\n\n';
            } else {
                logger.warn(`[AIController] Agent ${safeFolder} has no identity.md. Action blocked.`, null, { correlation_id: req.correlationId });
                res.status(403).json({
                    success: false,
                    error: `Agente no configurado: Falta instructivo principal (identity.md) en ${safeFolder}.`
                });
                return;
            }

            try {
                // OPTIMIZED LOADING Pattern (Mirrors AIService):
                // Read other files and build a Knowledge Catalog (summaries only)
                // This prevents the Admin chat from hitting context limits with large KBs
                const files = fs.readdirSync(agentFolderPath).filter(f => f.endsWith('.md') && f !== 'identity.md');

                // Read metadata to get intelligence-powered summaries
                const metaPath = path.join(agentFolderPath, 'metadata.json');
                let metadata: any = { files: {} };
                if (fs.existsSync(metaPath)) {
                    try {
                        metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    } catch (e: any) {
                        logger.warn(`[AIController] Failed to parse metadata at ${metaPath}:`, e.message, { correlation_id: req.correlationId });
                    }
                }

                if (files.length > 0) {
                    systemInstruction += `\n### CATÁLOGO DE CONOCIMIENTO DISPONIBLE:\n`;
                    systemInstruction += `Actualmente tienes acceso a los siguientes archivos. NO los has leído completos (excepto el instructivo principal arriba), pero conoces su propósito. Si necesitas información específica de alguno, usa la herramienta 'read_file_content' o 'search_knowledge_base':\n\n`;

                    for (const f of files) {
                        const summary = metadata.files?.[f]?.summary || "Sin resumen disponible (pendiente de análisis).";
                        systemInstruction += `- [${f}]: ${summary}\n`;
                    }
                    systemInstruction += `\n`;
                }

                logger.info(`[AIController] Loaded AGENT: ${safeFolder} from ${foundCategory || 'legacy'} (Summaries for ${files.length} files)`, { correlation_id: req.correlationId });

            } catch (err) {
                logger.error(`[AIController] Failed to load extra files for ${safeFolder}:`, err, { correlation_id: req.correlationId });
            }
        } else {
            logger.warn(`[AIController] Agent folder not found: ${safeFolder}. Using default.`, null, { correlation_id: req.correlationId });
            // Fallback to legacy or default
        }

        // Admin check logic
        const isAdminAssistant = safeFolder === 'admin_sidekick';

        // Prepare messages for history support
        const messagesToAI = [];
        if (history && Array.isArray(history)) {
            messagesToAI.push(...history);
        }
        messagesToAI.push({ role: 'user', content: message });

        let result;
        if (isAdminAssistant) {
            // Admin gets tool access
            result = await aiService.generateChatWithTools(systemInstruction, messagesToAI, model);
        } else {
            // Standard one-shot or history chat for others (no tools)
            // Concatenate history for standard text if not using multi-turn yet
            let fullMessage = message;
            if (history && Array.isArray(history) && history.length > 0) {
                const historyText = history.map((h: any) => `${h.role}: ${h.content}`).join('\n');
                fullMessage = `Previous conversation:\n${historyText}\n\nCurrent user message: ${message}`;
            }
            result = await aiService.generateText(systemInstruction, fullMessage, model);
        }

        // 2. Save the assistant response
        if (conversationId && result.content) {
            convService.addMessage(conversationId, 'assistant', result.content);
        }

        res.json({
            success: true,
            data: result
        });

    } catch (error: any) {
        logger.error('[AIController] Chat error:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: error.message || 'AI chat failed' });
    }
};
export const getUsageStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const aiUsageService = AIUsageService.getInstance();
        const stats = aiUsageService.getStats();

        res.json({
            success: true,
            data: stats
        });
    } catch (error: any) {
        logger.error('[AIController] Usage stats error:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Failed to fetch usage stats' });
    }
};

export const checkModelsStatus = async (req: Request, res: Response): Promise<void> => {
    try {
        const { models } = req.body;
        if (!models || !Array.isArray(models)) {
            res.status(400).json({ success: false, error: 'Models array is required' });
            return;
        }

        const aiService = AIService.getInstance();
        const results = await Promise.all(models.map(async (m: any) => {
            const status = await aiService.checkModelAvailability(m.id);
            return { id: m.id, ...status };
        }));

        res.json({
            success: true,
            data: results
        });
    } catch (error: any) {
        logger.error('[AIController] Status check error:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Status check failed' });
    }
};
