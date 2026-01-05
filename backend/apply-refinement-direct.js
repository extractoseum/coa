const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connectionString = "postgresql://postgres:ExtractosEUM2025%21@vbnpcospodhwuzvxejui.supabase.co:5432/postgres";

const client = new Client({
    connectionString,
    ssl: { rejectUnauthorized: false }
});

async function runRefinement() {
    try {
        console.log('Connecting to database...');
        await client.connect();

        const migrationFile = 'migrations/056_refine_indicators_view.sql';
        console.log(`\n--- Applying ${migrationFile} ---`);
        const sql = fs.readFileSync(path.resolve(migrationFile), 'utf8');

        await client.query(sql);
        console.log(`✅ ${migrationFile} applied successfully.`);
    } catch (err) {
        console.error('Fatal refinement error:', err);
    } finally {
        await client.end();
        console.log('\nProcess finished.');
    }
}

runRefinement();
