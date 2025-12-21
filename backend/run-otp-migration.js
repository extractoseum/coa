// Run migration 017_update_otp_codes.sql
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function runMigration() {
    console.log('Running OTP Codes Update migration...');

    try {
        const sql = fs.readFileSync(path.join(__dirname, 'migrations/017_update_otp_codes.sql'), 'utf8');

        const { error } = await supabase.rpc('exec', {
            query: sql
        });

        if (error) {
            console.error('Migration RPC error:', error);
            console.log('Trying direct SQL execution via Supabase Dashboard might be needed if RPC "exec" is not enabled.');
        } else {
            console.log('Migration executed successfully via RPC.');
        }

    } catch (err) {
        console.error('Migration error:', err);
    }
}

runMigration();
