
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('--- CHECKING MSG: Sp_test_8374774 ---');
    const { data: msg, error: msgError } = await supabase
        .from('crm_messages')
        .select('*')
        .ilike('content', '%Sp_test_8374774%');

    if (msgError) console.error('Msg Error:', msgError);
    else console.log('Message Found:', msg);

    console.log('--- CHECKING CONV: 3327177432 ---');
    const { data: conv, error: convError } = await supabase
        .from('conversations')
        .select('*')
        .eq('contact_handle', '3327177432')
        .maybeSingle();

    if (convError) console.error('Conv Error:', convError);
    else console.log('Conversation:', conv);

    // Also check logs for this content if possible via grep (manual step usually)
}

check();
