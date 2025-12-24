
import { supabase } from '../src/config/supabase';
import { CRMService } from '../src/services/CRMService';

async function bulkEnrich() {
    console.log('--- STARTING BULK ENRICHMENT ---');
    const crm = CRMService.getInstance();

    // 1. Get all active conversations
    const { data: convs, error } = await supabase
        .from('conversations')
        .select('id, contact_handle, channel, status')
        .in('status', ['active', 'review', 'paused']); // Broaden scope to catch all visible cards

    if (error || !convs) {
        console.error('Failed to fetch conversations:', error);
        return;
    }

    console.log(`Found ${convs.length} active/paused conversations.`);

    let processed = 0;
    let enriched = 0;

    for (const conv of convs) {
        processed++;
        // 2. Check if snapshot exists and has avatar
        const { data: snapshot } = await supabase
            .from('crm_contact_snapshots')
            .select('avatar_url, name')
            .eq('handle', conv.contact_handle)
            .single();

        // Condition: Missing avatar OR missing name (and it's a number)
        const missingAvatar = !snapshot?.avatar_url;
        const missingName = !snapshot?.name || snapshot.name === conv.contact_handle;

        if (missingAvatar || missingName) {
            console.log(`[${processed}/${convs.length}] Enriching ${conv.contact_handle} (Missing: ${missingAvatar ? 'Avatar' : ''} ${missingName ? 'Name' : ''})...`);
            try {
                // Force sync
                await crm.syncContactSnapshot(conv.contact_handle, conv.channel);
                enriched++;
                // Rate limit politeness
                await new Promise(r => setTimeout(r, 500));
            } catch (e: any) {
                console.error(`Failed to enrich ${conv.contact_handle}:`, e.message);
            }
        } else {
            // console.log(`[${processed}/${convs.length}] Skipping ${conv.contact_handle} (Already enriched)`);
        }
    }

    console.log(`--- FINISHED ---`);
    console.log(`Total Processed: ${processed}`);
    console.log(`Enriched: ${enriched}`);
}

bulkEnrich();
