
const { Client } = require('pg');

// Hardcoded connection string from .env I read earlier - Direct Port 5432
const connectionString = 'postgresql://postgres:ExtractosEUM2025%21@db.vbnpcospodhwuzvxejui.supabase.co:5432/postgres';


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
