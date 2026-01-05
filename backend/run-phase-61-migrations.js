const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Supabase credentials missing.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const migrations = [
    'migrations/053_smart_card_indicators.sql',
    'migrations/054_message_types_extended.sql',
    'migrations/055_crm_audit_logs.sql'
];

async function run() {
    for (const migrationFile of migrations) {
        console.log(`\n=== Applying ${migrationFile} ===`);
        const sql = fs.readFileSync(path.resolve(migrationFile), 'utf8');

        // Try 'exec' first (common in this codebase)
        let { data, error } = await supabase.rpc('exec', { query: sql });

        if (error && (error.message.includes('not found') || error.message.includes('does not exist'))) {
            console.log('RPC "exec" failed, trying "run_sql"...');
            const { data: data2, error: error2 } = await supabase.rpc('run_sql', { sql: sql });
            data = data2;
            error = error2;
        }

        if (error) {
            console.error(`❌ FAILED ${migrationFile}:`, error.message);
        } else {
            console.log(`✅ SUCCESS ${migrationFile}`);
        }
    }
}

run();
