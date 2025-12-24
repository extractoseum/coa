
import { supabase } from '../src/config/supabase';

async function correctIdentity() {
    const handle = '13038159669';
    const correctName = 'Brittany';

    console.log(`--- CORRECTING IDENTITY FOR ${handle} ---`);

    // 1. Update Snapshot Name
    console.log(`Setting snapshot name to: "${correctName}"`);
    const { data: snapshot, error: snapError } = await supabase
        .from('crm_contact_snapshots')
        .update({ name: correctName })
        .eq('handle', handle)
        .select()
        .single();

    if (snapError) console.error('Snapshot Update Error:', snapError);
    else console.log('Snapshot Updated:', snapshot);

    // 2. Wipe the incorrect fact to prevent re-promotion
    // We need to fetch current facts first
    const { data: convs } = await supabase
        .from('conversations')
        .select('id, facts, contact_handle')
        .eq('contact_handle', handle)
        .limit(1);

    const conv = convs?.[0];
    if (conv) {
        const newFacts = { ...conv.facts };
        if (newFacts.user_name === 'Bernardo de la Torre Aparicio') {
            console.log('Detected incorrect user_name in facts. Wiping...');
            delete newFacts.user_name; // Remove the incorrect attribution

            const { error: factError } = await supabase
                .from('conversations')
                .update({ facts: newFacts })
                .eq('id', conv.id);

            if (factError) console.error('Fact Update Error:', factError);
            else console.log('Facts corrected (user_name removed).');
        } else {
            console.log('Fact user_name was not Bernardo, leaving as is:', newFacts.user_name);
        }
    }
}

correctIdentity();
