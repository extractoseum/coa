import { supabase } from '../config/supabase';
import { logger } from '../utils/Logger';
import { CRMService } from './CRMService';

export class AuditorService {
    private static instance: AuditorService;

    private constructor() { }

    public static getInstance(): AuditorService {
        if (!AuditorService.instance) {
            AuditorService.instance = new AuditorService();
        }
        return AuditorService.instance;
    }

    private stats = {
        lastRunAt: null as string | null,
        status: 'idle' as 'idle' | 'running',
        lastDurationMs: 0,
        results: {
            orphansFixed: 0,
            unlinkedIdentitiesFixed: 0,
            staleSnapshotsRefreshed: 0
        }
    };

    public getStats() {
        return this.stats;
    }

    /**
     * The Main Audit Loop
     * Runs various forensic checks.
     */
    public async runAudit() {
        if (this.stats.status === 'running') {
            logger.warn('[Auditor] Audit already in progress. Skipping.');
            return;
        }

        this.stats.status = 'running';
        const startTime = Date.now();
        const correlationId = logger.startTrace();

        // Reset counters for this run? 
        // Strategy: Accumulate? No, stats usually show "Last Run Results".
        // Let's reset results for "Last Run" context.
        this.stats.results = {
            orphansFixed: 0,
            unlinkedIdentitiesFixed: 0,
            staleSnapshotsRefreshed: 0
        };

        logger.info('[Auditor] Starting system forensics...', { correlation_id: correlationId });

        try {
            await this.checkOrphanedAnalyses(correlationId);
            await this.checkUnlinkedIdentities(correlationId);
            await this.checkStaleSnapshots(correlationId);
        } catch (error) {
            logger.error('[Auditor] Forensic scan failed', error, { correlation_id: correlationId });
        } finally {
            this.stats.status = 'idle';
            this.stats.lastRunAt = new Date().toISOString();
            this.stats.lastDurationMs = Date.now() - startTime;
            logger.info('[Auditor] System forensics completed.', {
                correlation_id: correlationId,
                duration_ms: this.stats.lastDurationMs,
                results: this.stats.results
            });
        }
    }

    /**
     * FORENSIC CHECK 1: Orphaned Analyses
     * Finds active conversations with >10 messages but NO 'facts' or 'action_plan'.
     */
    private async checkOrphanedAnalyses(correlationId: string) {
        // Query logic would be complex in generic Supabase, doing a simplified heuristic fetch
        // In a real SQL robust system: SELECT * FROM conversations WHERE jsonb_array_length(facts->'action_plan') = 0

        // Fetch active convs
        const { data: convs, error } = await supabase
            .from('conversations')
            .select('id, facts, contact_handle')
            .eq('status', 'active')
            .limit(50); // Batch size

        if (error) throw error;

        let fixedCount = 0;
        for (const conv of convs || []) {
            const hasFacts = conv.facts && Object.keys(conv.facts).length > 0;
            const hasActionPlan = conv.facts?.action_plan && conv.facts.action_plan.length > 0;

            if (!hasFacts || !hasActionPlan) {
                logger.warn('[Auditor] Found orphaned conversation (No Analysis). Triggering recalibration.', {
                    correlation_id: correlationId,
                    conversation_id: conv.id
                });

                // Self-Correction
                await CRMService.getInstance().syncConversationFacts(conv.id);
                fixedCount++;
            }
        }

        this.stats.results.orphansFixed += fixedCount;

        if (fixedCount > 0) {
            logger.info(`[Auditor] Auto-recalibrated ${fixedCount} conversations.`, { correlation_id: correlationId });
        }
    }

    /**
     * FORENSIC CHECK 2: Unlinked Identities
     * Finds clients in 'conversations' who have an extracted email but NO record in 'clients' table.
     */
    private async checkUnlinkedIdentities(correlationId: string) {
        // 1. Get conversations with an email in facts
        const { data: convs } = await supabase
            .from('conversations')
            .select('*')
            .not('facts->user_email', 'is', null)
            .limit(50);

        for (const conv of convs || []) {
            const email = conv.facts?.user_email;
            if (!email) continue;

            // 2. Check if client exists
            const { data: client } = await supabase
                .from('clients')
                .select('id')
                .eq('email', email)
                .single();

            if (!client) {
                logger.warn('[Auditor] Found unlinked identity. Creating Client record.', {
                    correlation_id: correlationId,
                    email: email,
                    handle: conv.contact_handle
                });

                // Self-Correction
                const cleanPhone = conv.contact_handle.replace(/\D/g, '').slice(-10);
                await supabase.from('clients').upsert({
                    email: email,
                    phone: cleanPhone,
                    name: conv.facts?.user_name || 'Unknown (Auditor Recovered)'
                }, { onConflict: 'email' });

                this.stats.results.unlinkedIdentitiesFixed++;
            }
        }
    }

    /**
     * FORENSIC CHECK 3: Stale Snapshots
     * Finds clients with snapshots older than 24h and refreshes them.
     */
    private async checkStaleSnapshots(correlationId: string) {
        // Fetch clients with stale snapshots (older than 24h)
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        const { data: clients, error } = await supabase
            .from('clients')
            .select('id, phone, last_snapshot_at')
            .lt('last_snapshot_at', twentyFourHoursAgo)
            .limit(20); // Batch limit to avoid rate limits

        if (error) {
            logger.error('[Auditor] Failed to fetch stale snapshots', error, { correlation_id: correlationId });
            return;
        }

        if (clients && clients.length > 0) {
            logger.info(`[Auditor] Found ${clients.length} stale snapshots. Refreshing...`, { correlation_id: correlationId });

            for (const client of clients) {
                try {
                    // Refresh WA snapshot (default channel)
                    await CRMService.getInstance().syncContactSnapshot(client.phone, 'WA');
                    await new Promise(resolve => setTimeout(resolve, 1000)); // 1s throttle
                    this.stats.results.staleSnapshotsRefreshed++;
                } catch (e) {
                    logger.warn(`[Auditor] Failed to refresh snapshot for ${client.phone}`, e, { correlation_id: correlationId });
                }
            }
        } else {
            logger.info('[Auditor] No stale snapshots found.', { correlation_id: correlationId });
        }
    }
}
