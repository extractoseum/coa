
const { Client } = require('pg');

async function check() {
    const connectionString = "postgresql://postgres:ExtractosEUM2025%21@db.vbnpcospodhwuzvxejui.supabase.co:5432/postgres";
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    await client.connect();
    try {
        console.log('--- Snapshot Data Check ---');
        const handles = ['bdelatorre8@gmail.com', '528442938178', '524424003642'];
        const res = await client.query('SELECT handle, name, ltv, risk_level FROM crm_contact_snapshots WHERE handle = ANY($1)', [handles]);
        console.log('Found Snapshots:', res.rows.length);
        console.table(res.rows);

        console.log('\n--- Sample Snapshots ---');
        const sampleRes = await client.query('SELECT handle, name, ltv FROM crm_contact_snapshots LIMIT 10');
        console.table(sampleRes.rows);
    } finally {
        await client.end();
    }
}

check().catch(console.error);
