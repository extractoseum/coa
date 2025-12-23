const { createClient } = require('@supabase/supabase-js');
const { config } = require('dotenv');
const path = require('path');

// Load env from one level up (since this will be in dist/scripts or dist/)
// Trying standard .env location
config({ path: path.resolve(__dirname, '../.env') });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("Checking DB connection...");
console.log("URL:", url ? "Set" : "Missing");
console.log("Key:", key ? "Set (Length: " + key.length + ")" : "Missing");

if (!url || !key) {
    console.error("Missing credentials. Aborting.");
    process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
    try {
        console.log("Querying system_logs...");
        const { count, error } = await supabase
            .from('system_logs')
            .select('*', { count: 'exact', head: true });

        if (error) {
            console.error("Query Error:", error.message);
            console.error(error);
        } else {
            console.log("Total Rows in system_logs:", count);

            // Print first row to see structure
            const { data: firstRows } = await supabase.from('system_logs').select('*').limit(1);
            if (firstRows && firstRows.length > 0) {
                console.log("First Row Structure:", JSON.stringify(firstRows[0], null, 2));
            } else {
                console.log("Table is empty (despite count?)");
            }
        }

        // Try inserting a test log
        console.log("Attempting direct insert...");
        const { data, error: insertError } = await supabase
            .from('system_logs')
            .insert({
                event: 'debug_script_test',
                level: 'info',
                trace_id: 'debug-' + Date.now(),
                metadata: { source: 'debug_db.js' },
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) {
            console.error("Insert Error:", insertError.message);
        } else {
            console.log("Insert Success:", data);
        }

    } catch (e) {
        console.error("Exception:", e);
    }
}

check();
