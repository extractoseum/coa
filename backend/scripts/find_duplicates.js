const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function findDuplicates() {
    console.log('-- IDENTIFYING DUPLICATES --');

    // Fetch all WhatsApp conversations
    const { data: convs, error } = await supabase
        .from('conversations')
        .select('id, channel, contact_handle')
        .eq('channel', 'WA');

    if (error) {
        console.error('Error fetching conversations:', error);
        return;
    }

    const map = new Map(); // Normalized handle -> Array of IDs

    convs.forEach(c => {
        const normalized = c.contact_handle.length > 10 ? c.contact_handle.slice(-10) : c.contact_handle;
        if (!map.has(normalized)) {
            map.set(normalized, []);
        }
        map.get(normalized).push(c);
    });

    console.log('-- GENERATING CLEANUP SQL --');
    console.log('BEGIN;');

    for (const [handle, group] of map.entries()) {
        if (group.length > 1) {
            // We have a collision
            // Survivor: the one that is already exactly 10 digits, or just the first one
            const survivor = group.find(c => c.contact_handle.length === 10) || group[0];
            const victims = group.filter(c => c.id !== survivor.id);

            console.log(`-- Merging duplicates for normalized handle: ${handle}`);
            for (const victim of victims) {
                console.log(`-- Victim ID: ${victim.id} (${victim.contact_handle}) -> Survivor ID: ${survivor.id} (${survivor.contact_handle})`);

                // Reassign messages
                console.log(`UPDATE crm_messages SET conversation_id = '${survivor.id}' WHERE conversation_id = '${victim.id}';`);

                // Reassign chips if they exist (checking schema later if needed, but safe to try)
                // console.log(`UPDATE conversation_chips SET conversation_id = '${survivor.id}' WHERE conversation_id = '${victim.id}';`);

                // Delete victim
                console.log(`DELETE FROM conversations WHERE id = '${victim.id}';`);
            }
        }
    }

    console.log('COMMIT;');
}

findDuplicates();
