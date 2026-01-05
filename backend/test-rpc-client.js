const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function test() {
    console.log('Testing rpc("exec", { query: "SELECT 1" })');
    const { data, error } = await supabase.rpc('exec', { query: "SELECT 1" });
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Success:', data);
    }
}

test();
