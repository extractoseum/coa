
import { Client } from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { URL } from 'url';

dotenv.config({ path: path.join(__dirname, '../../.env') });

async function checkData() {
    const connectionString = process.env.DATABASE_URL;
    const url = new URL(connectionString!);
    if (url.port === '6543') url.port = '5432';

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
        const handles = ['bdelatorre8@gmail.com', '525567885994'];
        console.log('Checking handles:', handles);

        const res = await client.query('SELECT * FROM crm_contact_snapshots WHERE handle = ANY($1)', [handles]);
        console.log('Snapshots Found:');
        console.table(res.rows);

        const res2 = await client.query('SELECT * FROM conversations WHERE contact_handle = ANY($1)', [handles]);
        console.log('Conversations Found:');
        console.table(res2.rows.map(r => ({ id: r.id, handle: r.contact_handle, facts: JSON.stringify(r.facts).substring(0, 50) })));

    } catch (err) {
        console.error(err);
    } finally {
        await client.end();
    }
}

checkData();
