import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export interface Message {
    id: string;
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
    timestamp: string;
    metadata?: any;
}

export interface Conversation {
    id: string;
    userId: string; // "super_admin" or actual ID
    title: string;
    model: string;
    createdAt: string;
    updatedAt: string;
    messages: Message[];
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

    public addMessage(conversationId: string, role: 'user' | 'assistant' | 'system' | 'tool', content: string): Message | null {
        const conversation = this.getConversation(conversationId);
        if (!conversation) return null;

        const now = new Date().toISOString();
        const message: Message = {
            id: crypto.randomUUID(),
            role,
            content,
            timestamp: now
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
}
