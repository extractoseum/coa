
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const main = async () => {
    const convId = '32fa3a3c-1370-4bd3-9bf2-fae593f64842';

    // 1. Check Column Config
    const { data: conv } = await supabase.from('conversations').select('column_id').eq('id', convId).single();
    if (conv) {
        const { data: col } = await supabase.from('crm_columns').select('voice_profile').eq('id', conv.column_id).single();
        console.log('Current Column Voice Profile:', JSON.stringify(col?.voice_profile, null, 2));
    }

    // 2. Check Recent Messages
    const { data: messages } = await supabase
        .from('crm_messages')
        .select('id, content, external_id, status, role, direction, created_at')
        .eq('conversation_id', convId)
        .order('created_at', { ascending: false })
        .limit(10);

    console.log('Recent Messages:');
    messages?.forEach(m => {
        console.log(`[${m.created_at}] ID: ${m.id}, Ext: ${m.external_id}, Role: ${m.role}, Content: ${m.content.substring(0, 40)}`);
    });
};

main();
