
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTable() {
    console.log('Checking for knowledge_base table...');

    // Try to select from the table. 
    // If it doesn't exist, Supabase/Postgres will return an error 404 or 42P01 (undefined_table)
    const { data, error } = await supabase
        .from('knowledge_base')
        .select('id')
        .limit(1);

    if (error) {
        console.error('❌ Check Failed:', error.message);
        console.log('It seems the table does not exist yet.');
        console.log('Please run the SQL script in your Supabase Dashboard.');
        process.exit(1);
    } else {
        console.log('✅ Success! Table "knowledge_base" exists.');
        console.log('Ready to ingest data.');
        process.exit(0);
    }
}

checkTable();
