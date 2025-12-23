const { Client } = require("pg");
const passwords = ["ExtractosEUM2025!", "Mv+7c#dQ4U9ALV4Lup#p", ")l2fyDHz60u,nTAd,@tD"];
async function main() {
    for (const pass of passwords) {
        console.log("Testing: " + pass);
        const connectionString = `postgresql://postgres:${encodeURIComponent(pass)}@db.vbnpcospodhwuzvxejui.supabase.co:6543/postgres`;
        const client = new Client({
            connectionString,
            ssl: { rejectUnauthorized: false }
        });
        try {
            await client.connect();
            console.log("SUCCESS with: " + pass);
            await client.end();
            process.exit(0);
        } catch (err) {
            console.log("FAIL: " + err.message);
        }
    }
    console.log("All passwords failed.");
    process.exit(1);
}
main();
