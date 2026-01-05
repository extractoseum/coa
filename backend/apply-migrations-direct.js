const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connectionString = "postgresql://postgres:ExtractosEUM2025%21@db.vbnpcospodhwuzvxejui.supabase.co:5432/postgres";

if (!connectionString) {
    console.error('❌ Missing DATABASE_URL in .env');
    process.exit(1);
}

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

const migrations = [
    'migrations/053_smart_card_indicators.sql',
    'migrations/054_message_types_extended.sql',
    'migrations/055_crm_audit_logs.sql'
];

async function runMigrations() {
    try {
        console.log('Connecting to database...');
        await client.connect();

        for (const migrationFile of migrations) {
            console.log(`\n--- Applying ${migrationFile} ---`);
            const sql = fs.readFileSync(path.resolve(migrationFile), 'utf8');

            try {
                await client.query(sql);
                console.log(`✅ ${migrationFile} applied successfully.`);
            } catch (err) {
                console.error(`❌ Error applying ${migrationFile}:`, err.message);
                // Continue to next migration if it's already applied or non-critical error
            }
        }
    } catch (err) {
        console.error('Fatal migration error:', err);
    } finally {
        await client.end();
        console.log('\nMigration process finished.');
    }
}

runMigrations();
