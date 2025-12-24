
import { supabase } from '../src/config/supabase';

async function inspectIdentity() {
    const handle = '13038159669';
    console.log(`--- INSPECTING IDENTITY FOR ${handle} ---`);

    // 1. Get Conversation Facts (Correct items only)
    const { data: convs, error } = await supabase
        .from('conversations')
        .select('id, facts, contact_handle')
        .ilike('contact_handle', `%${handle}%`)
        .limit(1);

    if (error) {
        console.error('DB Error:', error);
        return;
    }

    const conv = convs && convs[0];

    if (!conv) {
        console.log('Conversation not found.');
        return;
    }

    console.log('Conversation ID:', conv.id);
    console.log('Handle:', conv.contact_handle);
    console.log('Facts:', JSON.stringify(conv.facts, null, 2));

    // 2. Check Snapshot for this handle
    const { data: snapshot } = await supabase
        .from('crm_contact_snapshots')
        .select('*')
        .eq('handle', conv.contact_handle)
        .single();

    console.log('Snapshot Name:', snapshot?.name || 'NULL');
}

inspectIdentity();
