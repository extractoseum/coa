import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import dns from 'dns/promises';
import { URL } from 'url';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function runForceMigration() {
    const migrationPath = process.argv[2];
    if (!migrationPath) {
        console.error('Usage: ts-node force_migration_ipv4.ts <path-to-sql-file>');
        process.exit(1);
    }

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('DATABASE_URL not found in env');
        process.exit(1);
    }

    // Parse URL and resolve hostname to IPv4
    const url = new URL(dbUrl);
    console.log(`Resolving ${url.hostname}...`);

    try {
        const addresses = await dns.resolve4(url.hostname);
        if (addresses.length === 0) {
            throw new Error('No IPv4 addresses found');
        }
        const ip = addresses[0];
        console.log(`Resolved to ${ip}`);

        // Replace hostname with IP in connection string
        url.hostname = ip;
        const ipv4ConnectionString = url.toString();

        const client = new Client({
            connectionString: ipv4ConnectionString,
            ssl: { rejectUnauthorized: false }
        });

        await client.connect();
        console.log('Connected via IPv4!');

        const sql = fs.readFileSync(migrationPath, 'utf8');
        await client.query(sql);
        console.log('Migration executed successfully!');

        await client.end();
    } catch (err) {
        console.error('Migration failed:', err);
        process.exit(1);
    }
}

runForceMigration();
