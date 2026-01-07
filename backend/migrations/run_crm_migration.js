
const { Client } = require('pg');
const fs = require('fs');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config();

async function run() {
    console.log('[MIGRATION] Starting CRM core migration...');

    if (!process.env.DATABASE_URL) {
        throw new Error('DATABASE_URL is missing in environment variables.');
    }

    // Get migration file from args or default
    const targetFile = process.argv[2] || '061_oracle_predictive_restocking.sql';
    const migrationFile = path.join(__dirname, targetFile);

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
        // We'll execute the whole block. Wrap in transaction if needed, but the SQL already has some safety.
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('COMMIT');

        console.log('[MIGRATION] Success! CRM tables and initial columns created.');
    } catch (error) {
        console.log('[MIGRATION] Rolling back due to error.');
        await client.query('ROLLBACK').catch(() => { });
        throw error;
    } finally {
        await client.end();
    }
}

run().catch(err => {
    console.error('[MIGRATION] [ERROR]', err.message);
    process.exit(1);
});
