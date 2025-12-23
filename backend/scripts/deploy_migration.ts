
import { Client } from 'pg';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const run = async () => {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
        console.error('❌ DATABASE_URL not found in environment');
        process.exit(1);
    }

    const client = new Client({
        connectionString: dbUrl,
    });

    try {
        await client.connect();
        console.log('✅ Connected to database');

        const sqlPath = path.join(__dirname, '../migrations/043_vapi_calls.sql');
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('running migration...');
        await client.query(sql);
        console.log('✅ Migration executed successfully');
    } catch (err: any) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await client.end();
    }
};

run();
