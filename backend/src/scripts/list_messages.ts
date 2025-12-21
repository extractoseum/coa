
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMessages() {
    // timestamp 2 mins ago
    const timeAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();

    const { data: msgs, error } = await supabase
        .from('crm_messages')
        .select('created_at, role, content, direction')
        .gt('created_at', timeAgo)
        .order('created_at', { ascending: false })
        .limit(10);

    if (error) console.error('Error:', error);
    else console.log('Last 2 mins messages:', JSON.stringify(msgs, null, 2));
}

checkMessages();
