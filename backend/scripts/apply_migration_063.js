const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { URL } = require('url');
const dns = require('dns').promises;

dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL missing in .env');
        process.exit(1);
    }

    try {
        console.log('Initializing hardened PG client...');
        const url = new URL(connectionString);

        // Port pivot logic from execute_sql.ts
        // Poolers (6543) often lack IPv4, switching to Direct (5432) + IPv4 resolution
        // NOTE: 5432 timed out. Falling back to 6543 (Pooler) which might work with IPv4 on this host.
        /*
        if (url.port === '6543') {
            console.log('Switching port 6543 -> 5432 for robust IPv4 connection');
            url.port = '5432';
        }
        */

        // SNI Pivot: Remove 'db.' prefix if present to bypass DNS blockers
        if (url.hostname.startsWith('db.')) {
            console.log(`Applying SNI Pivot: Removing 'db.' from ${url.hostname}`);
            url.hostname = url.hostname.replace('db.', '');
        }

        // IPv4 resolve
        console.log(`Resolving hostname: ${url.hostname}`);
        const { address } = await dns.lookup(url.hostname, { family: 4 });
        console.log(`Resolved ${url.hostname} -> ${address}`);

        const client = new Client({
            host: address,
            port: parseInt(url.port),
            user: url.username,
            password: url.password,
            database: url.pathname.substring(1),
            ssl: { rejectUnauthorized: false, servername: url.hostname }
        });

        await client.connect();
        console.log('Connected to database.');

        const sqlPath = path.join(__dirname, '../migrations/063_ghostbuster_protocol.sql');
        console.log(`Reading migration: ${sqlPath}`);
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing SQL...');
        await client.query(sql);
        console.log('✅ Migration 063 Applied Successfully');
        await client.end();

    } catch (err) {
        console.error('❌ Migration Failed:', err);
        process.exit(1);
    }
}

run();
