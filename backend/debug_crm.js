
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
const envPath = path.resolve(__dirname, '.env');
dotenv.config({ path: envPath });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function debugCRM() {
    console.log('--- DEBUGGING CRM CONVERSATIONS ---');
    const handle = 'bdelatorre8@gmail.com';

    // 1. Check Conversations
    const { data: convs, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .ilike('contact_handle', `%${handle}%`);

    if (convError) console.error('Error fetching conversations:', convError);
    else {
        console.log(`Found ${convs.length} conversations for handle matching "${handle}":`);
        convs.forEach(c => {
            console.log(`- ID: ${c.id}`);
            console.log(`  Channel: ${c.channel}`);
            console.log(`  Handle: ${c.contact_handle}`);
            console.log(`  Column: ${c.column_id}`);
            console.log(`  Status: ${c.status}`);
            console.log(`  Created: ${c.created_at}`);
            console.log('---');
        });
    }

    console.log('\n--- DEBUGGING BROWSING EVENTS ---');
    // 2. Check Browsing Events
    const { data: events, error: eventError } = await supabase
        .from('browsing_events')
        .select('*')
        .ilike('handle', `%${handle}%`)
        .order('created_at', { ascending: false })
        .limit(5);

    if (eventError) console.error('Error fetching events:', eventError);
    else {
        console.log(`Found ${events.length} events for handle matching "${handle}":`);
        events.forEach(e => {
            console.log(`- Type: ${e.event_type}`);
            console.log(`  Handle: ${e.handle}`);
            console.log(`  Created: ${e.created_at}`);
            console.log(`  Meta: ${JSON.stringify(e.metadata)}`);
            console.log('---');
        });
    }

    // 3. Check Clients Table
    console.log('\n--- DEBUGGING CLIENTS ---');
    const { data: clients, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .ilike('email', `%${handle}%`);

    if (clientError) console.error('Error fetching clients:', clientError);
    else {
        console.log(`Found ${clients.length} clients for email matching "${handle}":`);
        clients.forEach(c => {
            console.log(`- ID: ${c.id}`);
            console.log(`  Email: ${c.email}`);
            console.log(`  Phone: ${c.phone}`);
            console.log(`  Tags: ${c.tags}`);
        });
    }
}

debugCRM();
