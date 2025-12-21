import { supabase } from '../config/supabase';
import fs from 'fs';

async function tryRpcMigration() {
    const migrationPath = process.argv[2];
    if (!migrationPath) {
        console.error('Usage: ts-node try_rpc_migration.ts <path-to-sql-file>');
        process.exit(1);
    }

    console.log(`Reading migration: ${migrationPath}`);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Attempting to run via RPC exec_sql...');
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
        console.error('RPC Error:', error);

        // Try another common name 'run_sql' or 'query'
        console.log('Retrying with run_sql...');
        const { data: d2, error: e2 } = await supabase.rpc('run_sql', { sql_query: sql });
        if (e2) {
            console.error('RPC run_sql Failed:', e2);
            process.exit(1);
        }
    }

    console.log('Migration executed successfully via RPC!');
}

tryRpcMigration();
