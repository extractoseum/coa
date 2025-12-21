
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function listMessages() {
    const convId = '32fa3a3c-1370-4bd3-9bf2-fae593f64842';
    console.log(`--- MENSAJES PARA CONV: ${convId} ---`);
    const { data: messages, error } = await supabase
        .from('crm_messages')
        .select('*')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error:', error);
        return;
    }

    messages?.forEach(m => {
        console.log(`[${m.created_at}] ${m.direction.toUpperCase()} | ${m.content}`);
    });
}

listMessages();
