// Script to run database migrations
require('dotenv').config();
const { Client } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('❌ Missing DATABASE_URL in .env');
    console.error('   Format: postgresql://postgres:PASSWORD@db.xxx.supabase.co:5432/postgres');
    process.exit(1);
}

const client = new Client({
    connectionString: connectionString,
    ssl: { rejectUnauthorized: false }
});

async function migrate() {
    try {
        console.log('Connecting to database...');
        await client.connect();

        console.log('Executing migration...');
        const res = await client.query('ALTER TABLE crm_contact_snapshots ADD COLUMN IF NOT EXISTS avatar_url text;');

        console.log('Migration successful:', res);
    } catch (err) {
        console.error('Migration failed:', err);
    } finally {
        await client.end();
    }
}

migrate();
