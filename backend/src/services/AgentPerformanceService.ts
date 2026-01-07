import fs from 'fs';
import path from 'path';
import { AIConversationService, Conversation } from './aiConversationService';
import { InquiryLearningService } from './InquiryLearningService';
import { logger } from '../utils/Logger';

/**
 * Phase 7: Agent Performance Dashboard Service
 * Aggregates metrics from conversations, outcomes, feedback, and inquiries
 */

export interface AgentMetrics {
    agentName: string;
    totalConversations: number;
    outcomes: Record<string, number>;
    successRate: number;         // (sale + resolution) / total with outcomes
    escalationRate: number;      // escalation / total with outcomes
    totalRevenue: number;
    avgConfidence: number;       // Average confidence of responses
    feedbackPositive: number;
    feedbackNegative: number;
    feedbackScore: number;       // positive / (positive + negative) * 100
    snapsUsed: Record<string, number>;  // Snap usage frequency
}

export interface SnapEffectiveness {
    snapName: string;
    usageCount: number;
    positiveOutcomes: number;     // sales + resolutions when snap was used
    negativeOutcomes: number;     // escalations + churns when snap was used
    effectivenessScore: number;   // (positive / total) * 100
    avgConfidence: number;
    feedbackPositive: number;
    feedbackNegative: number;
}

export interface DashboardMetrics {
    summary: {
        totalConversations: number;
        totalWithOutcomes: number;
        pendingOutcomes: number;
        overallSuccessRate: number;
        totalRevenue: number;
        avgResponseConfidence: number;
        feedbackScore: number;
    };
    byAgent: AgentMetrics[];
    snapEffectiveness: SnapEffectiveness[];
    confidenceDistribution: {
        high: number;
        medium: number;
        low: number;
        unknown: number;
    };
    outcomesTrend: Array<{
        date: string;
        sales: number;
        resolutions: number;
        escalations: number;
        churns: number;
    }>;
    inquiryLearning: {
        totalResolutions: number;
        byType: Record<string, number>;
        byAction: Record<string, number>;
        customResponseRate: number;
    };
}

export class AgentPerformanceService {
    private static instance: AgentPerformanceService;
    private conversationService: AIConversationService;

    private constructor() {
        this.conversationService = AIConversationService.getInstance();
    }

    public static getInstance(): AgentPerformanceService {
        if (!AgentPerformanceService.instance) {
            AgentPerformanceService.instance = new AgentPerformanceService();
        }
        return AgentPerformanceService.instance;
    }

    /**
     * Get all conversations with full data for analysis
     */
    private getAllConversations(): Conversation[] {
        const dataDir = path.join(__dirname, '../../data/conversations');
        if (!fs.existsSync(dataDir)) return [];

        const files = fs.readdirSync(dataDir);
        const conversations: Conversation[] = [];

        for (const file of files) {
            if (!file.endsWith('.json')) continue;
            try {
                const content = fs.readFileSync(path.join(dataDir, file), 'utf-8');
                conversations.push(JSON.parse(content));
            } catch (e) {
                // Skip invalid files
            }
        }

        return conversations;
    }

    /**
     * Main method: Get comprehensive dashboard metrics
     */
    public async getDashboardMetrics(): Promise<DashboardMetrics> {
        const conversations = this.getAllConversations();

        // Initialize summary
        const summary = {
            totalConversations: conversations.length,
            totalWithOutcomes: 0,
            pendingOutcomes: 0,
            overallSuccessRate: 0,
            totalRevenue: 0,
            avgResponseConfidence: 0,
            feedbackScore: 0
        };

        // Aggregation structures
        const agentStats: Record<string, AgentMetrics> = {};
        const snapStats: Record<string, SnapEffectiveness> = {};
        const confidenceDist = { high: 0, medium: 0, low: 0, unknown: 0 };
        const outcomesByDate: Record<string, { sales: number; resolutions: number; escalations: number; churns: number }> = {};

        let totalFeedbackPositive = 0;
        let totalFeedbackNegative = 0;
        let totalConfidenceSum = 0;
        let totalConfidenceCount = 0;

        // Process each conversation
        for (const conv of conversations) {
            const agent = conv.agentUsed || 'unknown';
            const snaps = conv.snapsUsed || [];
            const hasOutcome = !!conv.outcome;

            // Initialize agent stats if needed
            if (!agentStats[agent]) {
                agentStats[agent] = {
                    agentName: agent,
                    totalConversations: 0,
                    outcomes: {},
                    successRate: 0,
                    escalationRate: 0,
                    totalRevenue: 0,
                    avgConfidence: 0,
                    feedbackPositive: 0,
                    feedbackNegative: 0,
                    feedbackScore: 0,
                    snapsUsed: {}
                };
            }

            agentStats[agent].totalConversations++;

            // Track snaps for this agent
            for (const snap of snaps) {
                agentStats[agent].snapsUsed[snap] = (agentStats[agent].snapsUsed[snap] || 0) + 1;

                // Initialize snap stats
                if (!snapStats[snap]) {
                    snapStats[snap] = {
                        snapName: snap,
                        usageCount: 0,
                        positiveOutcomes: 0,
                        negativeOutcomes: 0,
                        effectivenessScore: 0,
                        avgConfidence: 0,
                        feedbackPositive: 0,
                        feedbackNegative: 0
                    };
                }
                snapStats[snap].usageCount++;
            }

            // Process outcome
            if (hasOutcome && conv.outcome) {
                summary.totalWithOutcomes++;
                agentStats[agent].outcomes[conv.outcome] = (agentStats[agent].outcomes[conv.outcome] || 0) + 1;

                if (conv.outcome === 'sale') {
                    summary.totalRevenue += conv.outcomeValue || 0;
                    agentStats[agent].totalRevenue += conv.outcomeValue || 0;
                    // Update snap positive outcomes
                    for (const snap of snaps) {
                        snapStats[snap].positiveOutcomes++;
                    }
                } else if (conv.outcome === 'resolution') {
                    for (const snap of snaps) {
                        snapStats[snap].positiveOutcomes++;
                    }
                } else if (conv.outcome === 'escalation' || conv.outcome === 'churn') {
                    for (const snap of snaps) {
                        snapStats[snap].negativeOutcomes++;
                    }
                }

                // Track by date for trend
                const date = conv.outcomeSetAt ? conv.outcomeSetAt.split('T')[0] : conv.updatedAt.split('T')[0];
                if (!outcomesByDate[date]) {
                    outcomesByDate[date] = { sales: 0, resolutions: 0, escalations: 0, churns: 0 };
                }
                if (conv.outcome === 'sale') outcomesByDate[date].sales++;
                else if (conv.outcome === 'resolution') outcomesByDate[date].resolutions++;
                else if (conv.outcome === 'escalation') outcomesByDate[date].escalations++;
                else if (conv.outcome === 'churn') outcomesByDate[date].churns++;
            } else if (conv.messages && conv.messages.length >= 2) {
                summary.pendingOutcomes++;
            }

            // Process messages for confidence and feedback
            for (const msg of conv.messages || []) {
                // Confidence
                if (msg.role === 'assistant') {
                    if (msg.confidence === 'high') {
                        confidenceDist.high++;
                        totalConfidenceSum += 100;
                        totalConfidenceCount++;
                    } else if (msg.confidence === 'medium') {
                        confidenceDist.medium++;
                        totalConfidenceSum += 60;
                        totalConfidenceCount++;
                    } else if (msg.confidence === 'low') {
                        confidenceDist.low++;
                        totalConfidenceSum += 30;
                        totalConfidenceCount++;
                    } else {
                        confidenceDist.unknown++;
                    }
                }

                // Feedback
                if (msg.feedback) {
                    if (msg.feedback.rating === 'positive') {
                        totalFeedbackPositive++;
                        agentStats[agent].feedbackPositive++;
                        for (const snap of snaps) {
                            snapStats[snap].feedbackPositive++;
                        }
                    } else if (msg.feedback.rating === 'negative') {
                        totalFeedbackNegative++;
                        agentStats[agent].feedbackNegative++;
                        for (const snap of snaps) {
                            snapStats[snap].feedbackNegative++;
                        }
                    }
                }
            }
        }

        // Calculate derived metrics
        summary.avgResponseConfidence = totalConfidenceCount > 0
            ? Math.round(totalConfidenceSum / totalConfidenceCount)
            : 0;

        const totalFeedback = totalFeedbackPositive + totalFeedbackNegative;
        summary.feedbackScore = totalFeedback > 0
            ? Math.round((totalFeedbackPositive / totalFeedback) * 100)
            : 0;

        // Calculate success rate
        let totalSuccesses = 0;
        let totalOutcomesCount = 0;
        for (const stats of Object.values(agentStats)) {
            const sales = stats.outcomes['sale'] || 0;
            const resolutions = stats.outcomes['resolution'] || 0;
            const escalations = stats.outcomes['escalation'] || 0;
            const churns = stats.outcomes['churn'] || 0;
            const total = sales + resolutions + escalations + churns;

            totalSuccesses += sales + resolutions;
            totalOutcomesCount += total;

            if (total > 0) {
                stats.successRate = Math.round(((sales + resolutions) / total) * 100);
                stats.escalationRate = Math.round((escalations / total) * 100);
            }

            const agentFeedback = stats.feedbackPositive + stats.feedbackNegative;
            stats.feedbackScore = agentFeedback > 0
                ? Math.round((stats.feedbackPositive / agentFeedback) * 100)
                : 0;
        }

        summary.overallSuccessRate = totalOutcomesCount > 0
            ? Math.round((totalSuccesses / totalOutcomesCount) * 100)
            : 0;

        // Calculate snap effectiveness
        for (const snap of Object.values(snapStats)) {
            const total = snap.positiveOutcomes + snap.negativeOutcomes;
            snap.effectivenessScore = total > 0
                ? Math.round((snap.positiveOutcomes / total) * 100)
                : 50; // Neutral if no data
        }

        // Build trend (last 30 days)
        const outcomesTrend = Object.entries(outcomesByDate)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .slice(-30)
            .map(([date, data]) => ({
                date,
                ...data
            }));

        // Get inquiry learning stats
        let inquiryLearning = {
            totalResolutions: 0,
            byType: {} as Record<string, number>,
            byAction: {} as Record<string, number>,
            customResponseRate: 0
        };

        try {
            const learningService = InquiryLearningService.getInstance();
            const rawStats = await learningService.getLearningStats();
            // Map snake_case to camelCase
            inquiryLearning = {
                totalResolutions: rawStats.total_resolutions,
                byType: rawStats.by_type,
                byAction: rawStats.by_action,
                customResponseRate: rawStats.custom_response_rate
            };
        } catch (err: any) {
            logger.warn('[AgentPerformance] Failed to get inquiry learning stats:', err.message);
        }

        return {
            summary,
            byAgent: Object.values(agentStats).sort((a, b) => b.totalConversations - a.totalConversations),
            snapEffectiveness: Object.values(snapStats).sort((a, b) => b.usageCount - a.usageCount),
            confidenceDistribution: confidenceDist,
            outcomesTrend,
            inquiryLearning
        };
    }

    /**
     * Get quick summary for status checks
     */
    public getQuickStats(): { conversations: number; pending: number; successRate: number } {
        const outcomeStats = this.conversationService.getOutcomeStats();

        const successes = (outcomeStats.byOutcome['sale'] || 0) + (outcomeStats.byOutcome['resolution'] || 0);
        const failures = (outcomeStats.byOutcome['escalation'] || 0) + (outcomeStats.byOutcome['churn'] || 0);
        const totalWithOutcome = successes + failures;

        return {
            conversations: outcomeStats.total,
            pending: outcomeStats.pendingCount,
            successRate: totalWithOutcome > 0 ? Math.round((successes / totalWithOutcome) * 100) : 0
        };
    }
}
