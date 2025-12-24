
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
    console.error('Usage: ts-node execute_sql_simple.ts <filename_in_migrations_dir>');
    process.exit(1);
}

async function run() {
    try {
        console.log('Connecting to database (IPv6/Pooler)...');
        // Mask password for logging
        const url = new URL(connectionString!);
        console.log(`Target: ${url.hostname}:${url.port}`);

        const client = new Client({
            connectionString: connectionString,
            ssl: { rejectUnauthorized: false }
        });

        try {
            await client.connect();
        } catch (initialErr: any) {
            console.warn(`Initial connection failed: ${initialErr.message}`);
            if (url.port === '6543') {
                console.log('Retrying with Port 5432 (Direct Connection)...');
                await client.end().catch(() => { });

                // Construct new connection string
                url.port = '5432';
                const clientDirect = new Client({
                    connectionString: url.toString(),
                    ssl: { rejectUnauthorized: false }
                });
                await clientDirect.connect();
                console.log('Connected via Port 5432!');

                // Use the direct client
                return execute(clientDirect, sqlFile);
            }
            throw initialErr;
        }

        await execute(client, sqlFile);

    } catch (err) {
        console.error('Error executing SQL:', err);
        process.exit(1);
    }
}

async function execute(client: Client, fileName: string) {
    const filePath = path.join(__dirname, '../../migrations', fileName);
    console.log(`Reading SQL file: ${filePath}`);
    const sql = fs.readFileSync(filePath, 'utf-8');

    console.log('Executing SQL...');
    await client.query(sql);
    console.log('Success!');
    await client.end();
}

run();
