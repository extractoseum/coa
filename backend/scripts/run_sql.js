const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runSQL() {
    console.log('Attempting to add columns...');
    // Since we don't have a direct SQL RPC, we will try to use the 'rest' api if there is an extension
    // But actually, without a custom RPC, we can't do DDL.
    // I will try to see if I can find a 'query' rpc.

    const { data, error } = await supabase.rpc('run_sql', { sql: 'ALTER TABLE order_tracking ADD COLUMN IF NOT EXISTS tracking_code TEXT; ALTER TABLE order_tracking ADD COLUMN IF NOT EXISTS service_type TEXT;' });

    if (error) {
        console.error('Error running SQL:', error);
    } else {
        console.log('SQL ran successfully:', data);
    }
}

runSQL();
