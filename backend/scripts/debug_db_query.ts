
import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function run() {
    // The ID from the successful test run
    const ID_TO_CHECK = 'f61d1bf9-7ae0-40f1-9778-404557884d68';

    console.log(`Checking Message ID: ${ID_TO_CHECK}`);

    const { data, error } = await supabase
        .from('crm_messages')
        .select('*')
        .eq('id', ID_TO_CHECK);

    if (error) {
        console.error('Error querying messages:', error);
    } else {
        if (data.length === 0) {
            console.log('No matching message found.');
        } else {
            console.log('Found matching message:');
            data.forEach(msg => {
                console.log(`\nID: ${msg.id}`);
                console.log(`Role: ${msg.role}`);
                console.log(`Direction: ${msg.direction}`);
                console.log(`Content: ${msg.content}`);
                console.log(`Voice Analysis:`);
                console.dir(msg.voice_analysis, { depth: null });
            });
        }
    }
}

run();
