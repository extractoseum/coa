import { supabase } from '../config/supabase';
import { cleanupPhone } from '../utils/phoneUtils';

export interface RoutingDecision {
    column_id: string | null;
    agent_id: string | null;
    traffic_source: string | null;
    channel_chip_id: string | null;
}

export class ChannelRouter {
    private static instance: ChannelRouter;

    private constructor() { }

    public static getInstance(): ChannelRouter {
        if (!ChannelRouter.instance) {
            ChannelRouter.instance = new ChannelRouter();
        }
        return ChannelRouter.instance;
    }

    /**
     * Resolves which Channel Chip should handle an incoming message
     * @param platform 'WA' | 'IG' | 'FB' | 'EMAIL'
     * @param identifier The specific account identifier (e.g. the phone number or channel ID)
     */
    public async resolveChip(platform: string, identifier: string) {
        // Map CRM platform names (WA, IG) to chip platform names if different
        const platformMap: Record<string, string> = {
            'WA': 'whatsapp',
            'IG': 'instagram',
            'FB': 'facebook',
            'EMAIL': 'email'
        };

        const targetPlatform = platformMap[platform] || platform.toLowerCase();
        let targetIdentifier = identifier;

        // Normalize WhatsApp identifier to 10 digits as anchor (Phase 61)
        if (targetPlatform === 'whatsapp') {
            targetIdentifier = cleanupPhone(identifier);
            console.log(`[ChannelRouter] Normalizing WA identifier: ${identifier} -> ${targetIdentifier}`);
        }

        // 1. Look for chip by exact account_reference
        const { data: chip, error } = await supabase
            .from('channel_chips')
            .select('*')
            .eq('platform', targetPlatform)
            .eq('account_reference', targetIdentifier)
            .eq('is_active', true)
            .maybeSingle();

        if (error) {
            console.error(`[ChannelRouter] Lookup error: ${error.message}`);
        }

        if (chip) {
            console.log(`[ChannelRouter] Found Chip: ${chip.channel_id} for ${targetIdentifier}`);
            return chip;
        }

        // 2. Fallback: Generic chip for the platform
        const { data: fallbackChip } = await supabase
            .from('channel_chips')
            .select('*')
            .eq('platform', targetPlatform)
            .eq('is_active', true)
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();

        if (fallbackChip) {
            console.log(`[ChannelRouter] Using fallback Chip: ${fallbackChip.channel_id} for platform ${targetPlatform}`);
        }

        return fallbackChip;
    }

    /**
     * Returns the routing configuration for a specific chip
     */
    public async getRouting(platform: string, identifier: string): Promise<RoutingDecision> {
        const chip = await this.resolveChip(platform, identifier);

        if (!chip) {
            return {
                column_id: null,
                agent_id: null,
                traffic_source: 'direct',
                channel_chip_id: null
            };
        }

        return {
            column_id: chip.default_entry_column_id,
            agent_id: chip.default_agent_id,
            traffic_source: chip.traffic_source,
            channel_chip_id: chip.id
        };
    }
}
