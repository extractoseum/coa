
const { Client } = require('pg');

async function check() {
    const connectionString = "postgresql://postgres:ExtractosEUM2025%21@db.vbnpcospodhwuzvxejui.supabase.co:5432/postgres";
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    try {
        const handles = ['bdelatorre8@gmail.com', '525567885994'];
        const res = await client.query('SELECT handle, name, ltv FROM crm_contact_snapshots WHERE handle = ANY($1)', [handles]);
        console.log('Snapshots:');
        console.table(res.rows);

        const res2 = await client.query('SELECT contact_handle FROM conversations LIMIT 10');
        console.log('Recent handles in conversations:');
        console.table(res2.rows);
    } finally {
        await client.end();
    }
}

check().catch(console.error);
