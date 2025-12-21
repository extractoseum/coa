
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Must use service role to insert
const supabase = createClient(supabaseUrl, supabaseKey);

async function trigger() {
    const { data: msg, error } = await supabase
        .from('crm_messages')
        .insert({
            conversation_id: '32fa3a3c-1370-4bd3-9bf2-fae593f64842',
            direction: 'inbound',
            role: 'user',
            message_type: 'text',
            content: '🧪 Test Message from Realtime Debugger ' + new Date().toISOString(),
            status: 'read'
        })
        .select()
        .single();

    if (error) console.error('Insert Error:', error);
    else console.log('Inserted Message:', msg.id);
}

trigger();
