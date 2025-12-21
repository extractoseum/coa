import fs from 'fs';
import path from 'path';

export interface AIUsageRecord {
    id: string;
    timestamp: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cost: number;
    context?: any;
}

const PRICING: Record<string, { input: number; output: number }> = {
    'gpt-4o': { input: 5.00, output: 15.00 }, // Per 1M tokens
    'gpt-4-turbo': { input: 10.00, output: 30.00 },
    'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
    'claude-3-5-sonnet': { input: 3.00, output: 15.00 },
    'gemini-1.5-pro': { input: 3.50, output: 10.50 },
    // Fallback defaults roughly gpt-4o
    'default': { input: 5.00, output: 15.00 }
};

export class AIUsageService {
    private static instance: AIUsageService;
    private logFilePath: string;

    private constructor() {
        // Ensure data directory exists
        const dataDir = path.join(__dirname, '../../data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.logFilePath = path.join(dataDir, 'ai_usage.jsonl');
    }

    public static getInstance(): AIUsageService {
        if (!AIUsageService.instance) {
            AIUsageService.instance = new AIUsageService();
        }
        return AIUsageService.instance;
    }

    public logUsage(model: string, inputTokens: number, outputTokens: number, context: any = {}): AIUsageRecord {
        const pricing = PRICING[model] || PRICING['default'];

        // Calculate cost (Prices are per 1M tokens)
        const costInput = (inputTokens / 1_000_000) * pricing.input;
        const costOutput = (outputTokens / 1_000_000) * pricing.output;
        const totalCost = costInput + costOutput;

        const record: AIUsageRecord = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            model,
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
            cost: totalCost,
            context
        };

        // Append to JSONL file
        fs.appendFileSync(this.logFilePath, JSON.stringify(record) + '\n');

        return record;
    }

    public getStats(): { totalCost: number; totalTokens: number; recentLogs: AIUsageRecord[] } {
        if (!fs.existsSync(this.logFilePath)) {
            return { totalCost: 0, totalTokens: 0, recentLogs: [] };
        }

        const stats = {
            totalCost: 0,
            totalTokens: 0
        };

        const logs: AIUsageRecord[] = [];

        const content = fs.readFileSync(this.logFilePath, 'utf-8');
        const lines = content.split('\n');

        lines.forEach(line => {
            if (line.trim()) {
                try {
                    const record = JSON.parse(line);
                    stats.totalCost += record.cost || 0;
                    stats.totalTokens += record.totalTokens || 0;
                    logs.push(record);
                } catch (e) {
                    // Ignore parsing errors
                }
            }
        });

        // Return stats and last 50 logs
        return {
            ...stats,
            recentLogs: logs.reverse().slice(0, 50)
        };
    }
}
