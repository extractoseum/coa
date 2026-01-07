import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Phase 5: Feedback types
export interface MessageFeedback {
    rating: 'positive' | 'negative' | null;
    correction?: string;           // User-provided correction text
    feedbackBy: string;            // userId who gave feedback
    feedbackAt: string;            // Timestamp
    processed?: boolean;           // Whether feedback was used to update snaps
}

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: string;
    metadata?: any;
    confidence?: 'high' | 'medium' | 'low'; // Phase 4: AI confidence level
    feedback?: MessageFeedback;              // Phase 5: User feedback on this message
}

export type ConversationOutcome = 'sale' | 'resolution' | 'escalation' | 'churn' | 'pending' | null;

export interface Conversation {
    id: string;
    userId: string; // "super_admin" or actual ID
    title: string;
    model: string;
    createdAt: string;
    updatedAt: string;
    messages: Message[];

    // Phase 3: Outcome Tracking
    agentUsed?: string;              // Which agent handled the conversation
    snapsUsed?: string[];            // Which snaps were included in context
    outcome?: ConversationOutcome;    // Final outcome of conversation
    outcomeValue?: number;           // Revenue value if outcome=sale
    outcomeNotes?: string;           // Admin notes about outcome
    outcomeSetBy?: string;           // userId who marked the outcome
    outcomeSetAt?: string;           // Timestamp when outcome was set
}

export class AIConversationService {
    private static instance: AIConversationService;
    private dataDir: string;

    private constructor() {
        // Ensure data directory exists
        const baseDir = path.join(__dirname, '../../data');
        this.dataDir = path.join(baseDir, 'conversations');

        if (!fs.existsSync(baseDir)) {
            fs.mkdirSync(baseDir, { recursive: true });
        }
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
    }

    public static getInstance(): AIConversationService {
        if (!AIConversationService.instance) {
            AIConversationService.instance = new AIConversationService();
        }
        return AIConversationService.instance;
    }

    private getFilePath(conversationId: string): string {
        return path.join(this.dataDir, `${conversationId}.json`);
    }

    public createConversation(userId: string, model: string, initialMessage?: string): Conversation {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        const conversation: Conversation = {
            id,
            userId,
            title: initialMessage ? initialMessage.substring(0, 30) + '...' : 'New Conversation',
            model,
            createdAt: now,
            updatedAt: now,
            messages: []
        };

        if (initialMessage) {
            conversation.messages.push({
                id: crypto.randomUUID(),
                role: 'user',
                content: initialMessage,
                timestamp: now
            });
        }

        fs.writeFileSync(this.getFilePath(id), JSON.stringify(conversation, null, 2));
        return conversation;
    }

    public getConversations(userId: string): Conversation[] {
        if (!fs.existsSync(this.dataDir)) return [];

        const files = fs.readdirSync(this.dataDir);
        const conversations: Conversation[] = [];

        files.forEach(file => {
            if (file.endsWith('.json')) {
                try {
                    const content = fs.readFileSync(path.join(this.dataDir, file), 'utf-8');
                    const conv = JSON.parse(content);
                    // Filter by user (basic check)
                    if (conv.userId === userId || !conv.userId) {
                        // Don't send full messages list for summary to save bandwidth
                        const { messages, ...summary } = conv;
                        conversations.push(summary as Conversation);
                    }
                } catch (e) {
                    console.error(`Failed to read conversation ${file}`);
                }
            }
        });

        // Sort by updated desc
        return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    public getConversation(id: string): Conversation | null {
        const filePath = this.getFilePath(id);
        if (!fs.existsSync(filePath)) return null;

        try {
            return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        } catch (e) {
            return null;
        }
    }

    public addMessage(
        conversationId: string,
        role: 'user' | 'assistant' | 'system' | 'tool',
        content: string,
        confidence?: 'high' | 'medium' | 'low'
    ): Message | null {
        const conversation = this.getConversation(conversationId);
        if (!conversation) return null;

        const now = new Date().toISOString();
        const message: Message = {
            id: crypto.randomUUID(),
            role,
            content,
            timestamp: now,
            confidence: confidence || undefined
        };

        conversation.messages.push(message);
        conversation.updatedAt = now;

        // Auto-update title if it's the first user message and title is default
        if (role === 'user' && conversation.messages.filter(m => m.role === 'user').length === 1) {
            conversation.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
        }

        fs.writeFileSync(this.getFilePath(conversationId), JSON.stringify(conversation, null, 2));
        return message;
    }

    public deleteConversation(id: string): boolean {
        const filePath = this.getFilePath(id);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            return true;
        }
        return false;
    }

    /**
     * Update the agent and snaps used in a conversation
     */
    public updateAgentContext(conversationId: string, agentUsed: string, snapsUsed: string[]): boolean {
        const conversation = this.getConversation(conversationId);
        if (!conversation) return false;

        conversation.agentUsed = agentUsed;
        conversation.snapsUsed = snapsUsed;
        conversation.updatedAt = new Date().toISOString();

        fs.writeFileSync(this.getFilePath(conversationId), JSON.stringify(conversation, null, 2));
        return true;
    }

    /**
     * Set the outcome of a conversation
     */
    public setOutcome(
        conversationId: string,
        outcome: ConversationOutcome,
        setBy: string,
        value?: number,
        notes?: string
    ): boolean {
        const conversation = this.getConversation(conversationId);
        if (!conversation) return false;

        const now = new Date().toISOString();
        conversation.outcome = outcome;
        conversation.outcomeSetBy = setBy;
        conversation.outcomeSetAt = now;
        conversation.updatedAt = now;

        if (value !== undefined) conversation.outcomeValue = value;
        if (notes !== undefined) conversation.outcomeNotes = notes;

        fs.writeFileSync(this.getFilePath(conversationId), JSON.stringify(conversation, null, 2));
        return true;
    }

    /**
     * Get conversations that need outcome marking (no outcome set)
     */
    public getPendingOutcomes(limit: number = 50): Conversation[] {
        if (!fs.existsSync(this.dataDir)) return [];

        const files = fs.readdirSync(this.dataDir);
        const pending: Conversation[] = [];

        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            if (pending.length >= limit) break;

            try {
                const content = fs.readFileSync(path.join(this.dataDir, file), 'utf-8');
                const conv: Conversation = JSON.parse(content);

                // Include if no outcome set and has at least 2 messages (user + assistant)
                if (!conv.outcome && conv.messages && conv.messages.length >= 2) {
                    pending.push(conv);
                }
            } catch (e) {
                console.error(`Failed to read conversation ${file}`);
            }
        }

        // Sort by updated desc
        return pending.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }

    /**
     * Get outcome statistics
     */
    public getOutcomeStats(): {
        total: number;
        byOutcome: Record<string, number>;
        totalRevenue: number;
        pendingCount: number;
    } {
        if (!fs.existsSync(this.dataDir)) {
            return { total: 0, byOutcome: {}, totalRevenue: 0, pendingCount: 0 };
        }

        const files = fs.readdirSync(this.dataDir);
        const stats = {
            total: 0,
            byOutcome: {} as Record<string, number>,
            totalRevenue: 0,
            pendingCount: 0
        };

        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            try {
                const content = fs.readFileSync(path.join(this.dataDir, file), 'utf-8');
                const conv: Conversation = JSON.parse(content);

                stats.total++;

                if (conv.outcome) {
                    stats.byOutcome[conv.outcome] = (stats.byOutcome[conv.outcome] || 0) + 1;
                    if (conv.outcome === 'sale' && conv.outcomeValue) {
                        stats.totalRevenue += conv.outcomeValue;
                    }
                } else if (conv.messages && conv.messages.length >= 2) {
                    stats.pendingCount++;
                }
            } catch (e) { }
        }

        return stats;
    }

    /**
     * Phase 5: Add feedback to a specific message
     */
    public addMessageFeedback(
        conversationId: string,
        messageId: string,
        rating: 'positive' | 'negative',
        feedbackBy: string,
        correction?: string
    ): boolean {
        const conversation = this.getConversation(conversationId);
        if (!conversation) return false;

        const message = conversation.messages.find(m => m.id === messageId);
        if (!message) return false;

        message.feedback = {
            rating,
            correction: correction || undefined,
            feedbackBy,
            feedbackAt: new Date().toISOString(),
            processed: false
        };

        conversation.updatedAt = new Date().toISOString();
        fs.writeFileSync(this.getFilePath(conversationId), JSON.stringify(conversation, null, 2));
        return true;
    }

    /**
     * Phase 5: Mark feedback as processed
     */
    public markFeedbackProcessed(conversationId: string, messageId: string): boolean {
        const conversation = this.getConversation(conversationId);
        if (!conversation) return false;

        const message = conversation.messages.find(m => m.id === messageId);
        if (!message || !message.feedback) return false;

        message.feedback.processed = true;
        fs.writeFileSync(this.getFilePath(conversationId), JSON.stringify(conversation, null, 2));
        return true;
    }

    /**
     * Phase 5: Get all unprocessed feedback for learning
     */
    public getUnprocessedFeedback(limit: number = 100): Array<{
        conversationId: string;
        messageId: string;
        message: Message;
        agentUsed?: string;
        snapsUsed?: string[];
    }> {
        if (!fs.existsSync(this.dataDir)) return [];

        const files = fs.readdirSync(this.dataDir);
        const results: Array<{
            conversationId: string;
            messageId: string;
            message: Message;
            agentUsed?: string;
            snapsUsed?: string[];
        }> = [];

        for (const file of files) {
            if (!file.endsWith('.json') || results.length >= limit) continue;

            try {
                const content = fs.readFileSync(path.join(this.dataDir, file), 'utf-8');
                const conv: Conversation = JSON.parse(content);

                for (const msg of conv.messages) {
                    if (msg.feedback && !msg.feedback.processed) {
                        results.push({
                            conversationId: conv.id,
                            messageId: msg.id,
                            message: msg,
                            agentUsed: conv.agentUsed,
                            snapsUsed: conv.snapsUsed
                        });

                        if (results.length >= limit) break;
                    }
                }
            } catch (e) { }
        }

        return results;
    }

    /**
     * Phase 5: Get feedback statistics
     */
    public getFeedbackStats(): {
        totalFeedback: number;
        positive: number;
        negative: number;
        withCorrections: number;
        unprocessed: number;
    } {
        if (!fs.existsSync(this.dataDir)) {
            return { totalFeedback: 0, positive: 0, negative: 0, withCorrections: 0, unprocessed: 0 };
        }

        const files = fs.readdirSync(this.dataDir);
        const stats = {
            totalFeedback: 0,
            positive: 0,
            negative: 0,
            withCorrections: 0,
            unprocessed: 0
        };

        for (const file of files) {
            if (!file.endsWith('.json')) continue;

            try {
                const content = fs.readFileSync(path.join(this.dataDir, file), 'utf-8');
                const conv: Conversation = JSON.parse(content);

                for (const msg of conv.messages) {
                    if (msg.feedback) {
                        stats.totalFeedback++;
                        if (msg.feedback.rating === 'positive') stats.positive++;
                        if (msg.feedback.rating === 'negative') stats.negative++;
                        if (msg.feedback.correction) stats.withCorrections++;
                        if (!msg.feedback.processed) stats.unprocessed++;
                    }
                }
            } catch (e) { }
        }

        return stats;
    }
}
