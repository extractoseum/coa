// Script to check database schema
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
}

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
