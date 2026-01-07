import { supabase } from '../config/supabase';
import { logger } from '../utils/Logger';

/**
 * Phase 6: Smart System Inquiries Learning Service
 * Analyzes past inquiry resolutions to provide intelligent suggestions
 */

export interface InquiryPattern {
    inquiry_type: string;
    action_taken: string;
    count: number;
    success_rate: number;
}

export interface SmartInquiryEnrichment {
    similar_resolutions: number;
    suggested_action: string | null;
    option_confidences: Record<string, number>;
    overall_confidence: number;
    auto_resolve_eligible: boolean;
}

export class InquiryLearningService {
    private static instance: InquiryLearningService;

    private constructor() {}

    public static getInstance(): InquiryLearningService {
        if (!InquiryLearningService.instance) {
            InquiryLearningService.instance = new InquiryLearningService();
        }
        return InquiryLearningService.instance;
    }

    /**
     * Get patterns from past inquiry resolutions
     */
    public async getResolutionPatterns(inquiryType: string, limit: number = 100): Promise<InquiryPattern[]> {
        try {
            const { data, error } = await supabase
                .from('system_logs')
                .select('metadata')
                .eq('event_type', 'inquiry_resolution')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error || !data) {
                logger.warn('[InquiryLearning] Failed to fetch resolution patterns:', error?.message);
                return [];
            }

            // Filter and aggregate by type and action
            const patterns: Record<string, { count: number; type: string; action: string }> = {};

            for (const log of data) {
                const meta = log.metadata as any;
                if (!meta?.inquiry_type || !meta?.action_taken) continue;

                // Only consider same type or all types if not specified
                if (inquiryType && meta.inquiry_type !== inquiryType) continue;

                const key = `${meta.inquiry_type}:${meta.action_taken}`;
                if (!patterns[key]) {
                    patterns[key] = { count: 0, type: meta.inquiry_type, action: meta.action_taken };
                }
                patterns[key].count++;
            }

            // Convert to array and calculate success rate (higher count = more trusted)
            const total = Object.values(patterns).reduce((sum, p) => sum + p.count, 0);
            return Object.values(patterns).map(p => ({
                inquiry_type: p.type,
                action_taken: p.action,
                count: p.count,
                success_rate: total > 0 ? (p.count / total) * 100 : 0
            })).sort((a, b) => b.count - a.count);

        } catch (err: any) {
            logger.error('[InquiryLearning] getResolutionPatterns error:', err.message);
            return [];
        }
    }

    /**
     * Find similar inquiries by question/context similarity
     */
    public async findSimilarResolutions(question: string, inquiryType: string): Promise<{
        count: number;
        topAction: string | null;
        topActionCount: number;
    }> {
        try {
            // Simple keyword matching for now (could be upgraded to embeddings)
            const keywords = question.toLowerCase()
                .replace(/[^\w\s]/g, '')
                .split(/\s+/)
                .filter(w => w.length > 3);

            const { data, error } = await supabase
                .from('system_logs')
                .select('metadata')
                .eq('event_type', 'inquiry_resolution')
                .order('created_at', { ascending: false })
                .limit(200);

            if (error || !data) return { count: 0, topAction: null, topActionCount: 0 };

            // Filter by type and find keyword matches
            const matches: Array<{ action: string; similarity: number }> = [];

            for (const log of data) {
                const meta = log.metadata as any;
                if (meta?.inquiry_type !== inquiryType) continue;

                const questionText = (meta.inquiry_question || '').toLowerCase();
                const contextText = (meta.inquiry_context || '').toLowerCase();
                const combinedText = questionText + ' ' + contextText;

                // Calculate simple keyword overlap
                let matchedKeywords = 0;
                for (const keyword of keywords) {
                    if (combinedText.includes(keyword)) matchedKeywords++;
                }

                const similarity = keywords.length > 0 ? matchedKeywords / keywords.length : 0;
                if (similarity > 0.3) { // At least 30% keyword match
                    matches.push({ action: meta.action_taken, similarity });
                }
            }

            if (matches.length === 0) return { count: 0, topAction: null, topActionCount: 0 };

            // Count actions
            const actionCounts: Record<string, number> = {};
            for (const m of matches) {
                actionCounts[m.action] = (actionCounts[m.action] || 0) + 1;
            }

            const topAction = Object.entries(actionCounts).sort((a, b) => b[1] - a[1])[0];

            return {
                count: matches.length,
                topAction: topAction ? topAction[0] : null,
                topActionCount: topAction ? topAction[1] : 0
            };

        } catch (err: any) {
            logger.error('[InquiryLearning] findSimilarResolutions error:', err.message);
            return { count: 0, topAction: null, topActionCount: 0 };
        }
    }

    /**
     * Enrich an inquiry with smart suggestions based on learning
     */
    public async enrichInquiry(inquiry: any): Promise<SmartInquiryEnrichment> {
        const result: SmartInquiryEnrichment = {
            similar_resolutions: 0,
            suggested_action: null,
            option_confidences: {},
            overall_confidence: 50, // Default neutral
            auto_resolve_eligible: false
        };

        try {
            // 1. Get resolution patterns for this type
            const patterns = await this.getResolutionPatterns(inquiry.type);

            // 2. Find similar resolutions
            const similar = await this.findSimilarResolutions(
                inquiry.question || '',
                inquiry.type
            );

            result.similar_resolutions = similar.count;

            if (similar.count > 0 && similar.topAction) {
                result.suggested_action = similar.topAction;

                // Calculate confidence based on consistency
                const consistency = similar.topActionCount / similar.count;
                result.overall_confidence = Math.round(consistency * 100);

                // Auto-resolve eligible if high consistency with sufficient samples
                if (similar.count >= 5 && consistency >= 0.8) {
                    result.auto_resolve_eligible = true;
                }
            }

            // 3. Calculate per-option confidence
            if (inquiry.options && Array.isArray(inquiry.options)) {
                for (const opt of inquiry.options) {
                    const actionPattern = patterns.find(p => p.action_taken === opt.action);
                    if (actionPattern) {
                        result.option_confidences[opt.action] = Math.round(actionPattern.success_rate);
                    } else {
                        result.option_confidences[opt.action] = 20; // Low confidence for unseen actions
                    }
                }
            }

            logger.info(`[InquiryLearning] Enriched inquiry ${inquiry.id}: ${similar.count} similar, suggested: ${result.suggested_action}`);

        } catch (err: any) {
            logger.error('[InquiryLearning] enrichInquiry error:', err.message);
        }

        return result;
    }

    /**
     * Check if inquiry should be auto-resolved
     * Returns the action to take if auto-resolve is appropriate, null otherwise
     */
    public async checkAutoResolve(inquiry: any): Promise<string | null> {
        try {
            const enrichment = await this.enrichInquiry(inquiry);

            // Only auto-resolve if:
            // 1. We have at least 5 similar resolutions
            // 2. Confidence is 90% or higher
            // 3. The suggested action exists in options
            if (
                enrichment.auto_resolve_eligible &&
                enrichment.overall_confidence >= 90 &&
                enrichment.suggested_action &&
                inquiry.options?.some((o: any) => o.action === enrichment.suggested_action)
            ) {
                logger.info(`[InquiryLearning] Auto-resolve eligible: ${inquiry.id} -> ${enrichment.suggested_action}`);
                return enrichment.suggested_action;
            }

            return null;
        } catch (err: any) {
            logger.error('[InquiryLearning] checkAutoResolve error:', err.message);
            return null;
        }
    }

    /**
     * Get learning statistics for admin dashboard
     */
    public async getLearningStats(): Promise<{
        total_resolutions: number;
        by_type: Record<string, number>;
        by_action: Record<string, number>;
        custom_response_rate: number;
    }> {
        try {
            const { data, error } = await supabase
                .from('system_logs')
                .select('metadata')
                .eq('event_type', 'inquiry_resolution');

            if (error || !data) {
                return { total_resolutions: 0, by_type: {}, by_action: {}, custom_response_rate: 0 };
            }

            const stats = {
                total_resolutions: data.length,
                by_type: {} as Record<string, number>,
                by_action: {} as Record<string, number>,
                custom_response_rate: 0
            };

            let customCount = 0;

            for (const log of data) {
                const meta = log.metadata as any;
                if (!meta) continue;

                if (meta.inquiry_type) {
                    stats.by_type[meta.inquiry_type] = (stats.by_type[meta.inquiry_type] || 0) + 1;
                }
                if (meta.action_taken) {
                    stats.by_action[meta.action_taken] = (stats.by_action[meta.action_taken] || 0) + 1;
                }
                if (meta.learning_context?.was_custom_response) {
                    customCount++;
                }
            }

            stats.custom_response_rate = data.length > 0 ? (customCount / data.length) * 100 : 0;

            return stats;

        } catch (err: any) {
            logger.error('[InquiryLearning] getLearningStats error:', err.message);
            return { total_resolutions: 0, by_type: {}, by_action: {}, custom_response_rate: 0 };
        }
    }
}
