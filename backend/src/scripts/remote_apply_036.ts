import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function runMigration() {
    // Port 5432 is better for direct DDL usually
    const dbUrl = process.env.DATABASE_URL || "postgresql://postgres:ExtractosEUM2025%21@db.vbnpcospodhwuzvxejui.supabase.co:6543/postgres";

    // Replace 6543 with 5432 for stability if needed, or keep as is
    const connectionString = dbUrl.includes(':6543') ? dbUrl.replace(':6543', ':5432') : dbUrl;

    console.log(`Connecting to DB (Port ${connectionString.includes(':5432') ? '5432' : '6543'})...`);

    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        await client.connect();
        console.log('✅ Connected to database.');

        // Migration file path (relative to this script in dist/scripts)
        const sqlPath = path.join(__dirname, '../../migrations/036_omnichannel_orchestrator.sql');
        if (!fs.existsSync(sqlPath)) {
            throw new Error(`Migration file not found at ${sqlPath}`);
        }

        const sql = fs.readFileSync(sqlPath, 'utf8');
        console.log('🚀 Executing migration 036...');

        await client.query(sql);

        console.log('✨ Phase 0 Migration Applied Successfully!');

    } catch (error: any) {
        console.error('❌ Migration 036 Failed:', error.message);
        if (error.detail) console.error('Detail:', error.detail);
        if (error.hint) console.error('Hint:', error.hint);
    } finally {
        await client.end();
    }
}

runMigration();
