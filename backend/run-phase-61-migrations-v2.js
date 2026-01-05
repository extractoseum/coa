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

        // Pattern 1: exec_sql (sql_query)
        console.log('Trying rpc("exec_sql", { sql_query: ... })');
        let { error } = await supabase.rpc('exec_sql', { sql_query: sql });

        if (error) {
            console.log(`Pattern 1 failed: ${error.message}`);
            // Pattern 2: run_sql (sql_query)
            console.log('Trying rpc("run_sql", { sql_query: ... })');
            const { error: e2 } = await supabase.rpc('run_sql', { sql_query: sql });
            error = e2;
        }

        if (error) {
            console.log(`Pattern 2 failed: ${error.message}`);
            // Pattern 3: exec (query) - for completeness
            console.log('Trying rpc("exec", { query: ... })');
            const { error: e3 } = await supabase.rpc('exec', { query: sql });
            error = e3;
        }

        if (error) {
            console.error(`❌ ALL PATTERNS FAILED for ${migrationFile}:`, error.message);
        } else {
            console.log(`✅ SUCCESS ${migrationFile}`);
        }
    }
}

run();
