
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function findDuplicates() {
    console.log('--- FINDING DUPLICATES ---');

    // Fetch all conversations
    const { data: convs, error } = await supabase
        .from('conversations')
        .select('id, channel, contact_handle, created_at, status');

    if (error) {
        console.error(error);
        return;
    }

    const group = {};
    convs.forEach(c => {
        const key = `${c.channel}:${c.contact_handle}`;
        if (!group[key]) group[key] = [];
        group[key].push(c);
    });

    let found = 0;
    for (const key in group) {
        if (group[key].length > 1) {
            console.log(`\nDuplicate Group: ${key}`);
            found++;
            group[key].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); // Newest first
            group[key].forEach((c, idx) => {
                console.log(`  ${idx === 0 ? '[KEEP]' : '[DELETE]'} ID: ${c.id} | Status: ${c.status} | Created: ${c.created_at}`);
            });
        }
    }

    if (found === 0) console.log('No exact channel+handle duplicates found.');
    else console.log(`\nFound ${found} duplicate sets.`);

    console.log('\n--- TESTING BEHAVIOR ENDPOINT (LOCAL) ---');
    // Simulate a request behavior for bdelatorre8@gmail.com
    // We can't easily simulate the express req here, but we can check the DB permissions conceptually 
    // by asking for the rows manually again to confirm they really exist.
    const { count } = await supabase
        .from('browsing_events')
        .select('*', { count: 'exact' })
        .eq('handle', 'bdelatorre8@gmail.com');

    console.log(`Events in DB for bdelatorre8@gmail.com: ${count}`);
}

findDuplicates();
