
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// Load env specific to backend
dotenv.config({ path: path.resolve(__dirname, '../../backend/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Supabase credentials missing. Check .env path.');
    console.log('Current path:', __dirname);
    console.log('Target .env:', path.resolve(__dirname, '../../backend/.env'));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const MIGRATION_FILE = path.join(__dirname, '../migrations/050_fix_rls_authenticated.sql');

async function run() {
    console.log(`[RpcMigration] Applying: ${MIGRATION_FILE}`);

    try {
        const sql = fs.readFileSync(MIGRATION_FILE, 'utf8');
        console.log(`[RpcMigration] Length: ${sql.length} chars`);

        // Try 'exec' RPC first (based on run-migration.js)
        // If that fails, try 'run_sql'
        let { error } = await supabase.rpc('exec', { query: sql });

        if (error && error.message.includes('function "exec" does not exist')) {
            console.log('[RpcMigration] "exec" RPC not found, trying "run_sql"...');
            const { error: error2 } = await supabase.rpc('run_sql', { sql: sql });
            error = error2;
        }

        if (error) {
            console.error('[RpcMigration] FAILED:', error);
        } else {
            console.log('[RpcMigration] SUCCESS! Migration applied.');
        }

    } catch (err) {
        console.error('[RpcMigration] Unexpected error:', err);
    }
}

run();
