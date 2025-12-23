
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const main = async () => {
    // 1. Get conversation's column
    const convId = '32fa3a3c-1370-4bd3-9bf2-fae593f64842';
    const { data: conv } = await supabase.from('conversations').select('column_id, contact_handle').eq('id', convId).single();

    if (!conv) {
        console.log('Conv not found');
        return;
    }
    console.log('Conv:', conv);

    // 2. Get Column Config
    const { data: col } = await supabase.from('crm_columns').select('*').eq('id', conv.column_id).single();
    console.log('Column:', col);
    console.log('Voice Profile:', JSON.stringify(col.voice_profile, null, 2));
};

main();
