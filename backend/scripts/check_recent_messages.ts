
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const main = async () => {
    const convId = '32fa3a3c-1370-4bd3-9bf2-fae593f64842';
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    const { data: messages, error } = await supabase
        .from('crm_messages')
        .select('*')
        .eq('conversation_id', convId)
        .gte('created_at', fifteenMinutesAgo)
        .order('created_at', { ascending: false });

    if (error) return console.error(error);

    console.log(`Found ${messages?.length || 0} messages in the last 15 minutes.`);
    messages?.forEach(m => {
        console.log(`[${m.created_at}] Type: ${m.message_type}, Role: ${m.role}, Content: ${m.content.substring(0, 50)}, Direction: ${m.direction}`);
    });
};

main();
