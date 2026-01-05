const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const IDENTITY_BLACKLIST = ['EXTRACTOS EUM', 'ARA', 'BERNARDO', 'EUM', 'EXTRACTOS'];
const blacklistRegex = new RegExp(`\\b(${IDENTITY_BLACKLIST.join('|')})\\b`, 'i');

async function scrub() {
    console.log('Starting facts scrub...');

    // Fetch all conversations with system_inquiry or identity_ambiguity
    const { data: convs, error } = await supabase
        .from('conversations')
        .select('id, facts')
        .not('facts', 'is', null);

    if (error) {
        console.error('Error fetching conversations:', error);
        return;
    }

    let scrubbedCount = 0;
    for (const conv of convs) {
        if (!conv.facts) continue;

        let changed = false;
        const facts = { ...conv.facts };

        // 1. Scrub user_name
        if (facts.user_name && blacklistRegex.test(facts.user_name)) {
            facts.user_name = null;
            changed = true;
        }

        // 2. Scrub ambiguity candidates
        if (facts.ambiguity_candidates) {
            const originalLength = facts.ambiguity_candidates.length;
            facts.ambiguity_candidates = facts.ambiguity_candidates.filter(c => !blacklistRegex.test(c));
            if (facts.ambiguity_candidates.length !== originalLength) {
                changed = true;
                if (facts.ambiguity_candidates.length <= 1) {
                    delete facts.identity_ambiguity;
                    delete facts.system_inquiry;
                }
            }
        }

        // 3. Scrub system_inquiry
        if (facts.system_inquiry) {
            if (blacklistRegex.test(JSON.stringify(facts.system_inquiry))) {
                delete facts.system_inquiry;
                changed = true;
            }
        }

        if (changed) {
            console.log(`Scrubbing conversation ${conv.id}...`);
            await supabase.from('conversations').update({ facts }).eq('id', conv.id);
            scrubbedCount++;
        }
    }

    console.log(`Scrub complete. ${scrubbedCount} conversations updated.`);
}

scrub();
