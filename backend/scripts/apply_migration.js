const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const migrationFile = process.argv[2];

if (!migrationFile) {
    console.error('Please provide a migration file path');
    process.exit(1);
}

const filePath = path.resolve(migrationFile);

if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
}

const sql = fs.readFileSync(filePath, 'utf8');

async function run() {
    console.log(`Applying migration: ${path.basename(filePath)}`);

    // Attempt to use 'run_sql' RPC as seen in other scripts
    const { error } = await supabase.rpc('run_sql', { sql: sql });

    if (error) {
        console.error('Migration Failed:', error);

        // Fallback: Check if it's a connection issue or syntax
        if (error.message.includes('function "exec" does not exist')) {
            console.error('CRITICAL: The "exec" RPC function is missing in Supabase.');
        }
    } else {
        console.log('Migration Applied Successfully via RPC exec()');
    }
}

run();
