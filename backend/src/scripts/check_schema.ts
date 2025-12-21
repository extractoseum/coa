
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { URL } from 'url';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function checkSchema() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
        console.error('DATABASE_URL not set');
        return;
    }

    const url = new URL(connectionString);
    if (url.port === '6543') {
        url.port = '5432';
    }

    const dns = require('dns').promises;
    const { address } = await dns.lookup(url.hostname, { family: 4 });

    const client = new Client({
        host: address,
        port: parseInt(url.port),
        user: url.username,
        password: url.password,
        database: url.pathname.substring(1),
        ssl: { rejectUnauthorized: false, servername: url.hostname }
    });

    await client.connect();
    try {
        const res = await client.query(`
            SELECT 
                column_name, 
                data_type, 
                is_nullable
            FROM 
                information_schema.columns
            WHERE 
                table_name = 'conversations'
            ORDER BY ordinal_position;
        `);
        console.log('Conversations Table Columns:');
        console.table(res.rows);

        const resFK = await client.query(`
            SELECT
                tc.table_name, 
                kcu.column_name, 
                ccu.table_name AS foreign_table_name,
                ccu.column_name AS foreign_column_name 
            FROM 
                information_schema.table_constraints AS tc 
                JOIN information_schema.key_column_usage AS kcu
                  ON tc.constraint_name = kcu.constraint_name
                  AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage AS ccu
                  ON ccu.constraint_name = tc.constraint_name
                  AND ccu.table_schema = tc.table_schema
            WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name='conversations';
        `);
        console.log('Conversations Foreign Keys:');
        console.table(resFK.rows);

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

checkSchema();
