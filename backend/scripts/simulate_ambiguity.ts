
import { supabase } from '../src/config/supabase';

async function simulateAmbiguity() {
    const handle = '13038159669';
    console.log(`--- SIMULATING AMBIGUITY FOR ${handle} ---`);

    // 1. Fetch convo
    const { data: convs } = await supabase
        .from('conversations')
        .select('*')
        .eq('contact_handle', handle)
        .limit(1);

    const conv = convs?.[0];
    if (!conv) {
        console.error('Conversation not found');
        return;
    }

    // 2. Inject Ambiguity Fact
    const newFacts = {
        ...conv.facts,
        identity_ambiguity: true,
        ambiguity_candidates: ['Bernardo', 'Brittany']
    };

    const { error } = await supabase
        .from('conversations')
        .update({ facts: newFacts })
        .eq('id', conv.id);

    if (error) console.error('Error injecting ambiguity:', error);
    else console.log('Ambiguity injected! Check the CRM Sidekick > Recursos tab.');
}

simulateAmbiguity();
