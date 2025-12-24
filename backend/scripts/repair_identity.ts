
import { supabase } from '../src/config/supabase';

async function repairIdentity() {
    const handle = '13038159669';
    console.log(`--- REPAIRING IDENTITY FOR ${handle} ---`);

    // 1. Get Conversation Facts including Name
    const { data: convs, error } = await supabase
        .from('conversations')
        .select('id, facts, contact_handle')
        .ilike('contact_handle', `%${handle}%`)
        .limit(1);

    if (error || !convs || convs.length === 0) {
        console.error('Conversation not found or DB error:', error);
        return;
    }

    const conv = convs[0];
    const factName = conv.facts?.user_name;

    if (!factName) {
        console.log('No user_name found in facts. Cannot repair automatically.');
        return;
    }

    console.log(`Found Fact Name: "${factName}"`);

    // 2. Update Snapshot
    console.log('Updating Snapshot...');
    const { data: updated, error: updateError } = await supabase
        .from('crm_contact_snapshots')
        .update({ name: factName })
        .eq('handle', conv.contact_handle)
        .select()
        .single();

    if (updateError) {
        console.error('Failed to update snapshot:', updateError);
    } else {
        console.log('SUCCESS! Snapshot updated:', updated);
    }
}

repairIdentity();
