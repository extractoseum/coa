
const { createClient } = require('@supabase/supabase-js');
const { config } = require('dotenv');
const path = require('path');

config({ path: path.resolve(__dirname, '../../.env') });

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
    console.error("Missing credentials.");
    process.exit(1);
}

const supabase = createClient(url, key);

async function check() {
    try {
        console.log("Checking mini_chips schema...");
        // Fetch 1 row or use explain if possible? No, explain not supported via client.
        // We'll insert a dummy row to define the schema? No, that's messy.
        // We'll try to select 'active' and 'is_active'.

        const { data, error } = await supabase
            .from('mini_chips')
            .select('*')
            .limit(1);

        if (error) {
            console.error("Error fetching mini_chips:", error.message);
        } else if (data.length > 0) {
            console.log("Found row. Keys:", Object.keys(data[0]));
        } else {
            console.log("Table is empty. Cannot deduce keys from data.");
            // Try to force an error?
            const { error: err2 } = await supabase.from('mini_chips').select('active').limit(1);
            console.log("Select 'active' error:", err2 ? err2.message : "None (Field exists)");


            const fieldsToCheck = ['actions', 'is_global', 'name', 'channel_chip_id'];
            for (const f of fieldsToCheck) {
                const { error: err } = await supabase.from('mini_chips').select(f).limit(1);
                console.log(`Select '${f}' error:`, err ? err.message : "None (Field exists)");
            }

            console.log("Checking conversation_chips schema...");
            const { error: errCC } = await supabase.from('conversation_chips').select('mini_chip_id').limit(1);
            console.log("Select 'mini_chip_id' error:", errCC ? errCC.message : "None (Field exists)");

            const { error: errCC2 } = await supabase.from('conversation_chips').select('chip_id').limit(1);
            console.log("Select 'chip_id' error:", errCC2 ? errCC2.message : "None (Field exists)");
        }

    } catch (e) {
        console.error(e);
    }
}

check();
