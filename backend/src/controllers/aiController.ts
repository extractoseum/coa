
import { Request, Response } from 'express';
import { AIService } from '../services/aiService';
import { AIUsageService } from '../services/aiUsageService';
import { AIConversationService, ConversationOutcome, MessageFeedback } from '../services/aiConversationService';
import { IntelligenceService } from '../services/intelligenceService';
import { AgentPerformanceService } from '../services/AgentPerformanceService';
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

            // Track which snaps are used for this conversation
            let snapsUsedInContext: string[] = [];

            try {
                // Use IntelligenceService to get knowledge snaps (auto-generated context)
                const intelligenceService = IntelligenceService.getInstance();
                const knowledgeSection = intelligenceService.generateInstructivoSnapsSection(agentFolderPath);

                // Append knowledge snaps to system instruction
                systemInstruction += knowledgeSection;

                // Also include legacy file catalog for backwards compatibility
                const files = fs.readdirSync(agentFolderPath).filter(f => f.endsWith('.md') && f !== 'identity.md');

                // Read metadata to get intelligence-powered summaries
                const metaPath = path.join(agentFolderPath, 'metadata.json');
                let metadata: any = { files: {}, knowledgeSnaps: [] };
                if (fs.existsSync(metaPath)) {
                    try {
                        metadata = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
                    } catch (e: any) {
                        logger.warn(`[AIController] Failed to parse metadata at ${metaPath}:`, e.message, { correlation_id: req.correlationId });
                    }
                }

                // Track snaps used in context
                if (metadata.knowledgeSnaps && metadata.knowledgeSnaps.length > 0) {
                    snapsUsedInContext = metadata.knowledgeSnaps.map((s: any) => s.fileName);

                    // Record snap usage for analytics
                    await intelligenceService.recordSnapUsage(agentFolderPath, snapsUsedInContext);
                }

                // Only show legacy catalog if no snaps exist
                if (files.length > 0 && (!metadata.knowledgeSnaps || metadata.knowledgeSnaps.length === 0)) {
                    systemInstruction += `\n### CATÁLOGO DE CONOCIMIENTO DISPONIBLE:\n`;
                    systemInstruction += `Actualmente tienes acceso a los siguientes archivos. NO los has leído completos (excepto el instructivo principal arriba), pero conoces su propósito. Si necesitas información específica de alguno, usa la herramienta 'read_file_content' o 'search_knowledge_base':\n\n`;

                    for (const f of files) {
                        const summary = metadata.files?.[f]?.summary || "Sin resumen disponible (pendiente de análisis).";
                        systemInstruction += `- [${f}]: ${summary}\n`;
                    }
                    systemInstruction += `\n`;
                }

                const snapCount = metadata.knowledgeSnaps?.length || 0;
                logger.info(`[AIController] Loaded AGENT: ${safeFolder} from ${foundCategory || 'legacy'} (${snapCount} snaps, ${files.length} files)`, { correlation_id: req.correlationId });

            } catch (err) {
                logger.error(`[AIController] Failed to load extra files for ${safeFolder}:`, err, { correlation_id: req.correlationId });
            }

            // Update conversation with agent context for outcome tracking
            if (conversationId) {
                convService.updateAgentContext(conversationId, safeFolder, snapsUsedInContext);
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

        // 2. Save the assistant response with confidence metadata
        if (conversationId && result.content) {
            convService.addMessage(conversationId, 'assistant', result.content, result.confidence || undefined);
        }

        res.json({
            success: true,
            data: {
                ...result,
                confidence: result.confidence || null
            }
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

/**
 * Set conversation outcome
 */
export const setConversationOutcome = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId, outcome, value, notes } = req.body;
        const userId = (req as any).user?.id || 'unknown';

        if (!conversationId) {
            res.status(400).json({ success: false, error: 'conversationId is required' });
            return;
        }

        if (!outcome) {
            res.status(400).json({ success: false, error: 'outcome is required' });
            return;
        }

        const validOutcomes: ConversationOutcome[] = ['sale', 'resolution', 'escalation', 'churn', 'pending', null];
        if (!validOutcomes.includes(outcome)) {
            res.status(400).json({ success: false, error: 'Invalid outcome value' });
            return;
        }

        const convService = AIConversationService.getInstance();
        const conversation = convService.getConversation(conversationId);

        if (!conversation) {
            res.status(404).json({ success: false, error: 'Conversation not found' });
            return;
        }

        const success = convService.setOutcome(conversationId, outcome, userId, value, notes);

        if (success) {
            // Update effectiveness of snaps used in this conversation
            if (conversation.snapsUsed && conversation.snapsUsed.length > 0 && conversation.agentUsed) {
                const intelligenceService = IntelligenceService.getInstance();
                const KNOWLEDGE_BASE_DIR = path.join(__dirname, '../../data/ai_knowledge_base');
                const AGENT_CATEGORIES = ['agents_god_mode', 'agents_public', 'agents_internal'];

                // Find agent folder
                for (const cat of AGENT_CATEGORIES) {
                    const agentDir = path.join(KNOWLEDGE_BASE_DIR, cat, conversation.agentUsed);
                    if (fs.existsSync(agentDir)) {
                        const isPositive = outcome === 'sale' || outcome === 'resolution';
                        for (const snapFile of conversation.snapsUsed) {
                            await intelligenceService.updateSnapEffectiveness(agentDir, snapFile, isPositive);
                        }
                        break;
                    }
                }
            }

            res.json({ success: true, message: 'Outcome updated' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to update outcome' });
        }
    } catch (error: any) {
        logger.error('[AIController] Set outcome error:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Failed to set outcome' });
    }
};

/**
 * Get pending outcomes (conversations without outcome)
 */
export const getPendingOutcomes = async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const convService = AIConversationService.getInstance();
        const pending = convService.getPendingOutcomes(limit);

        res.json({
            success: true,
            data: pending
        });
    } catch (error: any) {
        logger.error('[AIController] Get pending outcomes error:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Failed to fetch pending outcomes' });
    }
};

/**
 * Get outcome statistics
 */
export const getOutcomeStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const convService = AIConversationService.getInstance();
        const stats = convService.getOutcomeStats();

        res.json({
            success: true,
            data: stats
        });
    } catch (error: any) {
        logger.error('[AIController] Get outcome stats error:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Failed to fetch outcome stats' });
    }
};

/**
 * Phase 5: Submit feedback for a message
 */
export const submitMessageFeedback = async (req: Request, res: Response): Promise<void> => {
    try {
        const { conversationId, messageId, rating, correction } = req.body;
        const userId = (req as any).user?.id || 'unknown';

        if (!conversationId || !messageId) {
            res.status(400).json({ success: false, error: 'conversationId and messageId are required' });
            return;
        }

        if (!rating || !['positive', 'negative'].includes(rating)) {
            res.status(400).json({ success: false, error: 'rating must be "positive" or "negative"' });
            return;
        }

        const convService = AIConversationService.getInstance();
        const conversation = convService.getConversation(conversationId);

        if (!conversation) {
            res.status(404).json({ success: false, error: 'Conversation not found' });
            return;
        }

        const success = convService.addMessageFeedback(conversationId, messageId, rating, userId, correction);

        if (success) {
            // Update snap effectiveness based on feedback
            if (conversation.snapsUsed && conversation.snapsUsed.length > 0 && conversation.agentUsed) {
                const intelligenceService = IntelligenceService.getInstance();
                const KNOWLEDGE_BASE_DIR = path.join(__dirname, '../../data/ai_knowledge_base');
                const AGENT_CATEGORIES = ['agents_god_mode', 'agents_public', 'agents_internal'];

                for (const cat of AGENT_CATEGORIES) {
                    const agentDir = path.join(KNOWLEDGE_BASE_DIR, cat, conversation.agentUsed);
                    if (fs.existsSync(agentDir)) {
                        const isPositive = rating === 'positive';
                        for (const snapFile of conversation.snapsUsed) {
                            await intelligenceService.updateSnapEffectiveness(agentDir, snapFile, isPositive);
                        }
                        break;
                    }
                }
            }

            // Mark feedback as processed
            convService.markFeedbackProcessed(conversationId, messageId);

            res.json({ success: true, message: 'Feedback recorded' });
        } else {
            res.status(404).json({ success: false, error: 'Message not found' });
        }
    } catch (error: any) {
        logger.error('[AIController] Submit feedback error:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Failed to submit feedback' });
    }
};

/**
 * Phase 5: Get unprocessed feedback for review
 */
export const getUnprocessedFeedback = async (req: Request, res: Response): Promise<void> => {
    try {
        const limit = parseInt(req.query.limit as string) || 50;
        const convService = AIConversationService.getInstance();
        const feedback = convService.getUnprocessedFeedback(limit);

        res.json({
            success: true,
            data: feedback
        });
    } catch (error: any) {
        logger.error('[AIController] Get unprocessed feedback error:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Failed to fetch feedback' });
    }
};

/**
 * Phase 5: Get feedback statistics
 */
export const getFeedbackStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const convService = AIConversationService.getInstance();
        const stats = convService.getFeedbackStats();

        res.json({
            success: true,
            data: stats
        });
    } catch (error: any) {
        logger.error('[AIController] Get feedback stats error:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Failed to fetch feedback stats' });
    }
};

/**
 * Phase 7: Get comprehensive agent performance dashboard metrics
 */
export const getAgentPerformanceDashboard = async (req: Request, res: Response): Promise<void> => {
    try {
        const performanceService = AgentPerformanceService.getInstance();
        const metrics = await performanceService.getDashboardMetrics();

        res.json({
            success: true,
            data: metrics
        });
    } catch (error: any) {
        logger.error('[AIController] Get agent performance error:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Failed to fetch agent performance metrics' });
    }
};

/**
 * Phase 7: Get quick agent stats summary
 */
export const getAgentQuickStats = async (req: Request, res: Response): Promise<void> => {
    try {
        const performanceService = AgentPerformanceService.getInstance();
        const stats = performanceService.getQuickStats();

        res.json({
            success: true,
            data: stats
        });
    } catch (error: any) {
        logger.error('[AIController] Get quick stats error:', error, { correlation_id: req.correlationId });
        res.status(500).json({ success: false, error: 'Failed to fetch quick stats' });
    }
};
