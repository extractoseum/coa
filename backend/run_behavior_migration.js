
const { Client } = require('pg');
const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

async function run() {
    console.log('[MIGRATION] Starting Browsing Behavior migration...');

    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is missing in environment variables.');
    }

    const migrationFile = path.join(__dirname, 'migrations', '033_browsing_behavior.sql');
    if (!fs.existsSync(migrationFile)) {
        throw new Error(`Migration file not found: ${migrationFile}`);
    }

    const sql = fs.readFileSync(migrationFile, 'utf8');

    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log('[MIGRATION] Connecting to database...');
        await client.connect();

        console.log('[MIGRATION] Executing SQL...');
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');

        console.log('[MIGRATION] Success! browsing_events table created.');
    } catch (error) {
        console.log('[MIGRATION] Error details:', error.message);
        console.log('[MIGRATION] Rolling back...');
        await client.query('ROLLBACK').catch(() => { });
        // If it's "already exists", we don't need to throw
        if (error.message.includes('already exists')) {
            console.log('[MIGRATION] Table already exists, proceeding.');
        } else {
            throw error;
        }
    } finally {
        await client.end();
    }
}

run().catch(err => {
    console.error('[MIGRATION] [ERROR]', err.message);
    process.exit(1);
});
