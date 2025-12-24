import { supabase } from '../config/supabase';

export interface MiniChip {
    id: string;
    channel_chip_id: string | null;
    is_global: boolean;
    is_active: boolean;
    trigger_type: 'keyword' | 'regex' | 'intent' | 'mood';
    trigger_config: any;
    actions_payload: any;
    priority: number;
    name: string;
}

export class ChipEngine {
    private static instance: ChipEngine;

    private constructor() { }

    public static getInstance(): ChipEngine {
        if (!ChipEngine.instance) {
            ChipEngine.instance = new ChipEngine();
        }
        return ChipEngine.instance;
    }

    /**
     * Processes a message and triggers any matching Mini-Chips
     */
    public async processMessage(messageId: string, content: string, conversationId: string, channelChipId: string | null) {
        console.log(`[ChipEngine] Analyzing message ${messageId} for triggers...`);

        // 1. Fetch relevant Mini-Chips
        // Chips are either global or specific to this channel chip
        const query = supabase
            .from('mini_chips')
            .select('*')
            .eq('is_active', true)
            .or(`is_global.eq.true${channelChipId ? `,channel_chip_id.eq.${channelChipId}` : ''}`)
            .order('priority', { ascending: false });

        const { data: chips, error } = await query;

        if (error || !chips || chips.length === 0) return;

        console.log(`[ChipEngine] Found ${chips.length} potential Mini-Chips.`);

        for (const chip of chips) {
            if (this.isMatch(content, chip)) {
                console.log(`[ChipEngine] MATCH! Triggering Chip: ${chip.name} (${chip.id})`);
                await this.executeChip(chip, messageId, conversationId);

                // If the chip is "terminal" (stops propagation), break here
                // For now, let's assume multiple chips can trigger unless specified
                if (chip.trigger_config?.stop_propagation) break;
            }
        }
    }

    /**
     * Internal matching logic
     */
    private isMatch(content: string, chip: MiniChip): boolean {
        const config = chip.trigger_config;
        // Fix #13: Robust Normalization (Case + Accents)
        const normalize = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        const text = normalize(content);

        if (chip.trigger_type === 'keyword') {
            const keywords = config.keywords || [];
            return keywords.some((kw: string) => text.includes(kw.toLowerCase()));
        }

        if (chip.trigger_type === 'regex') {
            try {
                const regex = new RegExp(config.pattern, config.flags || 'i');
                return regex.test(content);
            } catch (e) {
                console.error(`[ChipEngine] Invalid regex in chip ${chip.id}:`, e);
                return false;
            }
        }

        // Future: Intent/Mood matching via AI
        return false;
    }

    /**
     * Executes the actions defined in a chip
     */
    private async executeChip(chip: MiniChip, messageId: string, conversationId: string) {
        const actions = Array.isArray(chip.actions_payload) ? chip.actions_payload : [chip.actions_payload];

        for (const action of actions) {
            try {
                console.log(`[ChipEngine] Executing action: ${action.type}`);

                if (action.type === 'MOVE_COLUMN') {
                    await supabase
                        .from('conversations')
                        .update({ column_id: action.target_column_id })
                        .eq('id', conversationId);
                }

                if (action.type === 'ASSIGN_AGENT') {
                    await supabase
                        .from('conversations')
                        .update({ agent_override_id: action.target_agent_id })
                        .eq('id', conversationId);
                }

                if (action.type === 'SET_STATUS') {
                    await supabase
                        .from('conversations')
                        .update({ status: action.status })
                        .eq('id', conversationId);
                }

                // More actions can be added here (Tags, Notifications, etc.)

            } catch (err: any) {
                console.error(`[ChipEngine] Action execution failed: ${err.message}`);
            }
        }

        // Audit log: Conversation Chip link
        await supabase.from('conversation_chips').insert({
            conversation_id: conversationId,
            mini_chip_id: chip.id,
            triggered_by_message_id: messageId,
            metadata: { actions_executed: actions }
        });
    }
}
