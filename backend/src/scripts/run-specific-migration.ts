
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import dns from 'dns';

// Force IPv4
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder('ipv4first');
}

// Load env 
dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration() {
    const migrationPath = process.argv[2];
    if (!migrationPath) {
        console.error('Usage: ts-node run-specific-migration.ts <path-to-sql-file>');
        process.exit(1);
    }

    console.log(`Reading migration: ${migrationPath}`);
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('Executing SQL...');
    // Supabase JS client doesn't support raw SQL query directly on public schema easily without RPC
    // But we can try to use a specialized RPC function if it exists, or use the pg/postgres library.
    // However, given the environment, let's try to see if we can use a direct connection string or if there is an rpc setup.
    // Since we don't have pg installed in package.json (checked earlier), we will assume there is an 'exec_sql' RPC or similar used in other scripts.

    // Wait, let's check how other migrations were run.
    // Actually, looking at the project, usually there is a direct DB connection or we use the dashboard.
    // BUT since I am an agent, I can use the `postgres` library if installed or just use the Supabase "Rest" interface if I had a function.

    // ALTERNATIVE: Use the `postgres` library if available in node_modules, or just `pg`.
    // Let's assume `pg` is not available.
    // I will try to use the `rpc` method if 'exec_sql' exists, otherwise I'll fail.

    // BETTER APPROACH FOR NOW: 
    // Just run it via `psql` if I had access, but I don't.
    // I will use `npm install pg` to ensure I can run it? No, that's too invasive.

    // Let's verify if `test-db.ts` uses any raw query.
    // It seems `test-db.ts` uses `supabase.from...`.

    // CRITICAL: The user's backend code `index.ts` or `supabase.ts` might verify connection.

    // HACK: Since I cannot run raw SQL easily via supabase-js without an RPC, 
    // I will ask the user to run it OR I will try to see if I can use a generic "run_sql" function if one was created in a previous session (Knowledge Base?).

    // WAIT! I recall seeing `migrations/001...`.
    // Let's look for a `db.ts` or similar that connects.

    // FOR THIS SPECIFIC TASK: 
    // I will use the `postgres` connection string if available in ENV.

    const { Client } = require('pg'); // Dynamic require to see if it works

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        await client.query(sql);
        console.log('Migration executed successfully!');
    } catch (err) {
        console.error('Error executing migration:', err);
    } finally {
        await client.end();
    }
}

runMigration();
