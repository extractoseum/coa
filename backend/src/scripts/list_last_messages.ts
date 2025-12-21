
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('--- LAST 5 MSGS IN CONV ---');
    const { data, error } = await supabase.from('crm_messages')
        .select('content, created_at, direction')
        .eq('conversation_id', '32fa3a3c-1370-4bd3-9bf2-fae593f64842')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) console.error('Error:', error);
    else console.log(data);
}

check();
