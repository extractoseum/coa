const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const rpcs = ['run_sql', 'exec_sql', 'exec', 'sql', 'query', 'execute'];
const params = ['sql', 'query', 'sql_query', 'body', 'statement'];

async function brute() {
    for (const rpc of rpcs) {
        for (const param of params) {
            console.log(`Trying rpc("${rpc}", { ${param}: "SELECT 1" })`);
            try {
                const { data, error } = await supabase.rpc(rpc, { [param]: "SELECT 1" });
                if (!error) {
                    console.log(`✅ SUCCESS: rpc("${rpc}", { ${param}: ... })`);
                    process.exit(0);
                } else {
                    if (error.code !== 'PGRST202') {
                        console.log(`⚠️  FOUND RPC but param error?: ${error.message}`);
                    }
                }
            } catch (e) { }
        }
    }
    console.log('❌ All attempts failed.');
}

brute();
