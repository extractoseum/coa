
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('--- SEARCHING FOR Inbound_Test_Final_00003 ---');
    const { data: msg, error: msgError } = await supabase
        .from('crm_messages')
        .select('*')
        .ilike('content', '%Inbound_Test_Final_00003%');

    if (msgError) console.error('Msg Error:', msgError);
    else console.log('Message Found:', msg);
}

check();
