import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function runMigration() {
    const connectionString = "postgresql://postgres:ExtractosEUM2025%21@db.vbnpcospodhwuzvxejui.supabase.co:6543/postgres";
    const client = new Client({
        connectionString: connectionString,
    });

    try {
        await client.connect();
        console.log('Connected to database.');

        const sqlPath = path.join(__dirname, '../../migrations/036_omnichannel_orchestrator.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing migration 036...');
        await client.query(sql);
        console.log('Migration 036 applied successfully.');

    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

runMigration();
