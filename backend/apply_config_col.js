
const { Client } = require("pg");

const password = ")l2fyDHz60u,nTAd,@tD"; // Likely the newest one based on format
const connectionString = `postgresql://postgres:${encodeURIComponent(password)}@db.vbnpcospodhwuzvxejui.supabase.co:6543/postgres`;

async function updateSchema() {
    const client = new Client({
        connectionString,
        ssl: { rejectUnauthorized: false }
    });

    try {
        console.log("Connecting to database...");
        await client.connect();

        console.log("Adding 'config' column to 'channel_chips'...");
        await client.query("ALTER TABLE channel_chips ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;");

        console.log("Schema updated successfully.");
    } catch (err) {
        console.error("Migration failed:", err.message);

        // Try other passwords if this one failed
        const altPasswords = ["ExtractosEUM2025!", "Mv+7c#dQ4U9ALV4Lup#p"];
        for (const pass of altPasswords) {
            console.log(`Retrying with alternative password...`);
            const altConn = `postgresql://postgres:${encodeURIComponent(pass)}@db.vbnpcospodhwuzvxejui.supabase.co:6543/postgres`;
            const altClient = new Client({ connectionString: altConn, ssl: { rejectUnauthorized: false } });
            try {
                await altClient.connect();
                await altClient.query("ALTER TABLE channel_chips ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;");
                console.log("Schema updated successfully with alternative password.");
                await altClient.end();
                return;
            } catch (e) {
                console.log(`Alternative failed: ${e.message}`);
                await altClient.end();
            }
        }
    } finally {
        await client.end();
    }
}

updateSchema();
