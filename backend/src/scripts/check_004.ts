
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('--- SEARCHING FOR Sp_test_83777777_004 ---');
    const { data: msg, error: msgError } = await supabase
        .from('crm_messages')
        .select('*')
        .ilike('content', '%Sp_test_83777777_004%');

    if (msgError) console.error('Msg Error:', msgError);
    else console.log('Message Found:', msg);
}

check();
