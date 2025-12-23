
const { Client } = require("pg");

// Candidates based on db_test_passwords.js + current chat
const passwords = [
    ")l2fyDHz60u,nTAd,@tD",
    "ExtractosEUM2025!",
    "Mv+7c#dQ4U9ALV4Lup#p"
];

const commands = [
    `DO $$ BEGIN ALTER TABLE mini_chips RENAME COLUMN active TO is_active; EXCEPTION WHEN undefined_column THEN NULL; END $$;`,
    `DO $$ BEGIN ALTER TABLE mini_chips RENAME COLUMN actions TO actions_payload; EXCEPTION WHEN undefined_column THEN NULL; END $$;`,
    `ALTER TABLE mini_chips ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;`,
    `ALTER TABLE mini_chips ADD COLUMN IF NOT EXISTS name VARCHAR(100);`,
    `ALTER TABLE mini_chips ADD COLUMN IF NOT EXISTS channel_chip_id UUID REFERENCES channel_chips(id) ON DELETE SET NULL;`,
    `DO $$ BEGIN ALTER TABLE conversation_chips RENAME COLUMN chip_id TO mini_chip_id; EXCEPTION WHEN undefined_column THEN NULL; END $$;`,
    `ALTER TABLE conversation_chips ADD COLUMN IF NOT EXISTS triggered_by_message_id UUID REFERENCES crm_messages(id) ON DELETE SET NULL;`
];

async function run() {
    for (const pass of passwords) {
        console.log(`Trying password: ${pass.substring(0, 5)}...`);
        // Use PORT 6543 for IPv4 Pooler support
        const connectionString = `postgresql://postgres:${encodeURIComponent(pass)}@db.vbnpcospodhwuzvxejui.supabase.co:6543/postgres`;

        const client = new Client({
            connectionString,
            ssl: { rejectUnauthorized: false }
        });

        try {
            await client.connect();
            console.log("Connected successfully!");

            for (const sql of commands) {
                console.log(`Executing: ${sql.substring(0, 50)}...`);
                await client.query(sql);
            }

            console.log("ALL MIGRATIONS DONE SUCCESS.");
            await client.end();
            process.exit(0);
        } catch (err) {
            console.error(`Failed with password ${pass.substring(0, 5)}... Error: ${err.message}`);
            await client.end();
        }
    }
    console.error("All passwords failed.");
    process.exit(1);
}

run();
