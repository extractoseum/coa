
import { Client } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { URL } from 'url';

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    console.error('DATABASE_URL is not set in .env');
    process.exit(1);
}

const sqlFile = process.argv[2];
if (!sqlFile) {
    console.error('Usage: ts-node execute_sql.ts <filename_in_migrations_dir>');
    process.exit(1);
}

async function run() {
    try {
        const url = new URL(connectionString!);

        // Try switching to port 5432 (Direct) if it is 6543 (Pooler)
        // Poolers are sometimes IPv6 only. Direct might have IPv4.
        if (url.port === '6543') {
            console.log('Switching from port 6543 (Pooler) to 5432 (Direct) to attempt IPv4 connection...');
            url.port = '5432';
        }

        // Force IPv4 Resolution
        const dns = require('dns').promises;
        const { address } = await dns.lookup(url.hostname, { family: 4 });
        console.log(`Resolved ${url.hostname} to IPv4: ${address}`);

        // Update hostname in connection string or client config
        // Note: pg client might re-resolve if we pass the hostname. 
        // We will pass the IP as host and keep text for SSL but 'host' in connection string overrides.
        // Actually best way is to construct config object.

        const client = new Client({
            host: address,
            port: parseInt(url.port),
            user: url.username,
            password: url.password,
            database: url.pathname.substring(1), // remove leading slash
            ssl: { rejectUnauthorized: false, servername: url.hostname } // SNI needed for Supabase
        });

        await client.connect();

        const filePath = path.join(__dirname, '../../migrations', sqlFile);
        console.log(`Reading SQL file: ${filePath}`);
        const sql = fs.readFileSync(filePath, 'utf-8');

        console.log('Executing SQL...');
        await client.query(sql);
        console.log('Success!');
        await client.end();

    } catch (err) {
        console.error('Error executing SQL:', err);
        process.exit(1);
    }
}

run();
