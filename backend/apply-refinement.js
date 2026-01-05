const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    const migrationFile = 'migrations/056_refine_indicators_view.sql';
    console.log(`\n=== Applying ${migrationFile} ===`);
    const sql = fs.readFileSync(path.resolve(migrationFile), 'utf8');

    console.log('Trying rpc("run_sql", { sql: ... })');
    const { data, error } = await supabase.rpc('run_sql', { sql: sql });

    if (error) {
        console.error(`❌ FAILED:`, error.message);
        console.log('Trying rpc("exec_sql", { sql: ... })');
        const { error: error2 } = await supabase.rpc('exec_sql', { sql: sql });
        if (error2) {
            console.error(`❌ FAILED AGAIN:`, error2.message);
        } else {
            console.log(`✅ SUCCESS via exec_sql`);
        }
    } else {
        console.log(`✅ SUCCESS via run_sql`);
    }
}

run();
