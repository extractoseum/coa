
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('--- SEARCHING FOR Sp_test_839999 ---');
    const { data: msg, error: msgError } = await supabase
        .from('crm_messages')
        .select('*')
        .ilike('content', '%Sp_test_839999%');

    if (msgError) console.error('Msg Error:', msgError);
    else console.log('Message Found:', msg);

    // Also check last message in conv
    console.log('--- CHECKING CONV LAST MSG ---');
    const { data: conv } = await supabase.from('conversations').select('*').eq('contact_handle', '3327177432').single();
    console.log('Conversation:', conv);
}

check();
