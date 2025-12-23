
const { createClient } = require('@supabase/supabase-js');

// Read env vars from arguments or hardcode for this check (using values from file view previously/env)
// I will try to read .env or use the ones I saw in AdminCRM.tsx but I need SERVICE_ROLE or ANON?
// backend uses SERVICE_ROLE usually.
// I saw process.env.SUPABASE_URL in backend files. 
// I will rely on dotenv.

require('dotenv').config({ path: './backend/.env' });

// Hardcoded for verification
const supabaseUrl = 'https://vbnpcospodhwuzvxejui.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZibnBjb3Nwb2Rod3V6dnhlanVpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyOTc3NDAsImV4cCI6MjA4MDg3Mzc0MH0.2X--XqOOpjyTDE2hKZeNvBPuQw6pq5XKdB08kQnbEzE';


const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
    console.log('Checking crm_contact_snapshots columns...');

    // Attempt to select avatar_url from a single record
    const { data, error } = await supabase
        .from('crm_contact_snapshots')
        .select('avatar_url')
        .limit(1);

    if (error) {
        console.error('Error selecting avatar_url:', error.message);
        if (error.message.includes('does not exist')) {
            console.log('COLUMN_MISSING: avatar_url');
        }
    } else {
        console.log('Column avatar_url EXISTS.');
    }
}

checkSchema();
