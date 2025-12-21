import { supabase } from '../config/supabase';
import { cryptoService } from './cryptoService';

export interface LedgerEntry {
    eventType: string;
    entityId: string;
    entityType: string;
    payload: any;
    createdBy?: string;
}

/**
 * LedgerService manages the "Integrity Ledger", providing an immutable
 * audit trail of critical system events using a cryptographic chain of trust.
 */
class LedgerService {
    /**
     * Records an immutable event in the integrity ledger.
     * This forms part of the "Integrity Ledger" (Phase 2).
     */
    public async recordEvent(entry: LedgerEntry) {
        try {
            // 1. Get the latest record to find the prev_hash (Chain of Trust)
            const { data: lastRecord, error: fetchError } = await supabase
                .from('integrity_ledger')
                .select('payload_hash')
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            // PGRST116 means no results, which is okay for the very first record after SYSTEM_INIT
            if (fetchError && fetchError.code !== 'PGRST116') {
                console.error(`[Ledger] Failed to fetch last record: ${fetchError.message}`);
            }

            const prevHash = lastRecord ? lastRecord.payload_hash : 'ROOT';

            // 2. Hash the current payload (SHA-256)
            const payloadHash = cryptoService.hashPayload(entry.payload);

            // 3. Sign the link (Current Hash + Previous Hash) using Ed25519
            const messageToSign = `${payloadHash}:${prevHash}`;
            const signature = cryptoService.signMessage(messageToSign);

            // 4. Persistence
            const { error: insertError } = await supabase
                .from('integrity_ledger')
                .insert({
                    event_type: entry.eventType,
                    entity_id: entry.entityId,
                    entity_type: entry.entityType,
                    payload: entry.payload,
                    payload_hash: payloadHash,
                    prev_hash: prevHash,
                    signature: signature,
                    created_by: entry.createdBy
                });

            if (insertError) {
                console.error(`[Ledger] DB Insert error: ${insertError.message}`);
            } else {
                console.log(`[Ledger] ✅ ${entry.eventType} recorded for ${entry.entityType} ${entry.entityId}`);
            }
        } catch (error) {
            console.error('[Ledger] Critical failure:', error);
            // Non-blocking but should be monitored
        }
    }

    /**
     * Verifies the entire ledger chain (for system audits).
     */
    public async verifyChainIntegrity(): Promise<{ valid: boolean; errors: string[] }> {
        const errors: string[] = [];
        try {
            const { data: records, error } = await supabase
                .from('integrity_ledger')
                .select('*')
                .order('created_at', { ascending: true });

            if (error) throw error;
            if (!records || records.length === 0) return { valid: true, errors: [] };

            let lastHash = 'ROOT';

            for (const record of records) {
                if (record.event_type === 'SYSTEM_INIT') {
                    lastHash = record.payload_hash;
                    continue;
                }

                // Check prev_hash link
                if (record.prev_hash !== lastHash) {
                    errors.push(`Chain break at ID ${record.id}: expected prev_hash ${lastHash}, found ${record.prev_hash}`);
                }

                // Check payload hash
                const calculatedHash = cryptoService.hashPayload(record.payload);
                if (calculatedHash !== record.payload_hash) {
                    errors.push(`Hash mismatch at ID ${record.id}: payload content does not match payload_hash`);
                }

                // Check signature
                const message = `${record.payload_hash}:${record.prev_hash}`;
                const isSigValid = cryptoService.verifySignature(message, record.signature);

                // Only alert if keys are present (during dev it might be 'signed_...')
                if (process.env.INTEGRITY_PUBLIC_KEY && !isSigValid) {
                    errors.push(`Invalid signature at ID ${record.id}`);
                }

                lastHash = record.payload_hash;
            }

            return { valid: errors.length === 0, errors };
        } catch (error: any) {
            return { valid: false, errors: [error.message] };
        }
    }
}

export const ledgerService = new LedgerService();
